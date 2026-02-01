import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, GiveawayStatus, ParticipationStatus } from '@randombeast/database';
import { getUser, requireUser } from '../plugins/auth.js';
import { config } from '../config.js';
import crypto from 'crypto';

// Схема для проверки подписки
const checkSubscriptionSchema = z.object({
  channelIds: z.array(z.string().uuid()).optional(),
});

// Схема для участия
const joinGiveawaySchema = z.object({
  captchaPassed: z.boolean().optional().default(false),
  captchaToken: z.string().optional(),
  sourceTag: z.string().optional().nullable(),
  referrerUserId: z.string().uuid().optional().nullable(),
});

// Простая математическая капча
interface CaptchaData {
  question: string;
  answer: number;
  expiresAt: number;
}

// In-memory хранилище токенов капчи (для MVP)
// В production использовать Redis
const captchaTokens = new Map<string, CaptchaData>();

// Очистка просроченных токенов каждые 5 минут
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of captchaTokens.entries()) {
    if (data.expiresAt < now) {
      captchaTokens.delete(token);
    }
  }
}, 5 * 60 * 1000);

/**
 * Генерация токена капчи
 */
function generateCaptchaToken(data: CaptchaData): string {
  const token = crypto.randomBytes(32).toString('hex');
  captchaTokens.set(token, data);
  return token;
}

/**
 * Проверка токена капчи
 */
function verifyCaptchaToken(token: string, userAnswer: number): boolean {
  const data = captchaTokens.get(token);
  if (!data) return false;
  if (data.expiresAt < Date.now()) {
    captchaTokens.delete(token);
    return false;
  }
  const isValid = data.answer === userAnswer;
  if (isValid) {
    captchaTokens.delete(token);
  }
  return isValid;
}

/**
 * Routes для участия в розыгрышах
 */
export const participationRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /giveaways/:id/public
   * Публичная информация о розыгрыше для участника
   */
  fastify.get<{ Params: { id: string } }>('/giveaways/:id/public', async (request, reply) => {
    const { id } = request.params;

    // Пробуем получить пользователя (не обязательно)
    const user = await getUser(request);

    const giveaway = await prisma.giveaway.findUnique({
      where: { id },
      include: {
        postTemplate: {
          select: {
            text: true,
            mediaType: true,
          },
        },
        condition: {
          select: {
            captchaMode: true,
            inviteEnabled: true,
            inviteMax: true,
            boostEnabled: true,
            boostChannelIds: true,
            storiesEnabled: true,
          },
        },
        _count: {
          select: {
            participations: {
              where: { status: ParticipationStatus.JOINED },
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

    // Проверяем статус
    if (!['ACTIVE', 'SCHEDULED', 'FINISHED'].includes(giveaway.status)) {
      return reply.status(400).send({
        ok: false,
        error: 'Розыгрыш недоступен',
        status: giveaway.status,
      });
    }

    // Получаем каналы обязательной подписки из draftPayload
    const draftPayload = (giveaway.draftPayload || {}) as {
      requiredSubscriptionChannelIds?: string[];
    };
    const requiredSubIds = draftPayload.requiredSubscriptionChannelIds || [];

    // Загружаем информацию о каналах
    const channels = requiredSubIds.length > 0
      ? await prisma.channel.findMany({
          where: { id: { in: requiredSubIds } },
          select: {
            id: true,
            title: true,
            username: true,
            telegramChatId: true,
          },
        })
      : [];

    // Проверяем участие пользователя
    let participation = null;
    if (user) {
      const existingParticipation = await prisma.participation.findUnique({
        where: {
          giveawayId_userId: {
            giveawayId: id,
            userId: user.id,
          },
        },
        select: {
          id: true,
          status: true,
          ticketsBase: true,
          ticketsExtra: true,
          joinedAt: true,
          storiesShared: true,
          boostedChannelIds: true,
        },
      });

      if (existingParticipation) {
        participation = {
          ...existingParticipation,
          joinedAt: existingParticipation.joinedAt.toISOString(),
        };
      }
    }

    return reply.send({
      ok: true,
      giveaway: {
        id: giveaway.id,
        title: giveaway.title,
        status: giveaway.status,
        endAt: giveaway.endAt?.toISOString() || null,
        winnersCount: giveaway.winnersCount,
        participantsCount: giveaway._count.participations,
        buttonText: giveaway.buttonText || '🎁 Участвовать',
        postTemplate: giveaway.postTemplate ? {
          text: giveaway.postTemplate.text,
          mediaType: giveaway.postTemplate.mediaType,
        } : null,
        conditions: {
          requiredSubscriptions: channels.map(c => ({
            id: c.id,
            title: c.title,
            username: c.username ? `@${c.username}` : null,
            telegramChatId: c.telegramChatId.toString(),
          })),
          captchaMode: giveaway.condition?.captchaMode || 'SUSPICIOUS_ONLY',
          inviteEnabled: giveaway.condition?.inviteEnabled || false,
          inviteMax: giveaway.condition?.inviteMax || 10,
          boostEnabled: giveaway.condition?.boostEnabled || false,
          storiesEnabled: giveaway.condition?.storiesEnabled || false,
        },
      },
      participation,
    });
  });

  /**
   * POST /giveaways/:id/check-subscription
   * Проверить подписку пользователя на каналы
   */
  fastify.post<{ Params: { id: string } }>('/giveaways/:id/check-subscription', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    // Получаем розыгрыш
    const giveaway = await prisma.giveaway.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        draftPayload: true,
      },
    });

    if (!giveaway) {
      return reply.status(404).send({
        ok: false,
        error: 'Розыгрыш не найден',
      });
    }

    // Получаем каналы из draftPayload
    const draftPayload = (giveaway.draftPayload || {}) as {
      requiredSubscriptionChannelIds?: string[];
    };
    const requiredSubIds = draftPayload.requiredSubscriptionChannelIds || [];

    if (requiredSubIds.length === 0) {
      return reply.send({
        ok: true,
        subscribed: true,
        channels: [],
      });
    }

    // Загружаем каналы
    const channels = await prisma.channel.findMany({
      where: { id: { in: requiredSubIds } },
      select: {
        id: true,
        title: true,
        username: true,
        telegramChatId: true,
      },
    });

    // Проверяем подписки через internal API (бота)
    const results: Array<{ id: string; title: string; username: string | null; subscribed: boolean }> = [];
    let allSubscribed = true;

    for (const channel of channels) {
      try {
        // Вызываем internal endpoint для проверки подписки
        const response = await fetch(`${config.apiUrl}/internal/check-subscription`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Token': config.internalApiToken,
          },
          body: JSON.stringify({
            telegramUserId: user.telegramUserId.toString(),
            telegramChatId: channel.telegramChatId.toString(),
          }),
        });

        const data = await response.json() as { ok: boolean; isMember: boolean };
        const subscribed = data.ok && data.isMember;

        results.push({
          id: channel.id,
          title: channel.title,
          username: channel.username ? `@${channel.username}` : null,
          subscribed,
        });

        if (!subscribed) {
          allSubscribed = false;
        }
      } catch (error) {
        fastify.log.error(error, `Failed to check subscription for channel ${channel.id}`);
        results.push({
          id: channel.id,
          title: channel.title,
          username: channel.username ? `@${channel.username}` : null,
          subscribed: false,
        });
        allSubscribed = false;
      }
    }

    return reply.send({
      ok: true,
      subscribed: allSubscribed,
      channels: results,
    });
  });

  /**
   * POST /giveaways/:id/join
   * Финальное участие в розыгрыше
   */
  fastify.post<{ Params: { id: string } }>('/giveaways/:id/join', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;
    const body = joinGiveawaySchema.parse(request.body);

    // Получаем розыгрыш с условиями
    const giveaway = await prisma.giveaway.findUnique({
      where: { id },
      include: {
        condition: true,
      },
    });

    if (!giveaway) {
      return reply.status(404).send({
        ok: false,
        error: 'Розыгрыш не найден',
      });
    }

    // Проверяем статус
    if (giveaway.status !== GiveawayStatus.ACTIVE) {
      const statusMessages: Record<string, string> = {
        DRAFT: 'Розыгрыш ещё не опубликован',
        PENDING_CONFIRM: 'Розыгрыш ожидает подтверждения',
        SCHEDULED: 'Розыгрыш ещё не начался',
        FINISHED: 'Розыгрыш завершён',
        CANCELLED: 'Розыгрыш отменён',
        ERROR: 'Розыгрыш недоступен',
      };
      return reply.status(400).send({
        ok: false,
        error: statusMessages[giveaway.status] || 'Розыгрыш недоступен',
      });
    }

    // Проверяем что пользователь ещё не участвует
    const existingParticipation = await prisma.participation.findUnique({
      where: {
        giveawayId_userId: {
          giveawayId: id,
          userId: user.id,
        },
      },
    });

    if (existingParticipation) {
      return reply.status(400).send({
        ok: false,
        error: 'Вы уже участвуете в этом розыгрыше',
        participation: {
          id: existingParticipation.id,
          ticketsBase: existingParticipation.ticketsBase,
          ticketsExtra: existingParticipation.ticketsExtra,
          joinedAt: existingParticipation.joinedAt.toISOString(),
        },
      });
    }

    // Проверяем подписки (server-side)
    const draftPayload = (giveaway.draftPayload || {}) as {
      requiredSubscriptionChannelIds?: string[];
    };
    const requiredSubIds = draftPayload.requiredSubscriptionChannelIds || [];

    if (requiredSubIds.length > 0) {
      const channels = await prisma.channel.findMany({
        where: { id: { in: requiredSubIds } },
        select: { telegramChatId: true, title: true },
      });

      for (const channel of channels) {
        try {
          const response = await fetch(`${config.apiUrl}/internal/check-subscription`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Token': config.internalApiToken,
            },
            body: JSON.stringify({
              telegramUserId: user.telegramUserId.toString(),
              telegramChatId: channel.telegramChatId.toString(),
            }),
          });

          const data = await response.json() as { ok: boolean; isMember: boolean };
          if (!data.ok || !data.isMember) {
            return reply.status(400).send({
              ok: false,
              error: `Вы не подписаны на канал: ${channel.title}`,
              code: 'SUBSCRIPTION_REQUIRED',
            });
          }
        } catch (error) {
          fastify.log.error(error, 'Failed to verify subscription');
          return reply.status(500).send({
            ok: false,
            error: 'Не удалось проверить подписку',
          });
        }
      }
    }

    // Проверяем капчу (если требуется)
    const captchaMode = giveaway.condition?.captchaMode || 'SUSPICIOUS_ONLY';
    if (captchaMode === 'ALL' || (captchaMode === 'SUSPICIOUS_ONLY' && !user.isPremium)) {
      if (!body.captchaPassed) {
        return reply.status(400).send({
          ok: false,
          error: 'Пройдите проверку капчи',
          code: 'CAPTCHA_REQUIRED',
        });
      }
    }

    // Обработка реферера
    let validReferrerUserId: string | null = null;
    
    if (body.referrerUserId && body.referrerUserId !== user.id) {
      // Проверяем что реферер участвует в этом розыгрыше
      const referrerParticipation = await prisma.participation.findFirst({
        where: {
          giveawayId: id,
          userId: body.referrerUserId,
          status: ParticipationStatus.JOINED,
        },
        select: { id: true },
      });
      
      if (referrerParticipation) {
        // Проверяем лимит приглашений
        const currentInvites = await prisma.participation.count({
          where: {
            giveawayId: id,
            referrerUserId: body.referrerUserId,
          },
        });
        
        const inviteMax = giveaway.condition?.inviteMax || 10;
        
        if (currentInvites < inviteMax) {
          validReferrerUserId = body.referrerUserId;
        } else {
          fastify.log.info(
            { referrerUserId: body.referrerUserId, giveawayId: id, currentInvites, inviteMax },
            'Referrer invite limit reached'
          );
        }
      } else {
        fastify.log.info(
          { referrerUserId: body.referrerUserId, giveawayId: id },
          'Referrer not participating in giveaway'
        );
      }
    }

    // Создаём участие
    const participation = await prisma.participation.create({
      data: {
        giveawayId: id,
        userId: user.id,
        status: ParticipationStatus.JOINED,
        ticketsBase: 1,
        ticketsExtra: 0,
        sourceTag: body.sourceTag || null,
        referrerUserId: validReferrerUserId,
        conditionsSnapshot: {
          subscriptionsChecked: requiredSubIds.length,
          captchaPassed: body.captchaPassed,
          joinedAt: new Date().toISOString(),
          referredBy: validReferrerUserId,
        },
      },
      select: {
        id: true,
        ticketsBase: true,
        ticketsExtra: true,
        joinedAt: true,
      },
    });

    // Увеличиваем счётчик участников
    await prisma.giveaway.update({
      where: { id },
      data: {
        totalParticipants: { increment: 1 },
      },
    });

    // Если есть валидный реферер — добавляем ему билет
    if (validReferrerUserId) {
      await prisma.participation.updateMany({
        where: {
          giveawayId: id,
          userId: validReferrerUserId,
          status: ParticipationStatus.JOINED,
        },
        data: {
          ticketsExtra: { increment: 1 },
        },
      });
      
      fastify.log.info(
        { referrerUserId: validReferrerUserId, newUserId: user.id, giveawayId: id },
        'Referrer received bonus ticket'
      );
    }

    fastify.log.info(
      { userId: user.id, giveawayId: id, participationId: participation.id },
      'User joined giveaway'
    );

    return reply.send({
      ok: true,
      participation: {
        id: participation.id,
        ticketsBase: participation.ticketsBase,
        ticketsExtra: participation.ticketsExtra,
        joinedAt: participation.joinedAt.toISOString(),
      },
    });
  });

  /**
   * GET /captcha/generate
   * Генерирует математическую капчу
   */
  fastify.get('/captcha/generate', async (request, reply) => {
    // Генерируем простой пример
    const a = Math.floor(Math.random() * 10) + 1;
    const b = Math.floor(Math.random() * 10) + 1;
    const operators = ['+', '-'] as const;
    const operator = operators[Math.floor(Math.random() * operators.length)];
    
    let answer: number;
    let question: string;
    
    if (operator === '+') {
      answer = a + b;
      question = `${a} + ${b} = ?`;
    } else {
      // Убедимся что результат положительный
      const max = Math.max(a, b);
      const min = Math.min(a, b);
      answer = max - min;
      question = `${max} - ${min} = ?`;
    }

    const token = generateCaptchaToken({
      question,
      answer,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 минут
    });

    return reply.send({
      ok: true,
      question,
      token,
    });
  });

  /**
   * POST /captcha/verify
   * Проверяет ответ на капчу
   */
  fastify.post('/captcha/verify', async (request, reply) => {
    const body = z.object({
      token: z.string(),
      answer: z.number(),
    }).parse(request.body);

    const isValid = verifyCaptchaToken(body.token, body.answer);

    return reply.send({
      ok: isValid,
      error: isValid ? undefined : 'Неверный ответ',
    });
  });

  // =========================================================================
  // Реферальная система
  // =========================================================================

  // Имя бота для ссылок
  const BOT_USERNAME = process.env.BOT_USERNAME || 'BeastRandomBot';

  /**
   * GET /giveaways/:id/my-referral
   * Получить реферальную ссылку и статистику приглашений
   */
  fastify.get<{ Params: { id: string } }>('/giveaways/:id/my-referral', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    // Проверяем что пользователь участвует в розыгрыше
    const participation = await prisma.participation.findUnique({
      where: {
        giveawayId_userId: {
          giveawayId: id,
          userId: user.id,
        },
      },
      select: {
        id: true,
        status: true,
        ticketsExtra: true,
      },
    });

    if (!participation || participation.status !== ParticipationStatus.JOINED) {
      return reply.status(400).send({
        ok: false,
        error: 'Вы не участвуете в этом розыгрыше',
      });
    }

    // Получаем лимит приглашений
    const giveaway = await prisma.giveaway.findUnique({
      where: { id },
      include: {
        condition: {
          select: {
            inviteEnabled: true,
            inviteMax: true,
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

    // Считаем количество приглашённых
    const invitedCount = await prisma.participation.count({
      where: {
        giveawayId: id,
        referrerUserId: user.id,
      },
    });

    const inviteMax = giveaway.condition?.inviteMax || 10;
    const inviteEnabled = giveaway.condition?.inviteEnabled || false;

    // Формируем реферальную ссылку
    const referralLink = `https://t.me/${BOT_USERNAME}/participate?startapp=join_${id}_ref_${user.id}`;

    return reply.send({
      ok: true,
      referralLink,
      referralCode: user.id,
      invitedCount,
      inviteMax,
      inviteEnabled,
      ticketsFromInvites: invitedCount, // 1 билет за каждого приглашённого
    });
  });

  /**
   * GET /giveaways/:id/my-invites
   * Получить список приглашённых друзей
   */
  fastify.get<{ Params: { id: string } }>('/giveaways/:id/my-invites', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    // Проверяем что пользователь участвует в розыгрыше
    const participation = await prisma.participation.findUnique({
      where: {
        giveawayId_userId: {
          giveawayId: id,
          userId: user.id,
        },
      },
    });

    if (!participation || participation.status !== ParticipationStatus.JOINED) {
      return reply.status(400).send({
        ok: false,
        error: 'Вы не участвуете в этом розыгрыше',
      });
    }

    // Получаем лимит приглашений
    const giveaway = await prisma.giveaway.findUnique({
      where: { id },
      include: {
        condition: {
          select: {
            inviteMax: true,
          },
        },
      },
    });

    const inviteMax = giveaway?.condition?.inviteMax || 10;

    // Получаем список приглашённых
    const invitedParticipations = await prisma.participation.findMany({
      where: {
        giveawayId: id,
        referrerUserId: user.id,
        status: ParticipationStatus.JOINED,
      },
      select: {
        userId: true,
        joinedAt: true,
        user: {
          select: {
            firstName: true,
            lastName: true,
            username: true,
          },
        },
      },
      orderBy: {
        joinedAt: 'desc',
      },
      take: 50, // Лимит для производительности
    });

    const invites = invitedParticipations.map((p) => ({
      userId: p.userId,
      firstName: p.user.firstName || 'Пользователь',
      lastName: p.user.lastName || null,
      username: p.user.username || null,
      joinedAt: p.joinedAt.toISOString(),
    }));

    return reply.send({
      ok: true,
      invites,
      count: invites.length,
      max: inviteMax,
    });
  });

  // =========================================================================
  // Система бустов каналов
  // =========================================================================

  // Максимальное количество бустов на один канал, засчитываемых как билеты
  const MAX_BOOSTS_PER_CHANNEL = 10;

  /**
   * GET /giveaways/:id/my-boosts
   * Получить статус бустов для участника
   */
  fastify.get<{ Params: { id: string } }>('/giveaways/:id/my-boosts', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    // Получаем участие
    const participation = await prisma.participation.findUnique({
      where: {
        giveawayId_userId: {
          giveawayId: id,
          userId: user.id,
        },
      },
      select: {
        id: true,
        status: true,
        boostedChannelIds: true,
        boostsSnapshot: true,
        ticketsExtra: true,
      },
    });

    if (!participation || participation.status !== ParticipationStatus.JOINED) {
      return reply.status(400).send({
        ok: false,
        error: 'Вы не участвуете в этом розыгрыше',
      });
    }

    // Получаем розыгрыш с условиями
    const giveaway = await prisma.giveaway.findUnique({
      where: { id },
      include: {
        condition: {
          select: {
            boostEnabled: true,
            boostChannelIds: true,
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

    const boostEnabled = giveaway.condition?.boostEnabled || false;
    const boostChannelIds = giveaway.condition?.boostChannelIds || [];

    if (!boostEnabled || boostChannelIds.length === 0) {
      return reply.send({
        ok: true,
        boostEnabled: false,
        channels: [],
        totalBoosts: 0,
        maxBoostsPerChannel: MAX_BOOSTS_PER_CHANNEL,
        ticketsFromBoosts: 0,
      });
    }

    // Получаем каналы
    const channels = await prisma.channel.findMany({
      where: { id: { in: boostChannelIds } },
      select: {
        id: true,
        title: true,
        username: true,
        telegramChatId: true,
      },
    });

    // Парсим снапшот бустов
    const boostsSnapshot = (participation.boostsSnapshot || {}) as Record<string, number>;
    
    // Формируем данные о каналах с информацией о бустах
    const channelsData = channels.map((channel) => {
      const boostCount = boostsSnapshot[channel.id] || 0;
      return {
        id: channel.id,
        title: channel.title,
        username: channel.username ? `@${channel.username}` : null,
        telegramChatId: channel.telegramChatId.toString(),
        boosted: boostCount > 0,
        boostCount,
      };
    });

    // Считаем общее количество билетов от бустов
    const totalBoosts = Object.values(boostsSnapshot).reduce((sum, count) => sum + Math.min(count, MAX_BOOSTS_PER_CHANNEL), 0);

    return reply.send({
      ok: true,
      boostEnabled: true,
      channels: channelsData,
      totalBoosts,
      maxBoostsPerChannel: MAX_BOOSTS_PER_CHANNEL,
      ticketsFromBoosts: totalBoosts,
    });
  });

  /**
   * POST /giveaways/:id/verify-boost
   * Проверить и засчитать буст для канала
   */
  fastify.post<{ Params: { id: string } }>('/giveaways/:id/verify-boost', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;
    const body = z.object({
      channelId: z.string().uuid(),
    }).parse(request.body);

    // Получаем участие
    const participation = await prisma.participation.findUnique({
      where: {
        giveawayId_userId: {
          giveawayId: id,
          userId: user.id,
        },
      },
    });

    if (!participation || participation.status !== ParticipationStatus.JOINED) {
      return reply.status(400).send({
        ok: false,
        error: 'Вы не участвуете в этом розыгрыше',
      });
    }

    // Получаем розыгрыш с условиями
    const giveaway = await prisma.giveaway.findUnique({
      where: { id },
      include: {
        condition: {
          select: {
            boostEnabled: true,
            boostChannelIds: true,
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

    const boostEnabled = giveaway.condition?.boostEnabled || false;
    const boostChannelIds = giveaway.condition?.boostChannelIds || [];

    if (!boostEnabled) {
      return reply.status(400).send({
        ok: false,
        error: 'Бусты не включены для этого розыгрыша',
      });
    }

    // Проверяем что канал входит в список для бустов
    if (!boostChannelIds.includes(body.channelId)) {
      return reply.status(400).send({
        ok: false,
        error: 'Канал не входит в список для бустов',
      });
    }

    // Получаем канал
    const channel = await prisma.channel.findUnique({
      where: { id: body.channelId },
      select: {
        id: true,
        title: true,
        telegramChatId: true,
      },
    });

    if (!channel) {
      return reply.status(404).send({
        ok: false,
        error: 'Канал не найден',
      });
    }

    // Проверяем бусты через internal API
    let actualBoostCount = 0;
    try {
      const response = await fetch(`${config.apiUrl}/internal/check-boosts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': config.internalApiToken,
        },
        body: JSON.stringify({
          telegramUserId: user.telegramUserId.toString(),
          telegramChatId: channel.telegramChatId.toString(),
        }),
      });

      const data = await response.json() as { ok: boolean; count: number; boosts: Array<{ boostId: string }> };
      if (data.ok) {
        actualBoostCount = data.count;
      }
    } catch (error) {
      fastify.log.error(error, 'Failed to check boosts');
      return reply.status(500).send({
        ok: false,
        error: 'Не удалось проверить бусты',
      });
    }

    // Парсим текущий снапшот
    const boostsSnapshot = (participation.boostsSnapshot || {}) as Record<string, number>;
    const previousBoostCount = boostsSnapshot[body.channelId] || 0;

    // Считаем новые бусты
    const newBoosts = Math.max(0, actualBoostCount - previousBoostCount);
    
    // Лимит на канал
    const cappedPrevious = Math.min(previousBoostCount, MAX_BOOSTS_PER_CHANNEL);
    const cappedNew = Math.min(actualBoostCount, MAX_BOOSTS_PER_CHANNEL);
    const ticketsToAdd = Math.max(0, cappedNew - cappedPrevious);

    // Обновляем снапшот и билеты
    if (actualBoostCount > previousBoostCount) {
      boostsSnapshot[body.channelId] = actualBoostCount;

      // Добавляем канал в список забустенных если ещё нет
      const boostedChannelIds = participation.boostedChannelIds.includes(body.channelId)
        ? participation.boostedChannelIds
        : [...participation.boostedChannelIds, body.channelId];

      await prisma.participation.update({
        where: { id: participation.id },
        data: {
          boostsSnapshot,
          boostedChannelIds,
          ticketsExtra: { increment: ticketsToAdd },
        },
      });

      fastify.log.info(
        { userId: user.id, giveawayId: id, channelId: body.channelId, newBoosts, ticketsToAdd },
        'Boost verified and tickets added'
      );
    }

    // Получаем обновлённые данные
    const updatedParticipation = await prisma.participation.findUnique({
      where: { id: participation.id },
      select: {
        ticketsBase: true,
        ticketsExtra: true,
      },
    });

    return reply.send({
      ok: true,
      newBoosts,
      totalBoostsForChannel: actualBoostCount,
      ticketsAdded: ticketsToAdd,
      totalTickets: (updatedParticipation?.ticketsBase || 1) + (updatedParticipation?.ticketsExtra || 0),
    });
  });

  // =========================================================================
  // Сторис
  // =========================================================================

  /**
   * POST /giveaways/:id/submit-story
   * Отправить заявку на проверку сторис
   * Создаёт StoryRequest со статусом PENDING
   */
  fastify.post<{ Params: { id: string } }>('/giveaways/:id/submit-story', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    // Получаем участие с заявкой на сторис
    const participation = await prisma.participation.findUnique({
      where: {
        giveawayId_userId: {
          giveawayId: id,
          userId: user.id,
        },
      },
      include: {
        storyRequest: true,
      },
    });

    if (!participation || participation.status !== ParticipationStatus.JOINED) {
      return reply.status(400).send({
        ok: false,
        error: 'Вы не участвуете в этом розыгрыше',
      });
    }

    // Проверяем что storiesEnabled для розыгрыша
    const giveaway = await prisma.giveaway.findUnique({
      where: { id },
      include: {
        condition: {
          select: {
            storiesEnabled: true,
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

    const storiesEnabled = giveaway.condition?.storiesEnabled || false;

    if (!storiesEnabled) {
      return reply.status(400).send({
        ok: false,
        error: 'Сторис не включены для этого розыгрыша',
      });
    }

    // Проверяем текущий статус заявки
    if (participation.storyRequest) {
      const status = participation.storyRequest.status;
      
      if (status === 'APPROVED') {
        return reply.status(400).send({
          ok: false,
          error: 'ALREADY_APPROVED',
          message: 'Вы уже получили билет за сторис',
        });
      }
      
      if (status === 'PENDING') {
        return reply.status(400).send({
          ok: false,
          error: 'ALREADY_PENDING',
          message: 'Ваша заявка уже на проверке',
        });
      }
      
      // Если REJECTED — можно отправить снова, удаляем старую заявку
      if (status === 'REJECTED') {
        await prisma.storyRequest.delete({
          where: { id: participation.storyRequest.id },
        });
      }
    }

    // Создаём заявку на проверку
    const storyRequest = await prisma.storyRequest.create({
      data: {
        participationId: participation.id,
        status: 'PENDING',
      },
    });

    fastify.log.info(
      { userId: user.id, giveawayId: id, storyRequestId: storyRequest.id },
      'Story request submitted'
    );

    return reply.send({
      ok: true,
      status: 'PENDING',
      message: 'Заявка отправлена на проверку',
    });
  });

  /**
   * GET /giveaways/:id/my-story-request
   * Получить статус своей заявки на сторис
   */
  fastify.get<{ Params: { id: string } }>('/giveaways/:id/my-story-request', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    const participation = await prisma.participation.findUnique({
      where: {
        giveawayId_userId: {
          giveawayId: id,
          userId: user.id,
        },
      },
      include: {
        storyRequest: true,
      },
    });

    if (!participation) {
      return reply.status(400).send({
        ok: false,
        error: 'Вы не участвуете в этом розыгрыше',
      });
    }

    if (!participation.storyRequest) {
      return reply.send({
        ok: true,
        hasRequest: false,
        status: null,
      });
    }

    return reply.send({
      ok: true,
      hasRequest: true,
      status: participation.storyRequest.status,
      submittedAt: participation.storyRequest.submittedAt.toISOString(),
      reviewedAt: participation.storyRequest.reviewedAt?.toISOString() || null,
      rejectReason: participation.storyRequest.rejectReason || null,
    });
  });

  /**
   * GET /giveaways/:id/story-requests
   * Получить список заявок на сторис для модерации (только владелец розыгрыша)
   */
  fastify.get<{ Params: { id: string } }>('/giveaways/:id/story-requests', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    // Проверяем что пользователь — владелец розыгрыша
    const giveaway = await prisma.giveaway.findUnique({
      where: { id },
      select: { ownerUserId: true },
    });

    if (!giveaway) {
      return reply.status(404).send({
        ok: false,
        error: 'Розыгрыш не найден',
      });
    }

    if (giveaway.ownerUserId !== user.id) {
      return reply.status(403).send({
        ok: false,
        error: 'Нет доступа',
      });
    }

    // Получаем все заявки
    const storyRequests = await prisma.storyRequest.findMany({
      where: {
        participation: {
          giveawayId: id,
        },
      },
      include: {
        participation: {
          include: {
            user: {
              select: {
                id: true,
                telegramUserId: true,
                username: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
      orderBy: [
        { status: 'asc' }, // PENDING первыми
        { submittedAt: 'desc' },
      ],
    });

    const requests = storyRequests.map((req) => ({
      id: req.id,
      status: req.status,
      submittedAt: req.submittedAt.toISOString(),
      reviewedAt: req.reviewedAt?.toISOString() || null,
      rejectReason: req.rejectReason || null,
      user: {
        id: req.participation.user.id,
        telegramUserId: req.participation.user.telegramUserId.toString(),
        username: req.participation.user.username,
        firstName: req.participation.user.firstName,
        lastName: req.participation.user.lastName,
      },
    }));

    // Считаем статистику
    const pendingCount = requests.filter((r) => r.status === 'PENDING').length;
    const approvedCount = requests.filter((r) => r.status === 'APPROVED').length;
    const rejectedCount = requests.filter((r) => r.status === 'REJECTED').length;

    return reply.send({
      ok: true,
      requests,
      stats: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        total: requests.length,
      },
    });
  });

  /**
   * POST /giveaways/:id/story-requests/:requestId/approve
   * Одобрить заявку на сторис
   */
  fastify.post<{ Params: { id: string; requestId: string } }>(
    '/giveaways/:id/story-requests/:requestId/approve',
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const { id, requestId } = request.params;

      // Проверяем что пользователь — владелец розыгрыша
      const giveaway = await prisma.giveaway.findUnique({
        where: { id },
        select: { ownerUserId: true },
      });

      if (!giveaway) {
        return reply.status(404).send({
          ok: false,
          error: 'Розыгрыш не найден',
        });
      }

      if (giveaway.ownerUserId !== user.id) {
        return reply.status(403).send({
          ok: false,
          error: 'Нет доступа',
        });
      }

      // Получаем заявку
      const storyRequest = await prisma.storyRequest.findUnique({
        where: { id: requestId },
        include: {
          participation: {
            select: {
              id: true,
              giveawayId: true,
            },
          },
        },
      });

      if (!storyRequest || storyRequest.participation.giveawayId !== id) {
        return reply.status(404).send({
          ok: false,
          error: 'Заявка не найдена',
        });
      }

      if (storyRequest.status === 'APPROVED') {
        return reply.status(400).send({
          ok: false,
          error: 'Заявка уже одобрена',
        });
      }

      // Одобряем заявку и начисляем билет
      await prisma.$transaction([
        prisma.storyRequest.update({
          where: { id: requestId },
          data: {
            status: 'APPROVED',
            reviewedAt: new Date(),
            reviewedBy: user.id,
          },
        }),
        prisma.participation.update({
          where: { id: storyRequest.participation.id },
          data: {
            storiesShared: true,
            storiesSharedAt: new Date(),
            ticketsExtra: { increment: 1 },
          },
        }),
      ]);

      fastify.log.info(
        { reviewerId: user.id, storyRequestId: requestId },
        'Story request approved'
      );

      return reply.send({
        ok: true,
        message: 'Заявка одобрена, билет начислен',
      });
    }
  );

  /**
   * POST /giveaways/:id/story-requests/:requestId/reject
   * Отклонить заявку на сторис
   */
  fastify.post<{ Params: { id: string; requestId: string } }>(
    '/giveaways/:id/story-requests/:requestId/reject',
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const { id, requestId } = request.params;

      const bodySchema = z.object({
        reason: z.string().optional(),
      });
      
      const body = bodySchema.parse(request.body);

      // Проверяем что пользователь — владелец розыгрыша
      const giveaway = await prisma.giveaway.findUnique({
        where: { id },
        select: { ownerUserId: true },
      });

      if (!giveaway) {
        return reply.status(404).send({
          ok: false,
          error: 'Розыгрыш не найден',
        });
      }

      if (giveaway.ownerUserId !== user.id) {
        return reply.status(403).send({
          ok: false,
          error: 'Нет доступа',
        });
      }

      // Получаем заявку
      const storyRequest = await prisma.storyRequest.findUnique({
        where: { id: requestId },
        include: {
          participation: {
            select: {
              giveawayId: true,
            },
          },
        },
      });

      if (!storyRequest || storyRequest.participation.giveawayId !== id) {
        return reply.status(404).send({
          ok: false,
          error: 'Заявка не найдена',
        });
      }

      if (storyRequest.status !== 'PENDING') {
        return reply.status(400).send({
          ok: false,
          error: 'Можно отклонить только заявку на проверке',
        });
      }

      // Отклоняем заявку
      await prisma.storyRequest.update({
        where: { id: requestId },
        data: {
          status: 'REJECTED',
          reviewedAt: new Date(),
          reviewedBy: user.id,
          rejectReason: body.reason || null,
        },
      });

      fastify.log.info(
        { reviewerId: user.id, storyRequestId: requestId, reason: body.reason },
        'Story request rejected'
      );

      return reply.send({
        ok: true,
        message: 'Заявка отклонена',
      });
    }
  );

  // =============================================================================
  // Раздел "Участник" — список розыгрышей где я участвую
  // =============================================================================

  /**
   * GET /participations/my
   * Список розыгрышей где текущий пользователь участвует
   * Query: status (all|active|finished|won|cancelled), limit, offset
   */
  fastify.get<{
    Querystring: {
      status?: string;
      limit?: string;
      offset?: string;
    };
  }>('/participations/my', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { status = 'all', limit = '20', offset = '0' } = request.query;
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));
    const offsetNum = Math.max(0, parseInt(offset) || 0);

    // Базовый where для участий текущего пользователя
    const baseWhere = { userId: user.id };

    // Формируем фильтр по статусу розыгрыша
    let giveawayStatusFilter: GiveawayStatus[] | undefined;
    let isWonFilter = false;

    switch (status) {
      case 'active':
        giveawayStatusFilter = [GiveawayStatus.ACTIVE, GiveawayStatus.SCHEDULED];
        break;
      case 'finished':
        giveawayStatusFilter = [GiveawayStatus.FINISHED];
        break;
      case 'cancelled':
        giveawayStatusFilter = [GiveawayStatus.CANCELLED];
        break;
      case 'won':
        isWonFilter = true;
        break;
      // 'all' — без фильтра
    }

    // Для фильтра "won" — сначала получаем победные giveawayId
    let wonGiveawayIds: string[] = [];
    if (isWonFilter) {
      const wins = await prisma.winner.findMany({
        where: { userId: user.id },
        select: { giveawayId: true },
      });
      wonGiveawayIds = wins.map(w => w.giveawayId);
    }

    // Получаем участия
    const whereClause = {
      ...baseWhere,
      ...(giveawayStatusFilter && {
        giveaway: { status: { in: giveawayStatusFilter } },
      }),
      ...(isWonFilter && {
        giveawayId: { in: wonGiveawayIds },
      }),
    };

    const [participations, total] = await Promise.all([
      prisma.participation.findMany({
        where: whereClause,
        include: {
          giveaway: {
            select: {
              id: true,
              title: true,
              status: true,
              endAt: true,
              winnersCount: true,
              postTemplate: {
                select: {
                  text: true,
                  mediaType: true,
                },
              },
              _count: {
                select: { participations: true },
              },
            },
          },
        },
        orderBy: { joinedAt: 'desc' },
        take: limitNum,
        skip: offsetNum,
      }),
      prisma.participation.count({ where: whereClause }),
    ]);

    // Получаем победы пользователя для отметки isWinner
    const userWins = await prisma.winner.findMany({
      where: { userId: user.id },
      select: { giveawayId: true, place: true },
    });
    const winsMap = new Map(userWins.map(w => [w.giveawayId, w.place]));

    // Подсчёт по категориям
    const [allCount, activeCount, finishedCount, wonCount, cancelledCount] = await Promise.all([
      prisma.participation.count({ where: baseWhere }),
      prisma.participation.count({
        where: {
          ...baseWhere,
          giveaway: { status: { in: [GiveawayStatus.ACTIVE, GiveawayStatus.SCHEDULED] } },
        },
      }),
      prisma.participation.count({
        where: {
          ...baseWhere,
          giveaway: { status: GiveawayStatus.FINISHED },
        },
      }),
      prisma.winner.count({ where: { userId: user.id } }),
      prisma.participation.count({
        where: {
          ...baseWhere,
          giveaway: { status: GiveawayStatus.CANCELLED },
        },
      }),
    ]);

    // Формируем ответ
    const result = participations.map(p => {
      const winPlace = winsMap.get(p.giveawayId);
      return {
        id: p.id,
        giveaway: {
          id: p.giveaway.id,
          title: p.giveaway.title || 'Без названия',
          status: p.giveaway.status,
          endAt: p.giveaway.endAt?.toISOString() || null,
          winnersCount: p.giveaway.winnersCount,
          participantsCount: p.giveaway._count.participations,
          postTemplate: p.giveaway.postTemplate
            ? {
                text: p.giveaway.postTemplate.text.substring(0, 100),
                mediaType: p.giveaway.postTemplate.mediaType,
              }
            : null,
        },
        ticketsBase: p.ticketsBase,
        ticketsExtra: p.ticketsExtra,
        totalTickets: p.ticketsBase + p.ticketsExtra,
        joinedAt: p.joinedAt.toISOString(),
        isWinner: winPlace !== undefined,
        winnerPlace: winPlace ?? null,
      };
    });

    return reply.send({
      ok: true,
      participations: result,
      counts: {
        all: allCount,
        active: activeCount,
        finished: finishedCount,
        won: wonCount,
        cancelled: cancelledCount,
      },
      total,
      hasMore: offsetNum + limitNum < total,
    });
  });
};
