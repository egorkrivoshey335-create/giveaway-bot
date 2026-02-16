import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, GiveawayStatus, ParticipationStatus } from '@randombeast/database';
import { ErrorCode } from '@randombeast/shared';
import { getUser, requireUser } from '../plugins/auth.js';
import { config } from '../config.js';
import { calculateFraudScore, requiresCaptcha } from '../lib/antifraud.js';
import { createAuditLog, AuditAction, AuditEntityType } from '../lib/audit.js';
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
  attempts: number; // 🔒 ЗАДАЧА 7.1: Счетчик попыток
}

// In-memory хранилище токенов капчи (для MVP)
// В production использовать Redis
const captchaTokens = new Map<string, CaptchaData>();

// 🔒 ЗАДАЧА 7.1: Брутфорс защита - лимит генераций на userId
// Структура: userId => timestamp[]
const captchaGenerations = new Map<string, number[]>();

// Очистка просроченных токенов каждые 5 минут
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of captchaTokens.entries()) {
    if (data.expiresAt < now) {
      captchaTokens.delete(token);
    }
  }
  
  // Очистка старых генераций (>10 минут)
  for (const [userId, timestamps] of captchaGenerations.entries()) {
    const filtered = timestamps.filter(ts => now - ts < 10 * 60 * 1000);
    if (filtered.length === 0) {
      captchaGenerations.delete(userId);
    } else {
      captchaGenerations.set(userId, filtered);
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
 * 🔒 ЗАДАЧА 7.1: Проверка лимита генераций капчи (10 за 10 минут)
 */
function checkCaptchaGenerationLimit(userId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const timestamps = captchaGenerations.get(userId) || [];
  
  // Фильтруем только последние 10 минут
  const recentTimestamps = timestamps.filter(ts => now - ts < 10 * 60 * 1000);
  
  if (recentTimestamps.length >= 10) {
    // Превышен лимит - вычисляем через сколько можно повторить
    const oldestTimestamp = Math.min(...recentTimestamps);
    const retryAfter = Math.ceil((oldestTimestamp + 10 * 60 * 1000 - now) / 1000);
    return { allowed: false, retryAfter };
  }
  
  // Разрешаем и добавляем timestamp
  recentTimestamps.push(now);
  captchaGenerations.set(userId, recentTimestamps);
  
  return { allowed: true };
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
  
  // 🔒 ЗАДАЧА 7.1: Проверка лимита попыток (5 на 1 captchaId)
  if (data.attempts >= 5) {
    captchaTokens.delete(token);
    return false;
  }
  
  // Увеличиваем счетчик попыток
  data.attempts++;
  
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
      return reply.success({ subscribed: true,
        channels: [] });
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

    return reply.success({ subscribed: allSubscribed,
      channels: results });
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

    // 🔒 ЗАДАЧА 7.7: Проверяем что розыгрыш не истёк (endAt)
    if (giveaway.endAt && new Date() > giveaway.endAt) {
      return reply.status(409).send({
        ok: false,
        error: 'Розыгрыш уже завершён',
        code: 'GIVEAWAY_EXPIRED',
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

    // 🔒 ЗАДАЧА 7.3: Вычисляем fraud score для антифрод системы
    // Получаем полные данные пользователя для antifraud
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        telegramUserId: true,
      },
    });

    if (!fullUser) {
      return reply.status(500).send({
        ok: false,
        error: 'Ошибка получения данных пользователя',
      });
    }

    // Считаем сколько участий за последние 24 часа
    const recentParticipations = await prisma.participation.count({
      where: {
        userId: user.id,
        joinedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 часа назад
        },
      },
    });

    // Вычисляем fraud score
    const fraudScore = calculateFraudScore({
      user: fullUser,
      giveaway,
      timeSinceOpen: undefined, // TODO: трекать время открытия розыгрыша в будущем
      previousParticipationsCount: recentParticipations,
    });

    // Проверяем требуется ли капча на основе fraud score
    const captchaMode = giveaway.condition?.captchaMode || 'SUSPICIOUS_ONLY';
    const captchaRequired = requiresCaptcha(fraudScore, captchaMode);
    
    if (captchaRequired && !body.captchaPassed) {
      return reply.status(400).send({
        ok: false,
        error: fraudScore >= 61 
          ? 'Требуется проверка безопасности. Пройдите капчу.'
          : 'Пройдите проверку капчи',
        code: 'CAPTCHA_REQUIRED',
        fraudScore: fraudScore >= 61 ? 'HIGH' : 'MEDIUM', // Не раскрываем точный score
      });
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

    // 🔒 ЗАДАЧА 7.11: Создаём участие с displayName и fraudScore
    const participation = await prisma.participation.create({
      data: {
        giveawayId: id,
        userId: user.id,
        status: ParticipationStatus.JOINED,
        ticketsBase: 1,
        ticketsExtra: 0,
        sourceTag: body.sourceTag || null,
        referrerUserId: validReferrerUserId,
        fraudScore, // Сохраняем fraud score
        displayName: fullUser.firstName || fullUser.username || `User${fullUser.telegramUserId}`, // Имя на момент участия
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
        fraudScore: true,
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

    // 🔒 ЗАДАЧА 7.10: Audit log - участие в розыгрыше
    await createAuditLog({
      userId: user.id,
      action: AuditAction.PARTICIPANT_JOINED,
      entityType: AuditEntityType.PARTICIPATION,
      entityId: participation.id,
      metadata: {
        giveawayId: id,
        fraudScore: participation.fraudScore,
        referrerUserId: validReferrerUserId,
        sourceTag: body.sourceTag,
      },
      request,
    });

    return reply.send({
      ok: true,
      participation: {
        id: participation.id,
        ticketsBase: participation.ticketsBase,
        ticketsExtra: participation.ticketsExtra,
        joinedAt: participation.joinedAt.toISOString(),
        fraudScore: participation.fraudScore, // Возвращаем для отладки (можно убрать в prod)
      },
    });
  });

  /**
   * GET /captcha/generate
   * Генерирует математическую капчу
   * 🔒 ЗАДАЧА 7.1: С проверкой брутфорс лимита (10 генераций за 10 минут)
   */
  fastify.get('/captcha/generate', async (request, reply) => {
    const user = await getUser(request);
    
    // 🔒 Проверка лимита генераций (если пользователь авторизован)
    if (user) {
      const limitCheck = checkCaptchaGenerationLimit(user.id);
      if (!limitCheck.allowed) {
        return reply.status(429).send({
          success: false,
          error: {
            code: 'TOO_MANY_CAPTCHA_REQUESTS',
            message: 'Слишком много попыток. Попробуйте позже.',
            details: { retryAfter: limitCheck.retryAfter },
          },
        });
      }
    }
    
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
      attempts: 0, // Начальное значение счетчика попыток
    });

    return reply.success({ 
      question,
      token,
    });
  });

  /**
   * POST /captcha/verify
   * Проверяет ответ на капчу
   * 🔒 ЗАДАЧА 7.1: С проверкой лимита попыток (5 на 1 captchaId)
   */
  fastify.post('/captcha/verify', async (request, reply) => {
    const body = z.object({
      token: z.string(),
      answer: z.number(),
    }).parse(request.body);

    const captchaData = captchaTokens.get(body.token);
    
    // Проверка лимита попыток перед валидацией
    if (captchaData && captchaData.attempts >= 5) {
      captchaTokens.delete(body.token);
      return reply.send({
        ok: false,
        error: 'Превышен лимит попыток. Запросите новую капчу.',
        code: 'TOO_MANY_ATTEMPTS',
      });
    }

    const isValid = verifyCaptchaToken(body.token, body.answer);

    if (!isValid && captchaData) {
      return reply.send({
        ok: false,
        error: 'Неверный ответ',
        attemptsLeft: Math.max(0, 5 - captchaData.attempts),
      });
    }

    return reply.send({
      ok: isValid,
      error: isValid ? undefined : 'Неверный ответ или истекший токен',
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

    return reply.success({ referralLink,
      referralCode: user.id,
      invitedCount,
      inviteMax,
      inviteEnabled,
      ticketsFromInvites: invitedCount, // 1 билет за каждого приглашённого });
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

    return reply.success({ invites,
      count: invites.length,
      max: inviteMax });
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
      return reply.success({ boostEnabled: false,
        channels: [],
        totalBoosts: 0,
        maxBoostsPerChannel: MAX_BOOSTS_PER_CHANNEL,
        ticketsFromBoosts: 0 });
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

    return reply.success({ boostEnabled: true,
      channels: channelsData,
      totalBoosts,
      maxBoostsPerChannel: MAX_BOOSTS_PER_CHANNEL,
      ticketsFromBoosts: totalBoosts });
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

};
