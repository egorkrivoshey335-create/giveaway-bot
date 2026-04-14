import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, GiveawayStatus, ParticipationStatus } from '@randombeast/database';
import { ErrorCode } from '@randombeast/shared';
import { getUser, requireUser } from '../plugins/auth.js';
import { config } from '../config.js';
import { calculateFraudScore, requiresCaptcha } from '../lib/antifraud.js';
import { createAuditLog, AuditAction, AuditEntityType } from '../lib/audit.js';
import { getUserTier, isTierAtLeast } from '../lib/subscription.js';
import crypto from 'crypto';
import { RATE_LIMITS } from '../config/rate-limits.js';

// Схема для проверки подписки
const checkSubscriptionSchema = z.object({
  channelIds: z.array(z.string().uuid()).optional(),
});

// Схема для участия
const joinGiveawaySchema = z.object({
  captchaPassed: z.boolean().optional().default(false),
  captchaToken: z.string().optional(),
  turnstileToken: z.string().optional(),
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

// 🔒 ИСПРАВЛЕНО (2026-02-16): Миграция с in-memory на Redis
// Префиксы ключей:
// captcha:token:{token} - данные капчи (TTL 5 минут)
// captcha:gen:{userId} - список timestamp генераций (TTL 10 минут)

import { redis } from '../lib/redis.js';
import { awardParticipationBadges } from '../lib/badges.js';
import { notifyCatalogCandidate } from '../lib/admin-notify.js';

/**
 * Check if a Telegram user is a member of a channel/chat via Bot API directly.
 * Avoids internal HTTP roundtrip which can fail behind reverse proxies.
 */
async function checkTelegramSubscription(
  telegramUserId: string,
  telegramChatId: string,
): Promise<{ isMember: boolean; status: string }> {
  const botToken = config.botToken;
  if (!botToken) return { isMember: false, status: 'bot_not_configured' };

  const cacheKey = `subscription:${telegramUserId}:${telegramChatId}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch { /* ignore */ }

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getChatMember`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: telegramChatId, user_id: telegramUserId }),
    });

    const data = await res.json() as { ok: boolean; result?: { status: string }; description?: string };

    if (!data.ok || !data.result) {
      return { isMember: false, status: 'error' };
    }

    const memberStatus = data.result.status;
    const isMember = ['member', 'administrator', 'creator'].includes(memberStatus);
    const result = { isMember, status: memberStatus };

    try { await redis.setex(cacheKey, 30, JSON.stringify(result)); } catch { /* ignore */ }

    return result;
  } catch {
    return { isMember: false, status: 'error' };
  }
}

// =========================================================================
// Генерация уникального короткого реферального кода (URL-безопасный, без ambiguous chars)
// =========================================================================
function generateNanoid(size = 8): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(size);
  return Array.from(bytes).map(b => alphabet[b % alphabet.length]).join('');
}

/**
 * Уведомить реферера в Telegram о том, что его друг вступил в розыгрыш
 */
async function notifyReferrerJoined(
  referrerUserId: string,
  newUserId: string,
  giveawayId: string,
  log: { warn: (obj: unknown, msg: string) => void }
): Promise<void> {
  try {
    const { config: apiConfig } = await import('../config.js');
    if (!apiConfig.botToken) return;

    const [referrer, newUser, giveaway] = await Promise.all([
      prisma.user.findUnique({
        where: { id: referrerUserId },
        select: { telegramUserId: true, language: true },
      }),
      prisma.user.findUnique({
        where: { id: newUserId },
        select: { firstName: true, username: true },
      }),
      prisma.giveaway.findUnique({
        where: { id: giveawayId },
        select: { title: true },
      }),
    ]);

    if (!referrer?.telegramUserId) return;

    const friendName = newUser?.username
      ? `@${newUser.username}`
      : newUser?.firstName || 'Ваш друг';
    const lang = (referrer.language || 'ru').toLowerCase();

    const messages: Record<string, string> = {
      ru: `🎉 <b>${friendName} вступил по вашей реферальной ссылке!</b>\n\n+1 дополнительный билет в розыгрыше «${giveaway?.title ?? ''}».`,
      en: `🎉 <b>${friendName} joined via your referral link!</b>\n\n+1 extra ticket in the giveaway "${giveaway?.title ?? ''}".`,
      kk: `🎉 <b>${friendName} сіздің реферал сілтемеңіз арқылы қосылды!</b>\n\n«${giveaway?.title ?? ''}» ұтыс ойынында +1 қосымша билет.`,
    };

    const text = messages[lang] ?? messages['ru'];

    await fetch(`https://api.telegram.org/bot${apiConfig.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: Number(referrer.telegramUserId),
        text,
        parse_mode: 'HTML',
      }),
    });
  } catch (err) {
    log.warn({ err }, 'Failed to notify referrer on friend join');
  }
}

/**
 * Генерация токена капчи (Redis)
 */
async function generateCaptchaToken(data: CaptchaData): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const key = `captcha:token:${token}`;
  
  // Сохраняем в Redis с TTL 5 минут
  await redis.setex(
    key,
    5 * 60, // 5 минут
    JSON.stringify(data)
  );
  
  return token;
}

/**
 * 🔒 ЗАДАЧА 7.1: Проверка лимита генераций капчи (10 за 10 минут)
 * ИСПРАВЛЕНО (2026-02-16): Использование Redis вместо in-memory Map
 */
async function checkCaptchaGenerationLimit(userId: string): Promise<{ allowed: boolean; retryAfter?: number }> {
  const now = Date.now();
  const key = `captcha:gen:${userId}`;
  
  // Получаем список timestamps из Redis
  const data = await redis.get(key);
  let timestamps: number[] = data ? JSON.parse(data) : [];
  
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
  
  // Сохраняем обратно в Redis с TTL 10 минут
  await redis.setex(
    key,
    10 * 60, // 10 минут
    JSON.stringify(recentTimestamps)
  );
  
  return { allowed: true };
}

/**
 * Проверка токена капчи (Redis)
 * ИСПРАВЛЕНО (2026-02-16): Использование Redis
 */
async function verifyCaptchaToken(token: string, userAnswer: number): Promise<boolean> {
  const key = `captcha:token:${token}`;
  const data = await redis.get(key);
  
  if (!data) return false;
  
  const captchaData: CaptchaData = JSON.parse(data);
  
  if (captchaData.expiresAt < Date.now()) {
    await redis.del(key);
    return false;
  }
  
  // 🔒 ЗАДАЧА 7.1: Проверка лимита попыток (5 на 1 captchaId)
  if (captchaData.attempts >= 5) {
    await redis.del(key);
    return false;
  }
  
  // Увеличиваем счетчик попыток
  captchaData.attempts++;
  
  const isValid = captchaData.answer === userAnswer;
  if (isValid) {
    await redis.del(key);
  } else {
    // Обновляем данные в Redis
    await redis.setex(
      key,
      Math.ceil((captchaData.expiresAt - Date.now()) / 1000),
      JSON.stringify(captchaData)
    );
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

    // Получаем данные из draftPayload
    const draftPayload = (giveaway.draftPayload || {}) as {
      requiredSubscriptionChannelIds?: string[];
      mascotId?: string;
    };
    const requiredSubIds = draftPayload.requiredSubscriptionChannelIds || [];
    const mascotType = draftPayload.mascotId || null;

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

    return reply.success({
      giveaway: {
        id: giveaway.id,
        title: giveaway.title,
        status: giveaway.status,
        endAt: giveaway.endAt?.toISOString() || null,
        winnersCount: giveaway.winnersCount,
        participantsCount: giveaway._count.participations,
        buttonText: giveaway.buttonText || '🎁 Участвовать',
        mascotType,
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
   * 🔒 ИСПРАВЛЕНО (2026-02-16): endpoint-specific rate limit
   */
  fastify.post<{ Params: { id: string } }>(
    '/giveaways/:id/check-subscription',
    {
      config: {
        rateLimit: {
          max: RATE_LIMITS.CHECK_SUBSCRIPTION.max,
          timeWindow: RATE_LIMITS.CHECK_SUBSCRIPTION.timeWindow,
        },
      },
    },
    async (request, reply) => {
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
      return reply.success({ 
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
        const { isMember } = await checkTelegramSubscription(
          user.telegramUserId.toString(),
          channel.telegramChatId.toString(),
        );

        results.push({
          id: channel.id,
          title: channel.title,
          username: channel.username ? `@${channel.username}` : null,
          subscribed: isMember,
        });

        if (!isMember) {
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

    return reply.success({ 
      subscribed: allSubscribed,
      channels: results,
    });
  });

  /**
   * POST /giveaways/:id/join
   * Финальное участие в розыгрыше
   * 🔒 ИСПРАВЛЕНО (2026-02-16): Добавлен Redis lock + endpoint-specific rate limit
   */
  fastify.post<{ Params: { id: string } }>(
    '/giveaways/:id/join',
    {
      config: {
        rateLimit: {
          max: RATE_LIMITS.JOIN_GIVEAWAY.max,
          timeWindow: RATE_LIMITS.JOIN_GIVEAWAY.timeWindow,
        },
      },
    },
    async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;
    const body = joinGiveawaySchema.parse(request.body);

    // 🔒 REDIS LOCK: защита от double-join race condition
    const lockKey = `lock:participation:${user.id}:${id}`;
    const lockValue = crypto.randomBytes(16).toString('hex');
    const lockTTL = 30; // 30 секунд
    
    // Пытаемся установить lock (SET NX EX)
    const lockAcquired = await redis.set(lockKey, lockValue, 'EX', lockTTL, 'NX');
    
    if (!lockAcquired) {
      return reply.status(409).send({
        ok: false,
        error: 'Запрос уже обрабатывается. Подождите несколько секунд.',
        code: 'REQUEST_IN_PROGRESS',
      });
    }

    // Функция для освобождения lock
    const releaseLock = async () => {
      try {
        // Удаляем lock только если значение совпадает (защита от удаления чужого lock)
        const script = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
        await redis.eval(script, 1, lockKey, lockValue);
      } catch (err) {
        // Игнорируем ошибки освобождения lock
      }
    };

    try {
      // Получаем розыгрыш с условиями и владельцем
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

    // 14.4 Бан-лист: проверяем, не забанен ли участник создателем розыгрыша
    const banEntry = await prisma.creatorBanList.findUnique({
      where: {
        creatorUserId_bannedUserId: {
          creatorUserId: giveaway.ownerUserId,
          bannedUserId: user.id,
        },
      },
    });
    if (banEntry) {
      return reply.status(403).send({
        ok: false,
        error: 'Вы не можете участвовать в розыгрышах этого создателя',
        code: 'USER_BANNED',
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
          const { isMember } = await checkTelegramSubscription(
            user.telegramUserId.toString(),
            channel.telegramChatId.toString(),
          );
          if (!isMember) {
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
        language: true, // 🔒 ДОБАВЛЕНО (2026-02-16) для FraudScore
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

    // 🔒 ИСПРАВЛЕНО (2026-02-16): Вычисляем fraud score с новыми проверками
    // Получаем IP адрес
    const ipAddress = request.headers['x-forwarded-for']?.toString().split(',')[0] || 
                     request.headers['x-real-ip']?.toString() ||
                     request.ip;

    const fraudScore = await calculateFraudScore({
      user: fullUser,
      giveaway,
      timeSinceOpen: undefined, // TODO: трекать время открытия розыгрыша в будущем
      previousParticipationsCount: recentParticipations,
      ipAddress,
      hasProfilePhoto: undefined, // TODO: получать через Bot API
      userTimezone: undefined, // TODO: получать из WebApp initData
      expectedTimezone: undefined, // TODO: определять по IP через GeoIP
    });

    // Participant tier (for captcha skip & bonus ticket)
    const participantTier = await getUserTier(user.id);
    const participantIsPaid = isTierAtLeast(participantTier, 'PLUS');

    // Paid participants (PLUS+) skip captcha
    const captchaMode = giveaway.condition?.captchaMode || 'SUSPICIOUS_ONLY';
    const captchaRequired = !participantIsPaid && requiresCaptcha(fraudScore, captchaMode);
    
    if (captchaRequired && !body.captchaPassed) {
      return reply.status(400).send({
        ok: false,
        error: fraudScore >= 61 
          ? 'Требуется проверка безопасности. Пройдите капчу.'
          : 'Пройдите проверку капчи',
        code: 'CAPTCHA_REQUIRED',
        fraudScore: fraudScore >= 61 ? 'HIGH' : 'MEDIUM',
      });
    }

    // Turnstile verification required when captchaMode is ALL
    if (captchaMode === 'ALL' && !participantIsPaid) {
      const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
      if (turnstileSecret && !body.turnstileToken) {
        return reply.status(400).send({
          ok: false,
          error: 'Пройдите проверку Cloudflare',
          code: 'TURNSTILE_REQUIRED',
        });
      }
      if (turnstileSecret && body.turnstileToken) {
        try {
          const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              secret: turnstileSecret,
              response: body.turnstileToken,
              remoteip: request.ip,
            }),
          });
          const data = await resp.json() as { success: boolean };
          if (!data.success) {
            return reply.status(400).send({
              ok: false,
              error: 'Проверка Cloudflare не пройдена',
              code: 'TURNSTILE_FAILED',
            });
          }
        } catch (err) {
          fastify.log.warn('Turnstile verify error: %s', String(err));
        }
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

    // Liveness check: если требуется — участие создаётся со статусом PENDING
    const livenessEnabled = giveaway.condition?.livenessEnabled ?? false;

    // Paid participants (PLUS+) get a bonus ticket (+100% chance = 2 base tickets)
    const baseTickets = participantIsPaid ? 2 : 1;

    const participation = await prisma.participation.create({
      data: {
        giveawayId: id,
        userId: user.id,
        status: ParticipationStatus.JOINED,
        ticketsBase: baseTickets,
        ticketsExtra: 0,
        sourceTag: body.sourceTag || null,
        referrerUserId: validReferrerUserId,
        fraudScore, // Сохраняем fraud score
        displayName: fullUser.firstName || fullUser.username || `User${fullUser.telegramUserId}`, // Имя на момент участия
        // 10.19 Liveness: если включена — сразу ставим PENDING, пока фото не загружено
        ...(livenessEnabled ? { livenessStatus: 'PENDING' } : {}),
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
    const updatedGiveaway = await prisma.giveaway.update({
      where: { id },
      data: {
        totalParticipants: { increment: 1 },
      },
      select: {
        totalParticipants: true,
        title: true,
        isPublicInCatalog: true,
        catalogApproved: true,
        owner: { select: { username: true } },
      },
    });

    // 17.2 Системные уведомления: розыгрыш достиг 100 участников (кандидат в каталог)
    if (
      updatedGiveaway.totalParticipants === 100 &&
      updatedGiveaway.isPublicInCatalog &&
      !updatedGiveaway.catalogApproved
    ) {
      notifyCatalogCandidate({
        giveawayId: id,
        title: updatedGiveaway.title || 'Без названия',
        creatorUsername: updatedGiveaway.owner.username,
        participantCount: updatedGiveaway.totalParticipants,
      });
    }

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

      // Инкрементируем conversions в ReferralLink
      await prisma.referralLink.updateMany({
        where: { giveawayId: id, userId: validReferrerUserId },
        data: { conversions: { increment: 1 } },
      });

      // Уведомляем реферера в Telegram (fire-and-forget)
      notifyReferrerJoined(validReferrerUserId, user.id, id, fastify.log).catch(() => {});
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

    // 🔒 Освобождаем Redis lock перед отправкой ответа
    await releaseLock();

    // 14.5 Бейджи: начисляем за участие (fire-and-forget)
    awardParticipationBadges(user.id)
      .catch((err) => fastify.log.warn({ err, userId: user.id }, 'Failed to award participation badges'));

    return reply.success({
      participation: {
        id: participation.id,
        ticketsBase: participation.ticketsBase,
        ticketsExtra: participation.ticketsExtra,
        ticketsTotal: participation.ticketsBase + participation.ticketsExtra,
        joinedAt: participation.joinedAt.toISOString(),
      },
      // 10.19 Liveness: фронтенд покажет UI загрузки фото
      livenessRequired: livenessEnabled,
    });
    } catch (error) {
      // 🔒 Освобождаем lock в случае ошибки
      await releaseLock();
      throw error;
    }
  });

  /**
   * GET /captcha/generate
   * Генерирует математическую капчу
   * 🔒 ЗАДАЧА 7.1: С проверкой брутфорс лимита + endpoint-specific rate limit
   */
  fastify.get(
    '/captcha/generate',
    {
      config: {
        rateLimit: {
          max: RATE_LIMITS.CAPTCHA_GENERATE.max,
          timeWindow: RATE_LIMITS.CAPTCHA_GENERATE.timeWindow,
        },
      },
    },
    async (request, reply) => {
    const user = await getUser(request);
    
    // 🔒 Проверка лимита генераций (если пользователь авторизован)
    // ИСПРАВЛЕНО (2026-02-16): async функция
    if (user) {
      const limitCheck = await checkCaptchaGenerationLimit(user.id);
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
    
    // Two-digit math: 10-99 range, + or -
    const a = Math.floor(Math.random() * 90) + 10;
    const b = Math.floor(Math.random() * 90) + 10;
    const operators = ['+', '-'] as const;
    const operator = operators[Math.floor(Math.random() * operators.length)];
    
    let answer: number;
    let question: string;
    
    if (operator === '+') {
      answer = a + b;
      question = `${a} + ${b} = ?`;
    } else {
      const max = Math.max(a, b);
      const min = Math.min(a, b);
      answer = max - min;
      question = `${max} - ${min} = ?`;
    }

    const token = await generateCaptchaToken({
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
   * 🔒 ЗАДАЧА 7.1: С проверкой лимита попыток + endpoint-specific rate limit
   */
  fastify.post(
    '/captcha/verify',
    {
      config: {
        rateLimit: {
          max: RATE_LIMITS.CAPTCHA_VERIFY.max,
          timeWindow: RATE_LIMITS.CAPTCHA_VERIFY.timeWindow,
        },
      },
    },
    async (request, reply) => {
    const body = z.object({
      token: z.string(),
      answer: z.number(),
    }).parse(request.body);

    // ИСПРАВЛЕНО (2026-02-16): проверка через Redis
    const isValid = await verifyCaptchaToken(body.token, body.answer);

    // ИСПРАВЛЕНО (2026-02-16): результат уже через Redis
    if (isValid) {
      return reply.success({ verified: true });
    } else {
      return reply.badRequest('Неверный ответ или истекший токен');
    }
  });

  // =========================================================================
  // Реферальная система
  // =========================================================================

  // Имя бота для ссылок
  const BOT_USERNAME = process.env.BOT_USERNAME || 'BeastRandomBot';

  /**
   * Вспомогательная функция: получить или создать ReferralLink для участника
   */
  async function upsertReferralLink(giveawayId: string, userId: string): Promise<{ code: string; clicks: number; conversions: number }> {
    const existing = await prisma.referralLink.findUnique({
      where: { userId_giveawayId: { userId, giveawayId } },
      select: { code: true, clicks: true, conversions: true },
    });
    if (existing) return existing;

    // Генерируем уникальный код (retry при коллизии)
    let code = generateNanoid(8);
    for (let attempt = 0; attempt < 5; attempt++) {
      const collision = await prisma.referralLink.findUnique({ where: { code } });
      if (!collision) break;
      code = generateNanoid(8);
    }

    const created = await prisma.referralLink.create({
      data: { userId, giveawayId, code },
      select: { code: true, clicks: true, conversions: true },
    });
    return created;
  }

  /**
   * GET /giveaways/:id/my-referral
   * Получить реферальную ссылку и статистику приглашений
   */
  fastify.get<{ Params: { id: string } }>('/giveaways/:id/my-referral', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    const participation = await prisma.participation.findUnique({
      where: { giveawayId_userId: { giveawayId: id, userId: user.id } },
      select: { id: true, status: true, ticketsExtra: true },
    });

    if (!participation || participation.status !== ParticipationStatus.JOINED) {
      return reply.status(400).send({ ok: false, error: 'Вы не участвуете в этом розыгрыше' });
    }

    const giveaway = await prisma.giveaway.findUnique({
      where: { id },
      include: { condition: { select: { inviteEnabled: true, inviteMax: true } } },
    });

    if (!giveaway) {
      return reply.status(404).send({ ok: false, error: 'Розыгрыш не найден' });
    }

    const invitedCount = await prisma.participation.count({
      where: { giveawayId: id, referrerUserId: user.id },
    });

    const inviteMax = giveaway.condition?.inviteMax || 10;
    const inviteEnabled = giveaway.condition?.inviteEnabled || false;

    // Upsert ReferralLink — создаём или получаем существующую
    const refLink = await upsertReferralLink(id, user.id);
    const shortUrl = `https://t.me/${BOT_USERNAME}/participate?startapp=r_${refLink.code}`;

    return reply.success({
      referralLink: shortUrl,
      referralCode: refLink.code,
      clicks: refLink.clicks,
      conversions: refLink.conversions,
      invitedCount,
      inviteMax,
      inviteEnabled,
      ticketsFromInvites: invitedCount,
    });
  });

  /**
   * POST /giveaways/:id/generate-invite
   * Сгенерировать (или получить) реферальную ссылку с коротким кодом
   */
  fastify.post<{ Params: { id: string } }>('/giveaways/:id/generate-invite', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    const participation = await prisma.participation.findUnique({
      where: { giveawayId_userId: { giveawayId: id, userId: user.id } },
      select: { id: true, status: true },
    });

    if (!participation || participation.status !== ParticipationStatus.JOINED) {
      return reply.status(400).send({ ok: false, error: 'Вы не участвуете в этом розыгрыше' });
    }

    const giveaway = await prisma.giveaway.findUnique({
      where: { id },
      include: { condition: { select: { inviteEnabled: true, inviteMax: true } } },
    });

    if (!giveaway) {
      return reply.status(404).send({ ok: false, error: 'Розыгрыш не найден' });
    }

    if (!giveaway.condition?.inviteEnabled) {
      return reply.status(400).send({ ok: false, error: 'Приглашения отключены для этого розыгрыша' });
    }

    const refLink = await upsertReferralLink(id, user.id);
    const shortUrl = `https://t.me/${BOT_USERNAME}/participate?startapp=r_${refLink.code}`;

    const invitedCount = await prisma.participation.count({
      where: { giveawayId: id, referrerUserId: user.id },
    });

    return reply.success({
      referralLink: shortUrl,
      referralCode: refLink.code,
      clicks: refLink.clicks,
      conversions: refLink.conversions,
      invitedCount,
      inviteMax: giveaway.condition.inviteMax || 10,
    });
  });

  /**
   * GET /referral/resolve/:code
   * Публичный эндпоинт: resolve короткого кода → giveawayId + referrerUserId
   * Также инкрементирует clicks
   */
  fastify.get<{ Params: { code: string } }>('/referral/resolve/:code', async (request, reply) => {
    const { code } = request.params;

    const refLink = await prisma.referralLink.findUnique({
      where: { code },
      select: {
        id: true,
        giveawayId: true,
        userId: true,
        clicks: true,
        conversions: true,
      },
    });

    if (!refLink) {
      return reply.status(404).send({ ok: false, error: 'Реферальная ссылка не найдена' });
    }

    // Инкрементируем clicks (fire-and-forget)
    prisma.referralLink.update({
      where: { code },
      data: { clicks: { increment: 1 } },
    }).catch(() => {});

    return reply.success({
      giveawayId: refLink.giveawayId,
      referrerUserId: refLink.userId,
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

    return reply.success({ 
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
      return reply.success({ 
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

    return reply.success({
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

    // Проверяем бусты напрямую через Telegram Bot API
    let actualBoostCount = 0;
    try {
      const botToken = config.botToken;
      if (!botToken) {
        return reply.status(500).send({ ok: false, error: 'Bot not configured' });
      }

      const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/getUserChatBoosts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: channel.telegramChatId.toString(),
          user_id: user.telegramUserId.toString(),
        }),
      });

      const tgData = await tgRes.json() as {
        ok: boolean;
        result?: { boosts: Array<{ boost_id: string; add_date: number; expiration_date: number }> };
        description?: string;
      };

      if (tgData.ok && tgData.result) {
        actualBoostCount = tgData.result.boosts.length;
      } else {
        fastify.log.warn(
          { userId: user.telegramUserId, chatId: channel.telegramChatId, error: tgData.description },
          'Telegram getUserChatBoosts failed'
        );
      }
    } catch (error) {
      fastify.log.error(error, 'Failed to check boosts via Telegram API');
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

    return reply.success({ 
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

    return reply.success({ 
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
      return reply.success({ 
        hasRequest: false,
        status: null,
      });
    }

    return reply.success({ hasRequest: true,
      status: participation.storyRequest.status,
      submittedAt: participation.storyRequest.submittedAt.toISOString(),
      reviewedAt: participation.storyRequest.reviewedAt?.toISOString() || null,
      rejectReason: participation.storyRequest.rejectReason || null });
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

    return reply.success({
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

      return reply.success({ message: 'Заявка одобрена, билет начислен' });
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

      return reply.success({ message: 'Заявка отклонена' });
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

    return reply.success({
      participations: result,
      total,
      hasMore: offsetNum + limitNum < total,
      counts: {
        all: allCount,
        active: activeCount,
        finished: finishedCount,
        won: wonCount,
        cancelled: cancelledCount,
      },
    });
  });
};
