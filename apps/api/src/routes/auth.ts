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

      // Validate initData signature
      try {
        validate(initData, botToken, {
          expiresIn: config.auth.initDataExpiresIn,
        });
      } catch (validationError) {
        fastify.log.warn({ error: validationError }, 'Invalid initData');
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
