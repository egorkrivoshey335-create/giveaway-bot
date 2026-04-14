import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, GiveawayStatus, GiveawayType, LanguageCode, PublishResultsMode, CaptchaMode } from '@randombeast/database';
import type { GiveawayDraftPayload } from '@randombeast/shared';
import { ErrorCode, generateShortCode, TIER_LIMITS } from '@randombeast/shared';
import { requireUser, getUser } from '../plugins/auth.js';
import { createAuditLog, AuditAction, AuditEntityType } from '../lib/audit.js';
import { getCache, setCache } from '../lib/redis.js';
import { notifyCancelToAll } from '../scheduler/giveaway-lifecycle.js';
import { getUserTier, isTierAtLeast } from '../lib/subscription.js';

// UUID validation regex
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Схема валидации для confirm endpoint
const confirmDraftPayloadSchema = z.object({
  type: z.enum(['STANDARD', 'BOOST_REQUIRED', 'INVITE_REQUIRED', 'CUSTOM', 'MAXIMUM'], {
    errorMap: () => ({ message: 'Выберите тип розыгрыша' }),
  }),
  title: z.string().min(1, 'Введите название розыгрыша'),
  language: z.enum(['ru', 'en', 'kk'], {
    errorMap: () => ({ message: 'Выберите язык' }),
  }),
  postTemplateId: z.string().regex(uuidRegex, 'Выберите шаблон поста').nullable(),
  buttonText: z.string().min(1, 'Введите текст кнопки'),
  winnersCount: z.number().min(1, 'Минимум 1 победитель').max(200, 'Максимум 200 победителей').optional().default(1),
  // Даты: ISO string или null
  startAt: z.string().datetime({ message: 'Некорректный формат даты начала' }).nullable().optional(),
  endAt: z.string().datetime({ message: 'Некорректный формат даты окончания' }).nullable().optional(),
  requiredSubscriptionChannelIds: z.array(z.string()).default([]),
  publishChannelIds: z.array(z.string().regex(uuidRegex)).min(1, 'Выберите минимум 1 канал для публикации'),
  resultsChannelIds: z.array(z.string()).default([]),
  publishResultsMode: z.enum(['SEPARATE_POSTS', 'EDIT_START_POST', 'RANDOMIZER']).default('SEPARATE_POSTS'),
  // Защита от ботов
  captchaMode: z.enum(['OFF', 'SUSPICIOUS_ONLY', 'ALL']).default('SUSPICIOUS_ONLY'),
  livenessEnabled: z.boolean().default(false),
  // Дополнительные билеты
  inviteEnabled: z.boolean().default(false),
  inviteMax: z.number().min(1).max(10000).optional(),
  boostEnabled: z.boolean().default(false),
  boostChannelIds: z.array(z.string().uuid()).optional().default([]),
  storiesEnabled: z.boolean().default(false),
  catalogEnabled: z.boolean().default(false),
});

/**
 * Normalize draft payload before validation:
 * - Convert language to lowercase ('RU' -> 'ru')
 * - Set default arrays if undefined
 * - Set default publishResultsMode
 */
function normalizeDraftPayload(payload: GiveawayDraftPayload | null): Record<string, unknown> {
  if (!payload) return {};

  const normalized: Record<string, unknown> = { ...payload };

  // Normalize language to lowercase
  if (typeof normalized.language === 'string') {
    normalized.language = normalized.language.toLowerCase();
  }

  // Set default arrays
  if (!Array.isArray(normalized.requiredSubscriptionChannelIds)) {
    normalized.requiredSubscriptionChannelIds = [];
  }
  if (!Array.isArray(normalized.publishChannelIds)) {
    normalized.publishChannelIds = [];
  }
  if (!Array.isArray(normalized.resultsChannelIds)) {
    normalized.resultsChannelIds = [];
  }

  // Set default publishResultsMode
  if (!normalized.publishResultsMode) {
    normalized.publishResultsMode = 'SEPARATE_POSTS';
  }

  // Set default winnersCount
  if (typeof normalized.winnersCount !== 'number' || normalized.winnersCount < 1) {
    normalized.winnersCount = 1;
  }

  // Set default captchaMode
  if (!normalized.captchaMode) {
    normalized.captchaMode = 'SUSPICIOUS_ONLY';
  }

  // Set default livenessEnabled
  if (typeof normalized.livenessEnabled !== 'boolean') {
    normalized.livenessEnabled = false;
  }

  // Set defaults for EXTRAS (дополнительные билеты)
  if (typeof normalized.inviteEnabled !== 'boolean') {
    normalized.inviteEnabled = false;
  }
  if (typeof normalized.inviteMax !== 'number' || normalized.inviteMax < 1) {
    normalized.inviteMax = 10;
  }
  if (typeof normalized.boostEnabled !== 'boolean') {
    normalized.boostEnabled = false;
  }
  if (!Array.isArray(normalized.boostChannelIds)) {
    normalized.boostChannelIds = [];
  }
  if (typeof normalized.storiesEnabled !== 'boolean') {
    normalized.storiesEnabled = false;
  }
  if (typeof normalized.catalogEnabled !== 'boolean') {
    normalized.catalogEnabled = false;
  }

  return normalized;
}

/**
 * Format Zod errors for API response
 */
function formatZodErrors(error: z.ZodError): Array<{ field: string; message: string }> {
  return error.errors.map(e => ({
    field: e.path.length > 0 ? e.path.join('.') : 'payload',
    message: e.message,
  }));
}

export const giveawaysRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /giveaways/from-draft/:draftId/confirm
   * Converts a draft to PENDING_CONFIRM status
   */
  fastify.post<{ Params: { draftId: string } }>(
    '/giveaways/from-draft/:draftId/confirm',
    {
      // Allow empty body - all data comes from the draft
      schema: {
        body: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const { draftId } = request.params;

      // Find draft and verify ownership
      const draft = await prisma.giveaway.findFirst({
        where: {
          id: draftId,
          ownerUserId: user.id,
          status: GiveawayStatus.DRAFT,
        },
      });

      if (!draft) {
        return reply.notFound('Draft not found or access denied');
      }

      // Validate draftPayload has all required fields
      const rawPayload = draft.draftPayload as GiveawayDraftPayload | null;
      
      if (!rawPayload || Object.keys(rawPayload).length === 0) {
        return reply.badRequest('Validation failed', [
          { field: 'payload', message: 'Черновик пустой. Заполните данные в мастере.' }
        ]);
      }

      // Normalize payload before validation
      const normalizedPayload = normalizeDraftPayload(rawPayload);

      // Validate with Zod
      const validation = confirmDraftPayloadSchema.safeParse(normalizedPayload);
      
      if (!validation.success) {
        return reply.badRequest('Validation failed', formatZodErrors(validation.error));
      }

      const validatedPayload = validation.data;

      // Tier-based limit checks
      const tier = await getUserTier(user.id);

      const maxWinners = TIER_LIMITS.maxWinners[tier];
      if (validatedPayload.winnersCount > maxWinners) {
        return reply.forbidden(
          `Лимит победителей для тарифа ${tier}: ${maxWinners}. Текущее значение: ${validatedPayload.winnersCount}.`
        );
      }

      const activeGiveawaysCount = await prisma.giveaway.count({
        where: {
          ownerUserId: user.id,
          status: { in: [GiveawayStatus.ACTIVE, GiveawayStatus.SCHEDULED, GiveawayStatus.PENDING_CONFIRM] },
          isSandbox: false,
        },
      });
      const maxActive = TIER_LIMITS.maxActiveGiveaways[tier];
      if (activeGiveawaysCount >= maxActive) {
        return reply.forbidden(
          `Лимит активных розыгрышей для тарифа ${tier}: ${maxActive}. Повысьте подписку.`
        );
      }

      const subscriptionChannels = (validatedPayload as Record<string, unknown>).subscriptionChannelIds;
      if (Array.isArray(subscriptionChannels)) {
        const maxChPerGiveaway = TIER_LIMITS.maxChannelsPerGiveaway[tier];
        if (subscriptionChannels.length > maxChPerGiveaway) {
          return reply.forbidden(
            `Лимит каналов на розыгрыш для тарифа ${tier}: ${maxChPerGiveaway}.`
          );
        }
      }

      const customTasks = (validatedPayload as Record<string, unknown>).customTasks;
      if (Array.isArray(customTasks)) {
        const maxTasks = TIER_LIMITS.maxCustomTasks[tier];
        if (customTasks.length > maxTasks) {
          return reply.forbidden(
            `Лимит кастомных заданий для тарифа ${tier}: ${maxTasks}.`
          );
        }
      }

      if (validatedPayload.livenessEnabled && tier !== 'BUSINESS') {
        return reply.forbidden(
          'Liveness Check доступен только для BUSINESS подписки.'
        );
      }

      if (validatedPayload.publishResultsMode === 'RANDOMIZER' && tier !== 'BUSINESS') {
        return reply.forbidden(
          'Рандомайзер доступен только для BUSINESS подписки.'
        );
      }

      if (validatedPayload.captchaMode === 'ALL' && !isTierAtLeast(tier, 'PLUS')) {
        return reply.forbidden(
          'Режим капчи «Для всех» доступен с подпиской PLUS и выше.'
        );
      }

      // Map string values to Prisma enums
      const giveawayTypeMap: Record<string, GiveawayType> = {
        STANDARD: GiveawayType.STANDARD,
        BOOST_REQUIRED: GiveawayType.BOOST_REQUIRED,
        INVITE_REQUIRED: GiveawayType.INVITE_REQUIRED,
        CUSTOM: GiveawayType.CUSTOM,
        MAXIMUM: GiveawayType.MAXIMUM,
      };
      const languageMap: Record<string, LanguageCode> = {
        ru: LanguageCode.RU,
        en: LanguageCode.EN,
        kk: LanguageCode.KK,
      };
      const publishResultsModeMap: Record<string, PublishResultsMode> = {
        SEPARATE_POSTS: PublishResultsMode.SEPARATE_POSTS,
        EDIT_START_POST: PublishResultsMode.EDIT_START_POST,
        RANDOMIZER: PublishResultsMode.RANDOMIZER,
      };
      const captchaModeMap: Record<string, CaptchaMode> = {
        OFF: CaptchaMode.OFF,
        SUSPICIOUS_ONLY: CaptchaMode.SUSPICIOUS_ONLY,
        ALL: CaptchaMode.ALL,
      };

      const giveawayType = giveawayTypeMap[validatedPayload.type];
      const language = languageMap[validatedPayload.language];
      const publishResultsMode = publishResultsModeMap[validatedPayload.publishResultsMode];

      // Обновляем Giveaway со всеми полями из черновика
      const updatedGiveaway = await prisma.giveaway.update({
        where: { id: draftId },
        data: {
          status: GiveawayStatus.PENDING_CONFIRM,
          title: validatedPayload.title,
          language,
          type: giveawayType,
          winnersCount: validatedPayload.winnersCount,
          buttonText: validatedPayload.buttonText,
          postTemplateId: validatedPayload.postTemplateId,
          publishResultsMode,
          // Даты начала и окончания
          startAt: validatedPayload.startAt ? new Date(validatedPayload.startAt) : null,
          endAt: validatedPayload.endAt ? new Date(validatedPayload.endAt) : null,
          // Каталог
          isPublicInCatalog: validatedPayload.catalogEnabled,
        },
        select: {
          id: true,
          status: true,
          title: true,
          language: true,
          type: true,
          winnersCount: true,
          buttonText: true,
          publishResultsMode: true,
          startAt: true,
          endAt: true,
          draftPayload: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // Create channel relations if needed (GiveawayRequiredSubscription, GiveawayPublishChannel, GiveawayResultsChannel)
      // For now, store in draftPayload - will be processed on actual publish

      // Создаём или обновляем GiveawayCondition с настройками защиты и дополнительных билетов
      const captchaMode = captchaModeMap[validatedPayload.captchaMode];
      await prisma.giveawayCondition.upsert({
        where: { giveawayId: draftId },
        create: {
          giveawayId: draftId,
          captchaMode,
          livenessEnabled: validatedPayload.livenessEnabled,
          // Дополнительные билеты
          inviteEnabled: validatedPayload.inviteEnabled,
          inviteMax: validatedPayload.inviteEnabled ? validatedPayload.inviteMax : null,
          boostEnabled: validatedPayload.boostEnabled,
          boostChannelIds: validatedPayload.boostChannelIds || [],
          storiesEnabled: validatedPayload.storiesEnabled,
        },
        update: {
          captchaMode,
          livenessEnabled: validatedPayload.livenessEnabled,
          // Дополнительные билеты
          inviteEnabled: validatedPayload.inviteEnabled,
          inviteMax: validatedPayload.inviteEnabled ? validatedPayload.inviteMax : null,
          boostEnabled: validatedPayload.boostEnabled,
          boostChannelIds: validatedPayload.boostChannelIds || [],
          storiesEnabled: validatedPayload.storiesEnabled,
        },
      });
      
      fastify.log.info(
        { userId: user.id, giveawayId: draftId },
        'Giveaway confirmed, awaiting publication'
      );

      return reply.success({
        giveawayId: updatedGiveaway.id,
        status: updatedGiveaway.status,
        summary: {
          title: updatedGiveaway.title,
          type: updatedGiveaway.type,
          language: updatedGiveaway.language,
          winnersCount: updatedGiveaway.winnersCount,
          buttonText: updatedGiveaway.buttonText,
          publishResultsMode: updatedGiveaway.publishResultsMode,
          publishChannelIds: validatedPayload.publishChannelIds,
          resultsChannelIds: validatedPayload.resultsChannelIds,
          requiredSubscriptionChannelIds: validatedPayload.requiredSubscriptionChannelIds,
        },
      });
    }
  );

  /**
   * GET /giveaways/:id
   * Returns a specific giveaway by ID
   */
  fastify.get<{ Params: { id: string } }>('/giveaways/:id', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    const giveaway = await prisma.giveaway.findFirst({
      where: {
        id,
        ownerUserId: user.id,
      },
      select: {
        id: true,
        status: true,
        title: true,
        language: true,
        type: true,
        winnersCount: true,
        buttonText: true,
        publishResultsMode: true,
        wizardStep: true,
        draftPayload: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!giveaway) {
      return reply.notFound('Giveaway not found');
    }

    return reply.success({
      ...giveaway,
      createdAt: giveaway.createdAt.toISOString(),
      updatedAt: giveaway.updatedAt.toISOString(),
    });
  });

  /**
   * GET /giveaways
   * Список розыгрышей текущего пользователя с фильтрами и пагинацией
   */
  fastify.get<{
    Querystring: {
      status?: string;
      limit?: string;
      offset?: string;
    };
  }>('/giveaways', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { status, limit: limitStr, offset: offsetStr } = request.query;
    const limit = Math.min(parseInt(limitStr || '20', 10), 100);
    const offset = parseInt(offsetStr || '0', 10);

    // Формируем условие фильтрации по статусу
    type StatusFilter = { not?: GiveawayStatus } | GiveawayStatus | undefined;
    let statusFilter: StatusFilter;

    if (status && status !== 'all') {
      // Проверяем что статус валидный
      const validStatuses = Object.values(GiveawayStatus);
      if (validStatuses.includes(status as GiveawayStatus)) {
        statusFilter = status as GiveawayStatus;
      }
    }

    // Получаем розыгрыши
    const [giveaways, total] = await Promise.all([
      prisma.giveaway.findMany({
        where: {
          ownerUserId: user.id,
          ...(statusFilter ? { status: statusFilter } : {}),
        },
        include: {
          postTemplate: {
            select: {
              id: true,
              mediaType: true,
              telegramFileId: true,
            },
          },
          _count: {
            select: {
              participations: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.giveaway.count({
        where: {
          ownerUserId: user.id,
          ...(statusFilter ? { status: statusFilter } : {}),
        },
      }),
    ]);

    // Получаем счётчики по статусам
    const counts = await prisma.giveaway.groupBy({
      by: ['status'],
      where: {
        ownerUserId: user.id,
      },
      _count: true,
    });

    const countByStatus: Record<string, number> = {};
    let totalAll = 0;
    for (const c of counts) {
      countByStatus[c.status] = c._count;
      totalAll += c._count;
    }

    return reply.paginated(
      giveaways.map(g => ({
        id: g.id,
        status: g.status,
        title: g.title,
        type: g.type,
        winnersCount: g.winnersCount,
        participantsCount: g._count.participations,
        startAt: g.startAt?.toISOString() || null,
        endAt: g.endAt?.toISOString() || null,
        createdAt: g.createdAt.toISOString(),
        updatedAt: g.updatedAt.toISOString(),
        isSandbox: g.isSandbox,
        postTemplate: g.postTemplate ? {
          id: g.postTemplate.id,
          mediaType: g.postTemplate.mediaType,
          hasMedia: g.postTemplate.mediaType !== 'NONE' && !!g.postTemplate.telegramFileId,
        } : null,
        counts: {
          all: totalAll,
          draft: countByStatus.DRAFT || 0,
          pendingConfirm: countByStatus.PENDING_CONFIRM || 0,
          scheduled: countByStatus.SCHEDULED || 0,
          active: countByStatus.ACTIVE || 0,
          finished: countByStatus.FINISHED || 0,
          cancelled: countByStatus.CANCELLED || 0,
          error: countByStatus.ERROR || 0,
        },
      })),
      { total, hasMore: offset + giveaways.length < total }
    );
  });

  /**
   * GET /giveaways/:id/stats
   * Детальная статистика розыгрыша
   * 🔒 ИСПРАВЛЕНО (2026-02-16): Redis кеширование (TTL 60 секунд)
   */
  fastify.get<{ Params: { id: string } }>('/giveaways/:id/stats', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const statsTier = await getUserTier(user.id);
    if (!isTierAtLeast(statsTier, 'PRO')) {
      return reply.forbidden('Расширенная аналитика доступна с подпиской PRO и выше.');
    }

    const { id } = request.params;

    const cacheKey = `stats:giveaway:${id}`;
    const cached = await getCache(cacheKey);
    if (cached) {
      return reply.success(cached);
    }

    // Проверяем владельца
    const giveaway = await prisma.giveaway.findFirst({
      where: {
        id,
        ownerUserId: user.id,
      },
      include: {
        condition: true,
        publishChannels: {
          include: {
            channel: {
              select: {
                id: true,
                title: true,
                username: true,
              },
            },
          },
        },
      },
    });

    if (!giveaway) {
      return reply.status(404).send({
        ok: false,
        error: 'Розыгрыш не найден',
      });
    }

    // Получаем участников
    const participations = await prisma.participation.findMany({
      where: { giveawayId: id },
      select: {
        ticketsBase: true,
        ticketsExtra: true,
        referrerUserId: true,
        boostedChannelIds: true,
        storiesShared: true,
        joinedAt: true,
        storyRequest: {
          select: {
            status: true,
          },
        },
      },
    });

    // Считаем статистику
    const participantsCount = participations.length;
    
    // Участники за сегодня
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const participantsToday = participations.filter(p => new Date(p.joinedAt) >= today).length;

    // Билеты
    let ticketsTotal = 0;
    let ticketsFromInvites = 0;
    let ticketsFromBoosts = 0;
    let ticketsFromStories = 0;
    let invitesCount = 0;
    let boostsCount = 0;
    let storiesApproved = 0;
    let storiesPending = 0;

    for (const p of participations) {
      ticketsTotal += p.ticketsBase + p.ticketsExtra;
      
      // Подсчёт приглашений (кто был приглашён)
      if (p.referrerUserId) {
        invitesCount++;
      }
      
      // Подсчёт бустов
      if (p.boostedChannelIds && p.boostedChannelIds.length > 0) {
        boostsCount += p.boostedChannelIds.length;
      }
      
      // Подсчёт сторис
      if (p.storyRequest) {
        if (p.storyRequest.status === 'APPROVED') {
          storiesApproved++;
        } else if (p.storyRequest.status === 'PENDING') {
          storiesPending++;
        }
      }
    }

    // Билеты от приглашений = количество приглашённых
    ticketsFromInvites = invitesCount;
    ticketsFromBoosts = boostsCount;
    ticketsFromStories = storiesApproved;

    // Рост участников по дням (последние 7 дней)
    const participantsGrowth: Array<{ date: string; count: number }> = [];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    // Группируем по дням
    const byDate: Record<string, number> = {};
    for (const p of participations) {
      const joinDate = new Date(p.joinedAt);
      if (joinDate >= sevenDaysAgo) {
        const dateKey = joinDate.toISOString().split('T')[0];
        byDate[dateKey] = (byDate[dateKey] || 0) + 1;
      }
    }

    // Формируем массив для последних 7 дней
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      participantsGrowth.push({
        date: dateKey,
        count: byDate[dateKey] || 0,
      });
    }

    // Статистика по каналам
    const channelStats = giveaway.publishChannels.map(pc => ({
      channelId: pc.channel.id,
      title: pc.channel.title,
      username: pc.channel.username,
    }));

    const stats = {
      participantsCount,
      participantsToday,
      participantsGrowth,
      ticketsTotal,
      ticketsFromInvites,
      ticketsFromBoosts,
      ticketsFromStories,
      invitesCount,
      boostsCount,
      storiesApproved,
      storiesPending,
      channelStats,
    };

    // 🔒 Сохраняем в кеш (60 секунд)
    await setCache(cacheKey, stats, 60);

    return reply.success(stats);
  });

  /**
   * GET /giveaways/:id/participants/export
   * CSV export of participants (PLUS+ required)
   */
  fastify.get<{ Params: { id: string } }>('/giveaways/:id/participants/export', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const exportTier = await getUserTier(user.id);
    if (exportTier === 'FREE') {
      return reply.forbidden('CSV-экспорт участников доступен с подпиской PLUS и выше.');
    }

    const { id } = request.params;

    const giveaway = await prisma.giveaway.findFirst({
      where: { id, ownerUserId: user.id },
      select: { id: true, title: true },
    });

    if (!giveaway) {
      return reply.notFound('Розыгрыш не найден или нет доступа');
    }

    const participants = await prisma.participation.findMany({
      where: { giveawayId: id },
      include: {
        user: {
          select: {
            telegramUserId: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    const BOM = '\uFEFF';
    const header = 'telegram_id,username,first_name,last_name,joined_at,tickets_base,tickets_extra,status,fraud_score\n';
    const rows = participants.map(p => {
      const u = p.user;
      const escape = (v: string | null) => {
        if (!v) return '';
        if (v.includes(',') || v.includes('"') || v.includes('\n')) {
          return `"${v.replace(/"/g, '""')}"`;
        }
        return v;
      };
      return [
        u.telegramUserId.toString(),
        escape(u.username),
        escape(u.firstName),
        escape(u.lastName),
        p.joinedAt.toISOString(),
        p.ticketsBase,
        p.ticketsExtra,
        p.status,
        p.fraudScore ?? '',
      ].join(',');
    }).join('\n');

    const csv = BOM + header + rows;
    const filename = `participants_${giveaway.title?.replace(/[^a-zA-Z0-9а-яА-Я_-]/g, '_') || id}.csv`;

    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return reply.send(csv);
  });

  /**
   * GET /giveaways/:id/participants
   * Список участников розыгрыша с пагинацией и поиском
   */
  fastify.get<{
    Params: { id: string };
    Querystring: {
      limit?: string;
      offset?: string;
      search?: string;
    };
  }>('/giveaways/:id/participants', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;
    const { limit: limitStr, offset: offsetStr, search } = request.query;
    const limit = Math.min(parseInt(limitStr || '50', 10), 100);
    const offset = parseInt(offsetStr || '0', 10);

    // Проверяем владельца
    const giveaway = await prisma.giveaway.findFirst({
      where: {
        id,
        ownerUserId: user.id,
      },
      select: { id: true },
    });

    if (!giveaway) {
      return reply.notFound('Розыгрыш не найден');
    }

    // Формируем условие поиска
    const searchCondition = search ? {
      user: {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' as const } },
          { lastName: { contains: search, mode: 'insensitive' as const } },
          { username: { contains: search, mode: 'insensitive' as const } },
        ],
      },
    } : {};

    // Получаем участников
    const [participants, total] = await Promise.all([
      prisma.participation.findMany({
        where: {
          giveawayId: id,
          ...searchCondition,
        },
        include: {
          user: {
            select: {
              id: true,
              telegramUserId: true,
              firstName: true,
              lastName: true,
              username: true,
            },
          },
          storyRequest: {
            select: {
              status: true,
            },
          },
        },
        orderBy: { joinedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.participation.count({
        where: {
          giveawayId: id,
          ...searchCondition,
        },
      }),
    ]);

    // Получаем количество приглашённых для каждого участника
    const userIds = participants.map(p => p.userId);
    const inviteCounts = await prisma.participation.groupBy({
      by: ['referrerUserId'],
      where: {
        giveawayId: id,
        referrerUserId: { in: userIds },
      },
      _count: true,
    });

    const inviteCountMap: Record<string, number> = {};
    for (const ic of inviteCounts) {
      if (ic.referrerUserId) {
        inviteCountMap[ic.referrerUserId] = ic._count;
      }
    }

    return reply.paginated(
      participants.map(p => ({
        id: p.id,
        user: {
          id: p.user.id,
          telegramUserId: p.user.telegramUserId.toString(),
          firstName: p.user.firstName,
          lastName: p.user.lastName,
          username: p.user.username,
        },
        ticketsBase: p.ticketsBase,
        ticketsExtra: p.ticketsExtra,
        invitedCount: inviteCountMap[p.userId] || 0,
        boostedChannelIds: p.boostedChannelIds,
        storiesShared: p.storiesShared,
        storyRequestStatus: p.storyRequest?.status || null,
        joinedAt: p.joinedAt.toISOString(),
      })),
      { total, hasMore: offset + participants.length < total }
    );
  });

  /**
   * GET /giveaways/:id/top-inviters
   * Топ-10 пользователей по количеству приглашённых участников
   */
  fastify.get<{ Params: { id: string } }>('/giveaways/:id/top-inviters', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    // Только владелец может видеть топ приглашающих
    const giveaway = await prisma.giveaway.findFirst({
      where: { id, ownerUserId: user.id },
      select: { id: true },
    });

    if (!giveaway) {
      return reply.notFound('Розыгрыш не найден');
    }

    // Группируем по referrerUserId и считаем
    const inviteCounts = await prisma.participation.groupBy({
      by: ['referrerUserId'],
      where: {
        giveawayId: id,
        referrerUserId: { not: null },
      },
      _count: { referrerUserId: true },
      orderBy: { _count: { referrerUserId: 'desc' } },
      take: 10,
    });

    if (inviteCounts.length === 0) {
      return reply.success({ topInviters: [] });
    }

    const referrerIds = inviteCounts
      .map(ic => ic.referrerUserId)
      .filter((id): id is string => id !== null);

    const users = await prisma.user.findMany({
      where: { id: { in: referrerIds } },
      select: { id: true, firstName: true, lastName: true, username: true },
    });

    const userMap: Record<string, typeof users[0]> = {};
    for (const u of users) {
      userMap[u.id] = u;
    }

    const topInviters = inviteCounts.map((ic, index) => {
      const u = userMap[ic.referrerUserId!];
      return {
        rank: index + 1,
        userId: ic.referrerUserId!,
        firstName: u?.firstName || 'Пользователь',
        lastName: u?.lastName || null,
        username: u?.username || null,
        inviteCount: ic._count.referrerUserId,
      };
    });

    return reply.success({ topInviters });
  });

  /**
   * POST /giveaways/:id/duplicate
   * Дублировать розыгрыш (создать копию как DRAFT)
   */
  fastify.post<{ Params: { id: string } }>('/giveaways/:id/duplicate', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    // Получаем оригинальный розыгрыш
    const original = await prisma.giveaway.findFirst({
      where: {
        id,
        ownerUserId: user.id,
      },
      include: {
        condition: true,
      },
    });

    if (!original) {
      return reply.notFound('Розыгрыш не найден');
    }

    // Создаём копию как DRAFT — начинаем с шага TYPE чтобы пользователь прошёл wizard
    const newGiveaway = await prisma.giveaway.create({
      data: {
        ownerUserId: user.id,
        shortCode: generateShortCode(),
        status: GiveawayStatus.DRAFT,
        title: `${original.title} (копия)`,
        language: original.language,
        type: original.type,
        winnersCount: original.winnersCount,
        buttonText: original.buttonText,
        postTemplateId: original.postTemplateId,
        publishResultsMode: original.publishResultsMode,
        wizardStep: 'TYPE',
        draftVersion: 2, // > 1 означает "реальный черновик с данными"
        draftPayload: original.draftPayload as object ?? undefined,
      },
    });

    // Копируем условия если есть
    if (original.condition) {
      await prisma.giveawayCondition.create({
        data: {
          giveawayId: newGiveaway.id,
          captchaMode: original.condition.captchaMode,
          livenessEnabled: original.condition.livenessEnabled,
          inviteEnabled: original.condition.inviteEnabled,
          inviteMax: original.condition.inviteMax,
          boostEnabled: original.condition.boostEnabled,
          boostChannelIds: original.condition.boostChannelIds,
          storiesEnabled: original.condition.storiesEnabled,
        },
      });
    }

    fastify.log.info(
      { userId: user.id, originalId: id, newId: newGiveaway.id },
      'Giveaway duplicated'
    );

    return reply.success({
      newGiveawayId: newGiveaway.id,
    });
  });

  /**
   * DELETE /giveaways/:id
   * Удалить розыгрыш (только DRAFT или CANCELLED)
   */
  fastify.delete<{ Params: { id: string } }>('/giveaways/:id', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    // Проверяем розыгрыш
    const giveaway = await prisma.giveaway.findFirst({
      where: {
        id,
        ownerUserId: user.id,
      },
      select: {
        id: true,
        status: true,
        title: true,
      },
    });

    if (!giveaway) {
      return reply.notFound('Розыгрыш не найден');
    }

    // Можно удалить только DRAFT или CANCELLED
    // Можно удалить черновики, ожидающие подтверждения и отменённые
    const deletableStatuses: GiveawayStatus[] = [GiveawayStatus.DRAFT, GiveawayStatus.PENDING_CONFIRM, GiveawayStatus.CANCELLED];
    if (!deletableStatuses.includes(giveaway.status)) {
      return reply.badRequest('Удалить можно только черновики или отменённые розыгрыши');
    }

    // Удаляем розыгрыш (каскадно удалятся связанные записи)
    await prisma.giveaway.delete({
      where: { id },
    });

    fastify.log.info(
      { userId: user.id, giveawayId: id },
      'Giveaway deleted'
    );

    // 🔒 ЗАДАЧА 7.10: Audit log - удаление розыгрыша
    await createAuditLog({
      userId: user.id,
      action: AuditAction.GIVEAWAY_DELETED,
      entityType: AuditEntityType.GIVEAWAY,
      entityId: id,
      metadata: {
        giveawayTitle: giveaway.title,
        status: giveaway.status,
      },
      request,
    });

    return reply.success({ message: 'Giveaway deleted successfully' });
  });

  /**
   * GET /giveaways/:id/full
   * Полная информация о розыгрыше для страницы деталей
   */
  fastify.get<{ Params: { id: string } }>('/giveaways/:id/full', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    const giveaway = await prisma.giveaway.findFirst({
      where: {
        id,
        ownerUserId: user.id,
      },
      include: {
        postTemplate: {
          select: {
            id: true,
            text: true,
            mediaType: true,
            telegramFileId: true,
          },
        },
        condition: true,
        publishChannels: {
          include: {
            channel: {
              select: {
                id: true,
                title: true,
                username: true,
              },
            },
          },
        },
        requiredSubscriptions: {
          include: {
            channel: {
              select: {
                id: true,
                title: true,
                username: true,
              },
            },
          },
        },
        winners: {
          include: {
            user: {
              select: {
                id: true,
                telegramUserId: true,
                firstName: true,
                lastName: true,
                username: true,
              },
            },
          },
          orderBy: { place: 'asc' },
        },
        _count: {
          select: {
            participations: true,
          },
        },
      },
    });

    if (!giveaway) {
      return reply.notFound('Розыгрыш не найден');
    }

    return reply.success({
        id: giveaway.id,
        status: giveaway.status,
        title: giveaway.title,
        language: giveaway.language,
        type: giveaway.type,
        winnersCount: giveaway.winnersCount,
        buttonText: giveaway.buttonText,
        publishResultsMode: giveaway.publishResultsMode,
        startAt: giveaway.startAt?.toISOString() || null,
        endAt: giveaway.endAt?.toISOString() || null,
        createdAt: giveaway.createdAt.toISOString(),
        updatedAt: giveaway.updatedAt.toISOString(),
        participantsCount: giveaway._count.participations,
        postTemplate: giveaway.postTemplate,
        condition: giveaway.condition ? {
          captchaMode: giveaway.condition.captchaMode,
          livenessEnabled: giveaway.condition.livenessEnabled,
          inviteEnabled: giveaway.condition.inviteEnabled,
          inviteMax: giveaway.condition.inviteMax,
          boostEnabled: giveaway.condition.boostEnabled,
          boostChannelIds: giveaway.condition.boostChannelIds,
          storiesEnabled: giveaway.condition.storiesEnabled,
        } : null,
        publishChannels: giveaway.publishChannels.map(pc => pc.channel),
        requiredSubscriptions: giveaway.requiredSubscriptions.map(rs => rs.channel),
        winners: giveaway.winners.map(w => ({
          place: w.place,
          user: {
            id: w.user.id,
            telegramUserId: w.user.telegramUserId.toString(),
            firstName: w.user.firstName,
            lastName: w.user.lastName,
            username: w.user.username,
          },
        })),
    });
  });

  // =========================================================================
  // 🔒 ДОБАВЛЕНО (2026-02-16): Недостающие endpoints
  // =========================================================================

  /**
   * POST /giveaways/:id/cancel
   * Отмена розыгрыша (только owner, только ACTIVE/SCHEDULED/PENDING_CONFIRM)
   */
  fastify.post<{ Params: { id: string } }>('/giveaways/:id/cancel', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    const giveaway = await prisma.giveaway.findFirst({
      where: { id, ownerUserId: user.id },
    });

    if (!giveaway) {
      return reply.notFound('Розыгрыш не найден');
    }

    const cancellableStatuses: GiveawayStatus[] = [
      GiveawayStatus.ACTIVE,
      GiveawayStatus.SCHEDULED,
      GiveawayStatus.PENDING_CONFIRM,
      GiveawayStatus.DRAFT,
    ];

    if (!cancellableStatuses.includes(giveaway.status as GiveawayStatus)) {
      return reply.badRequest(`Невозможно отменить розыгрыш в статусе "${giveaway.status}"`);
    }

    await prisma.giveaway.update({
      where: { id },
      data: { status: GiveawayStatus.CANCELLED },
    });

    await createAuditLog({
      userId: user.id,
      action: AuditAction.GIVEAWAY_CANCELLED,
      entityType: AuditEntityType.GIVEAWAY,
      entityId: id,
      metadata: { previousStatus: giveaway.status },
      request,
    });

    fastify.log.info({ giveawayId: id, userId: user.id }, 'Giveaway cancelled');

    // Уведомляем создателя и участников об отмене (fire-and-forget)
    if (giveaway.status === GiveawayStatus.ACTIVE || giveaway.status === GiveawayStatus.SCHEDULED) {
      notifyCancelToAll(id, giveaway.title, user.id).catch(err =>
        fastify.log.error({ err, giveawayId: id }, 'Error sending cancel notifications')
      );
    }

    return reply.success({ id, status: GiveawayStatus.CANCELLED });
  });

  /**
   * POST /giveaways/:id/start
   * Ручной запуск розыгрыша (SCHEDULED → ACTIVE)
   */
  fastify.post<{ Params: { id: string } }>('/giveaways/:id/start', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    const giveaway = await prisma.giveaway.findFirst({
      where: { id, ownerUserId: user.id },
    });

    if (!giveaway) {
      return reply.notFound('Розыгрыш не найден');
    }

    if (giveaway.status !== GiveawayStatus.SCHEDULED) {
      return reply.badRequest(`Запуск возможен только для розыгрышей в статусе "SCHEDULED". Текущий: "${giveaway.status}"`);
    }

    await prisma.giveaway.update({
      where: { id },
      data: { 
        status: GiveawayStatus.ACTIVE,
        startAt: new Date(),
      },
    });

    fastify.log.info({ giveawayId: id, userId: user.id }, 'Giveaway manually started');

    return reply.success({ id, status: GiveawayStatus.ACTIVE });
  });

  /**
   * POST /giveaways/:id/view
   * Трекинг просмотра розыгрыша (для статистики конверсии)
   * source: "mini_app" | "catalog" | "tracking_link" | "direct"
   */
  fastify.post<{ Params: { id: string } }>('/giveaways/:id/view', async (request, reply) => {
    const { id } = request.params;

    const body = z.object({
      source: z.enum(['mini_app', 'catalog', 'tracking_link', 'direct']).optional().default('direct'),
    }).parse(request.body || {});

    // Получаем пользователя (необязательно — анонимные просмотры тоже считаются)
    const user = await getUser(request);

    // Проверяем существование розыгрыша
    const exists = await prisma.giveaway.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!exists) {
      return reply.notFound('Розыгрыш не найден');
    }

    try {
      await prisma.giveawayView.create({
        data: {
          giveawayId: id,
          viewerUserId: user?.id || null,
          source: body.source,
        },
      });
    } catch {
      // Игнорируем ошибки (duplicate view и т.д.)
    }

    return reply.success({ tracked: true });
  });

  /**
   * PATCH /giveaways/:id
   * Редактирование розыгрыша
   * Разрешено в DRAFT, PENDING_CONFIRM, SCHEDULED. Для ACTIVE — ограниченные поля.
   */
  const editGiveawaySchema = z.object({
    title: z.string().min(1).max(200).optional(),
    winnersCount: z.number().min(1).max(200).optional(),
    endAt: z.string().datetime().nullable().optional(),
    startAt: z.string().datetime().nullable().optional(),
    buttonText: z.string().min(1).max(100).optional(),
    postTemplateId: z.string().uuid().nullable().optional(),
    publishResultsMode: z.enum(['SEPARATE_POSTS', 'EDIT_START_POST', 'RANDOMIZER']).optional(),
    captchaMode: z.enum(['OFF', 'SUSPICIOUS_ONLY', 'ALL']).optional(),
    livenessEnabled: z.boolean().optional(),
    inviteEnabled: z.boolean().optional(),
    inviteMax: z.number().min(1).max(10000).optional(),
    boostEnabled: z.boolean().optional(),
    boostChannelIds: z.array(z.string().uuid()).optional(),
    storiesEnabled: z.boolean().optional(),
    catalogEnabled: z.boolean().optional(),
    requiredSubscriptionChannelIds: z.array(z.string()).optional(),
    publishChannelIds: z.array(z.string().uuid()).optional(),
    resultsChannelIds: z.array(z.string()).optional(),
  });

  fastify.patch<{ Params: { id: string } }>('/giveaways/:id', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    const giveaway = await prisma.giveaway.findFirst({
      where: { id, ownerUserId: user.id },
      include: { condition: true },
    });

    if (!giveaway) {
      return reply.notFound('Розыгрыш не найден');
    }

    const editableStatuses: GiveawayStatus[] = [
      GiveawayStatus.DRAFT,
      GiveawayStatus.PENDING_CONFIRM,
      GiveawayStatus.SCHEDULED,
      GiveawayStatus.ACTIVE,
    ];

    if (!editableStatuses.includes(giveaway.status as GiveawayStatus)) {
      return reply.badRequest(`Невозможно редактировать розыгрыш в статусе "${giveaway.status}"`);
    }

    const parsed = editGiveawaySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest('Ошибка валидации', formatZodErrors(parsed.error));
    }

    const data = parsed.data;

    if (data.livenessEnabled || data.captchaMode === 'ALL') {
      const editTier = await getUserTier(user.id);
      if (data.livenessEnabled && editTier !== 'BUSINESS') {
        return reply.forbidden('Liveness Check доступен только для BUSINESS подписки.');
      }
      if (data.captchaMode === 'ALL' && !isTierAtLeast(editTier, 'PLUS')) {
        return reply.forbidden('Режим капчи «Для всех» доступен с подпиской PLUS и выше.');
      }
    }

    // Для ACTIVE розыгрышей — только ограниченный набор полей
    const activeOnlyFields = ['endAt', 'captchaMode', 'livenessEnabled'] as const;
    if (giveaway.status === GiveawayStatus.ACTIVE) {
      const providedKeys = Object.keys(data);
      const disallowedKeys = providedKeys.filter(k => !activeOnlyFields.includes(k as any));
      if (disallowedKeys.length > 0) {
        return reply.badRequest(
          `Для активного розыгрыша можно менять только: ${activeOnlyFields.join(', ')}. ` +
          `Запрещённые поля: ${disallowedKeys.join(', ')}`
        );
      }
    }

    // Разделяем поля на giveaway и condition
    const giveawayUpdate: Record<string, unknown> = {};
    const conditionUpdate: Record<string, unknown> = {};

    if (data.title !== undefined) giveawayUpdate.title = data.title;
    if (data.winnersCount !== undefined) giveawayUpdate.winnersCount = data.winnersCount;
    if (data.endAt !== undefined) giveawayUpdate.endAt = data.endAt ? new Date(data.endAt) : null;
    if (data.startAt !== undefined) giveawayUpdate.startAt = data.startAt ? new Date(data.startAt) : null;
    if (data.buttonText !== undefined) giveawayUpdate.buttonText = data.buttonText;
    if (data.postTemplateId !== undefined) giveawayUpdate.postTemplateId = data.postTemplateId;
    if (data.publishResultsMode !== undefined) giveawayUpdate.publishResultsMode = data.publishResultsMode;

    if (data.captchaMode !== undefined) conditionUpdate.captchaMode = data.captchaMode;
    if (data.livenessEnabled !== undefined) conditionUpdate.livenessEnabled = data.livenessEnabled;
    if (data.inviteEnabled !== undefined) conditionUpdate.inviteEnabled = data.inviteEnabled;
    if (data.inviteMax !== undefined) conditionUpdate.inviteMax = data.inviteMax;
    if (data.boostEnabled !== undefined) conditionUpdate.boostEnabled = data.boostEnabled;
    if (data.boostChannelIds !== undefined) conditionUpdate.boostChannelIds = data.boostChannelIds;
    if (data.storiesEnabled !== undefined) conditionUpdate.storiesEnabled = data.storiesEnabled;

    // Optimistic locking: используем draftVersion
    const updateResult = await prisma.$transaction(async (tx) => {
      // Обновляем giveaway с optimistic lock
      const updated = await tx.giveaway.update({
        where: { id, draftVersion: giveaway.draftVersion },
        data: {
          ...giveawayUpdate,
          draftVersion: { increment: 1 },
        },
      });

      // Обновляем condition если есть что обновлять
      if (Object.keys(conditionUpdate).length > 0 && giveaway.condition) {
        await tx.giveawayCondition.update({
          where: { giveawayId: id },
          data: conditionUpdate,
        });
      }

      // Обновляем каналы если указаны
      if (data.publishChannelIds !== undefined) {
        await tx.giveawayPublishChannel.deleteMany({ where: { giveawayId: id } });
        if (data.publishChannelIds.length > 0) {
          await tx.giveawayPublishChannel.createMany({
            data: data.publishChannelIds.map(channelId => ({
              giveawayId: id,
              channelId,
            })),
          });
        }
      }

      if (data.requiredSubscriptionChannelIds !== undefined) {
        await tx.giveawayRequiredSubscription.deleteMany({ where: { giveawayId: id } });
        if (data.requiredSubscriptionChannelIds.length > 0) {
          await tx.giveawayRequiredSubscription.createMany({
            data: data.requiredSubscriptionChannelIds.map(channelId => ({
              giveawayId: id,
              channelId,
            })),
          });
        }
      }

      if (data.resultsChannelIds !== undefined) {
        await tx.giveawayResultsChannel.deleteMany({ where: { giveawayId: id } });
        if (data.resultsChannelIds.length > 0) {
          await tx.giveawayResultsChannel.createMany({
            data: data.resultsChannelIds.map(channelId => ({
              giveawayId: id,
              channelId,
            })),
          });
        }
      }

      return updated;
    });

    await createAuditLog({
      userId: user.id,
      action: AuditAction.GIVEAWAY_UPDATED,
      entityType: AuditEntityType.GIVEAWAY,
      entityId: id,
      metadata: { updatedFields: Object.keys(data), previousDraftVersion: giveaway.draftVersion },
      request,
    });

    fastify.log.info({ giveawayId: id, updatedFields: Object.keys(data) }, 'Giveaway updated');

    return reply.success({
      id: updateResult.id,
      draftVersion: updateResult.draftVersion,
      updatedFields: Object.keys(data),
    });
  });

  /**
   * POST /giveaways/:id/retry
   * Повторная попытка для розыгрышей в статусе ERROR
   * Сбрасывает статус обратно на ACTIVE для повторного выполнения
   */
  fastify.post<{ Params: { id: string } }>('/giveaways/:id/retry', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    const giveaway = await prisma.giveaway.findFirst({
      where: { id, ownerUserId: user.id },
    });

    if (!giveaway) {
      return reply.notFound('Розыгрыш не найден');
    }

    if (giveaway.status !== GiveawayStatus.ERROR) {
      return reply.badRequest(`Retry возможен только для розыгрышей в статусе "ERROR". Текущий: "${giveaway.status}"`);
    }

    // Сбрасываем на ACTIVE для повторной обработки scheduler-ом
    await prisma.giveaway.update({
      where: { id },
      data: { status: GiveawayStatus.ACTIVE },
    });

    await createAuditLog({
      userId: user.id,
      action: AuditAction.GIVEAWAY_UPDATED,
      entityType: AuditEntityType.GIVEAWAY,
      entityId: id,
      metadata: { action: 'retry', previousStatus: 'ERROR' },
      request,
    });

    fastify.log.info({ giveawayId: id, userId: user.id }, 'Giveaway retry requested');

    return reply.success({ id, status: GiveawayStatus.ACTIVE, message: 'Розыгрыш перезапущен' });
  });

  /**
   * POST /giveaways/sandbox
   * Создание тестового (sandbox) розыгрыша
   * Автоматически удаляется через 24 часа
   */
  fastify.post('/giveaways/sandbox', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const body = z.object({
      title: z.string().min(1).max(200).optional().default('Тестовый розыгрыш'),
      winnersCount: z.number().min(1).max(10).optional().default(1),
    }).parse(request.body || {});

    // Проверяем лимит sandbox розыгрышей (максимум 1 одновременно)
    const existingSandbox = await prisma.giveaway.count({
      where: {
        ownerUserId: user.id,
        isSandbox: true,
        status: { in: [GiveawayStatus.ACTIVE, GiveawayStatus.DRAFT, GiveawayStatus.SCHEDULED] },
      },
    });

    if (existingSandbox >= 1) {
      return reply.badRequest('У вас уже есть активный sandbox розыгрыш. Дождитесь его завершения или удалите.');
    }

    // Создаём sandbox розыгрыш
    const sandbox = await prisma.giveaway.create({
      data: {
        ownerUserId: user.id,
        title: `[SANDBOX] ${body.title}`,
        status: GiveawayStatus.ACTIVE,
        type: 'STANDARD',
        language: 'RU',
        winnersCount: body.winnersCount,
        isSandbox: true,
        // Sandbox розыгрыш заканчивается через 24 часа
        endAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        startAt: new Date(),
        buttonText: 'Участвовать (тест)',
      },
    });

    // Создаём GiveawayCondition
    await prisma.giveawayCondition.create({
      data: {
        giveawayId: sandbox.id,
        captchaMode: 'OFF',
        livenessEnabled: false,
        inviteEnabled: false,
        boostEnabled: false,
        storiesEnabled: false,
      },
    });

    fastify.log.info({ giveawayId: sandbox.id, userId: user.id }, 'Sandbox giveaway created');

    return reply.success({
      id: sandbox.id,
      title: sandbox.title,
      status: sandbox.status,
      endAt: sandbox.endAt?.toISOString(),
      isSandbox: true,
      message: 'Тестовый розыгрыш создан. Будет удалён через 24 часа.',
    });
  });

  /**
   * GET /giveaways/:id/participant-count
   * Быстрое получение количества участников (для polling)
   * С Redis-кешем на 5 секунд
   */
  fastify.get<{ Params: { id: string } }>('/giveaways/:id/participant-count', async (request, reply) => {
    const { id } = request.params;

    // Redis кеш (5 секунд)
    const cacheKey = `giveaway:${id}:participant-count`;
    const cached = await getCache(cacheKey);
    if (cached) {
      return reply.success(cached);
    }

    const giveaway = await prisma.giveaway.findUnique({
      where: { id },
      select: { totalParticipants: true },
    });

    if (!giveaway) {
      return reply.notFound('Розыгрыш не найден');
    }

    const data = { count: giveaway.totalParticipants };
    await setCache(cacheKey, data, 5);

    return reply.success(data);
  });

  // ============================================================================
  // 9.6 Кастомизация темы (платная: PRO/BUSINESS)
  // ============================================================================

  /**
   * GET /giveaways/:id/theme
   * Получить тему розыгрыша (только владелец)
   */
  fastify.get<{ Params: { id: string } }>('/giveaways/:id/theme', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    const giveaway = await prisma.giveaway.findFirst({
      where: { id, ownerUserId: user.id },
      select: { id: true },
    });
    if (!giveaway) return reply.notFound('Giveaway not found');

    const theme = await prisma.giveawayTheme.findUnique({
      where: { giveawayId: id },
    });

    return reply.success({
      theme: theme
        ? {
            backgroundColor: theme.backgroundColor,
            accentColor: theme.accentColor,
            buttonStyle: theme.buttonStyle,
            logoFileId: theme.logoFileId,
            iconVariant: theme.iconVariant,
            iconColor: theme.iconColor,
          }
        : null,
    });
  });

  /**
   * PUT /giveaways/:id/theme
   * Сохранить/обновить тему (upsert). Требует PRO/BUSINESS подписку.
   */
  fastify.put<{ Params: { id: string } }>('/giveaways/:id/theme', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    const giveaway = await prisma.giveaway.findFirst({
      where: { id, ownerUserId: user.id },
      select: { id: true },
    });
    if (!giveaway) return reply.notFound('Giveaway not found');

    const now = new Date();
    const entitlement = await prisma.entitlement.findFirst({
      where: {
        userId: user.id,
        code: 'tier.business',
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });
    if (!entitlement) {
      return reply.forbidden('Theme customization requires BUSINESS subscription');
    }

    const body = request.body as {
      backgroundColor?: string;
      accentColor?: string;
      buttonStyle?: string;
      logoFileId?: string;
      iconVariant?: string;
      iconColor?: string;
    };

    const theme = await prisma.giveawayTheme.upsert({
      where: { giveawayId: id },
      create: {
        giveawayId: id,
        backgroundColor: body.backgroundColor || null,
        accentColor: body.accentColor || null,
        buttonStyle: body.buttonStyle || 'default',
        logoFileId: body.logoFileId || null,
        iconVariant: body.iconVariant || 'brand',
        iconColor: body.iconColor || '#000000',
      },
      update: {
        ...(body.backgroundColor !== undefined && { backgroundColor: body.backgroundColor }),
        ...(body.accentColor !== undefined && { accentColor: body.accentColor }),
        ...(body.buttonStyle !== undefined && { buttonStyle: body.buttonStyle }),
        ...(body.logoFileId !== undefined && { logoFileId: body.logoFileId }),
        ...(body.iconVariant !== undefined && { iconVariant: body.iconVariant }),
        ...(body.iconColor !== undefined && { iconColor: body.iconColor }),
      },
    });

    fastify.log.info({ userId: user.id, giveawayId: id }, 'Giveaway theme updated');

    return reply.success({
      theme: {
        backgroundColor: theme.backgroundColor,
        accentColor: theme.accentColor,
        buttonStyle: theme.buttonStyle,
        logoFileId: theme.logoFileId,
        iconVariant: theme.iconVariant,
        iconColor: theme.iconColor,
      },
    });
  });

  /**
   * DELETE /giveaways/:id/theme
   * Удалить тему (сброс к дефолту)
   */
  fastify.delete<{ Params: { id: string } }>('/giveaways/:id/theme', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    const giveaway = await prisma.giveaway.findFirst({
      where: { id, ownerUserId: user.id },
      select: { id: true },
    });
    if (!giveaway) return reply.notFound('Giveaway not found');

    await prisma.giveawayTheme.deleteMany({ where: { giveawayId: id } });

    return reply.success({ ok: true });
  });
};
