import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, GiveawayStatus, GiveawayType, LanguageCode, PublishResultsMode, CaptchaMode } from '@randombeast/database';
import type { GiveawayDraftPayload } from '@randombeast/shared';
import { ErrorCode } from '@randombeast/shared';
import { requireUser } from '../plugins/auth.js';
import { createAuditLog, AuditAction, AuditEntityType } from '../lib/audit.js';

// UUID validation regex
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Схема валидации для confirm endpoint
const confirmDraftPayloadSchema = z.object({
  type: z.enum(['STANDARD', 'BOOST_REQUIRED', 'INVITE_REQUIRED', 'CUSTOM'], {
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

      // Map string values to Prisma enums
      const giveawayTypeMap: Record<string, GiveawayType> = {
        STANDARD: GiveawayType.STANDARD,
        BOOST_REQUIRED: GiveawayType.BOOST_REQUIRED,
        INVITE_REQUIRED: GiveawayType.INVITE_REQUIRED,
        CUSTOM: GiveawayType.CUSTOM,
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
        },
      })),
      { total, hasMore: offset + giveaways.length < total }
    );
  });

  /**
   * GET /giveaways/:id/stats
   * Детальная статистика розыгрыша
   */
  fastify.get<{ Params: { id: string } }>('/giveaways/:id/stats', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

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

    return reply.success({
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
    });
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

    // Создаём копию как DRAFT
    const newGiveaway = await prisma.giveaway.create({
      data: {
        ownerUserId: user.id,
        status: GiveawayStatus.DRAFT,
        title: `${original.title} (копия)`,
        language: original.language,
        type: original.type,
        winnersCount: original.winnersCount,
        buttonText: original.buttonText,
        postTemplateId: original.postTemplateId,
        publishResultsMode: original.publishResultsMode,
        wizardStep: 'REVIEW',
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
};
