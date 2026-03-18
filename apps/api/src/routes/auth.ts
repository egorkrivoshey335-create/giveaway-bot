import type { FastifyPluginAsync } from 'fastify';
import { validate, parse } from '@telegram-apps/init-data-node';
import { z } from 'zod';
import { prisma, LanguageCode } from '@randombeast/database';
import { ErrorCode } from '@randombeast/shared';
import { config, requireTmaBotToken, isUserAllowed } from '../config.js';
import {
  createSessionToken,
  verifySessionToken,
  getSessionCookieOptions,
} from '../utils/session.js';
import { notifyNewUserMilestone } from '../lib/admin-notify.js';

// Request schemas
const telegramAuthSchema = z.object({
  initData: z.string().min(1),
});

/**
 * Map Telegram language_code to our LanguageCode enum
 */
function mapLanguageCode(langCode: string | undefined): LanguageCode {
  if (!langCode) return LanguageCode.RU;

  const normalized = langCode.toLowerCase();

  if (normalized === 'ru' || normalized.startsWith('ru-')) {
    return LanguageCode.RU;
  }
  if (normalized === 'kk' || normalized.startsWith('kk-')) {
    return LanguageCode.KK;
  }
  if (normalized === 'en' || normalized.startsWith('en-')) {
    return LanguageCode.EN;
  }

  // Default to Russian for other languages
  return LanguageCode.RU;
}

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /auth/telegram
   * Validates Telegram initData and creates a session
   */
  fastify.post<{ Body: { initData: string } }>(
    '/auth/telegram',
    async (request, reply) => {
      // Parse and validate request body
      const body = telegramAuthSchema.parse(request.body);
      const { initData } = body;

      // Get bot token (required for auth)
      const botToken = requireTmaBotToken();

      // DEBUG: log initData details for troubleshooting
      const params = new URLSearchParams(initData);
      fastify.log.info({
        hasHash: params.has('hash'),
        hasAuthDate: params.has('auth_date'),
        hasUser: params.has('user'),
        paramKeys: [...params.keys()],
        initDataLength: initData.length,
        initDataPreview: initData.substring(0, 200),
      }, 'DEBUG auth: initData received');

      // Validate initData signature
      try {
        validate(initData, botToken, {
          expiresIn: config.auth.initDataExpiresIn,
        });
      } catch (validationError: any) {
        fastify.log.warn({
          error: validationError,
          errorType: validationError?.type,
          errorMessage: validationError?.message,
        }, 'Invalid initData — validation failed');
        return reply.unauthorized('Invalid initData signature');
      }

      // Parse the validated initData
      const parsedData = parse(initData);

      if (!parsedData.user) {
        return reply.badRequest('No user data in initData');
      }

      const telegramUser = parsedData.user;

      // Проверка whitelist (режим разработки)
      if (!isUserAllowed(telegramUser.id)) {
        return reply.forbidden('Приложение на доработке. Доступ ограничен.');
      }

      // Upsert user in database
      const user = await prisma.user.upsert({
        where: {
          telegramUserId: BigInt(telegramUser.id),
        },
        update: {
          username: telegramUser.username || null,
          firstName: telegramUser.firstName || null,
          lastName: telegramUser.lastName || null,
          isPremium: telegramUser.isPremium || false,
          language: mapLanguageCode(telegramUser.languageCode),
        },
        create: {
          telegramUserId: BigInt(telegramUser.id),
          username: telegramUser.username || null,
          firstName: telegramUser.firstName || null,
          lastName: telegramUser.lastName || null,
          isPremium: telegramUser.isPremium || false,
          language: mapLanguageCode(telegramUser.languageCode),
        },
      });

      // Create session token
      const sessionToken = createSessionToken(user.id);

      // Set session cookie
      reply.setCookie(
        config.auth.cookieName,
        sessionToken,
        getSessionCookieOptions()
      );

      fastify.log.info({ userId: user.id, telegramUserId: telegramUser.id }, 'User authenticated');

      // 17.2 Системные уведомления: рубежи регистраций (fire-and-forget)
      // Определяем был ли это новый пользователь через временну́ю метку создания
      const isNewUser = user.createdAt.getTime() > Date.now() - 5000; // создан в последние 5 сек
      if (isNewUser) {
        prisma.user.count().then(totalUsers => {
          notifyNewUserMilestone(totalUsers, user.username);
        }).catch(() => {});
      }

      return reply.success({ message: 'Authenticated successfully' });
    }
  );

  /**
   * GET /auth/me
   * Returns the current authenticated user
   */
  fastify.get('/auth/me', async (request, reply) => {
    // Get session cookie
    const sessionToken = request.cookies[config.auth.cookieName];

    if (!sessionToken) {
      return reply.unauthorized('Not authenticated');
    }

    // Verify session token
    const userId = verifySessionToken(sessionToken);

    if (!userId) {
      // Clear invalid cookie
      reply.clearCookie(config.auth.cookieName, getSessionCookieOptions());
      return reply.unauthorized('Invalid or expired session');
    }

    // Load user from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      // User was deleted, clear cookie
      reply.clearCookie(config.auth.cookieName, getSessionCookieOptions());
      return reply.unauthorized('User not found');
    }

    return reply.success({
      id: user.id,
      telegramUserId: user.telegramUserId.toString(),
      language: user.language,
      isPremium: user.isPremium,
      createdAt: user.createdAt.toISOString(),
    });
  });

  /**
   * PATCH /users/me
   * Обновление профиля пользователя (язык, настройки уведомлений)
   */
  const updateProfileSchema = z.object({
    language: z.enum(['RU', 'EN', 'KK']).optional(),
  });

  fastify.patch('/users/me', async (request, reply) => {
    const sessionToken = request.cookies[config.auth.cookieName];
    if (!sessionToken) {
      return reply.unauthorized('Not authenticated');
    }

    const userId = verifySessionToken(sessionToken);
    if (!userId) {
      reply.clearCookie(config.auth.cookieName, getSessionCookieOptions());
      return reply.unauthorized('Invalid or expired session');
    }

    const parsed = updateProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest('Ошибка валидации');
    }

    const data = parsed.data;
    const updateData: Record<string, unknown> = {};

    if (data.language !== undefined) {
      updateData.language = data.language as LanguageCode;
    }

    if (Object.keys(updateData).length === 0) {
      return reply.badRequest('Нет данных для обновления');
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    return reply.success({
      id: user.id,
      language: user.language,
    });
  });

  /**
   * GET /users/me/entitlements
   * Returns active entitlements (subscriptions) for the current user
   */
  fastify.get('/users/me/entitlements', async (request, reply) => {
    const sessionToken = request.cookies[config.auth.cookieName];
    if (!sessionToken) {
      return reply.unauthorized('Not authenticated');
    }

    const userId = verifySessionToken(sessionToken);
    if (!userId) {
      reply.clearCookie(config.auth.cookieName, getSessionCookieOptions());
      return reply.unauthorized('Invalid or expired session');
    }

    const now = new Date();
    const entitlements = await prisma.entitlement.findMany({
      where: {
        userId,
        revokedAt: null,
        cancelledAt: null,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    // Determine effective subscription tier
    const tierCodes = ['BUSINESS', 'PRO', 'PLUS'];
    let tier = 'FREE';
    let activeTierEntitlement = null;

    for (const code of tierCodes) {
      const found = entitlements.find((e) => e.code === code);
      if (found) {
        tier = code;
        activeTierEntitlement = found;
        break;
      }
    }

    return reply.success({
      tier,
      entitlements: entitlements.map((e) => ({
        id: e.id,
        code: e.code,
        sourceType: e.sourceType,
        expiresAt: e.expiresAt?.toISOString() || null,
        autoRenew: e.autoRenew,
        createdAt: e.createdAt.toISOString(),
      })),
      activeTier: activeTierEntitlement ? {
        id: activeTierEntitlement.id,
        code: activeTierEntitlement.code,
        expiresAt: activeTierEntitlement.expiresAt?.toISOString() || null,
        autoRenew: activeTierEntitlement.autoRenew,
      } : null,
    });
  });

  /**
   * POST /auth/logout
   * Clears the session cookie
   */
  fastify.post('/auth/logout', async (_request, reply) => {
    reply.clearCookie(config.auth.cookieName, getSessionCookieOptions());
    return reply.success({ message: 'Logged out successfully' });
  });

  /**
   * POST /auth/dev (development only)
   * Creates a mock session for testing without Telegram
   */
  if (config.isDev) {
    fastify.post<{ Body: { telegramUserId?: string } }>(
      '/auth/dev',
      async (request, reply) => {
        // Генерируем случайный ID если не передан (для тестирования)
        const randomId = Math.floor(Math.random() * 900000000) + 100000000;
        const telegramUserId = BigInt(request.body?.telegramUserId || randomId.toString());

        // Upsert test user
        const user = await prisma.user.upsert({
          where: { telegramUserId },
          update: {},
          create: {
            telegramUserId,
            username: 'dev_user',
            firstName: 'Dev',
            lastName: 'User',
            language: LanguageCode.RU,
            isPremium: false,
          },
        });

        // Create session
        const sessionToken = createSessionToken(user.id);
        reply.setCookie(config.auth.cookieName, sessionToken, getSessionCookieOptions());

        fastify.log.info({ userId: user.id }, 'Dev user authenticated');

        return reply.success({ 
          userId: user.id,
          message: 'Dev user authenticated' 
        });
      }
    );
  }
};
