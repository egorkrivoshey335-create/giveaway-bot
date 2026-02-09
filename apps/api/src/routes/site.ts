import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '@randombeast/database';
import { config } from '../config.js';
import { createSessionToken, verifySessionToken, getSessionCookieOptions } from '../utils/session.js';

// Имя cookie для site сессии (отличается от web app)
const SITE_SESSION_COOKIE = 'rb_site_session';

// ============================================================================
// Schemas
// ============================================================================

const telegramAuthSchema = z.object({
  telegramUserId: z.string(),
  username: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  photoUrl: z.string().optional(),
});

// ============================================================================
// Helpers
// ============================================================================

/**
 * Получает userId из cookie site сессии
 */
function getUserIdFromSiteSession(request: FastifyRequest): string | null {
  const token = request.cookies[SITE_SESSION_COOKIE];
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Проверяет internal API token
 */
function verifyInternalToken(request: FastifyRequest): boolean {
  const token = request.headers['x-internal-token'];
  return token === config.internalApiToken;
}

/**
 * Проверяет наличие entitlement у пользователя
 */
async function hasEntitlement(userId: string, code: string): Promise<boolean> {
  const entitlement = await prisma.entitlement.findFirst({
    where: {
      userId,
      code,
      revokedAt: null,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
  });
  return !!entitlement;
}

// ============================================================================
// Routes
// ============================================================================

export async function siteRoutes(fastify: FastifyInstance) {
  /**
   * POST /site/auth/telegram
   * Создаёт или обновляет пользователя по данным от Telegram Login Widget
   * Защищён X-Internal-Token (вызывается из apps/site)
   */
  fastify.post('/site/auth/telegram', async (request, reply) => {
    // Проверяем internal token
    if (!verifyInternalToken(request)) {
      return reply.status(401).send({ ok: false, error: 'Unauthorized' });
    }

    // Валидируем данные
    const parseResult = telegramAuthSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        ok: false,
        error: 'Invalid request body',
        details: parseResult.error.issues,
      });
    }

    const { telegramUserId, username, firstName, lastName } = parseResult.data;

    try {
      // Создаём или обновляем пользователя
      const user = await prisma.user.upsert({
        where: {
          telegramUserId: BigInt(telegramUserId),
        },
        update: {
          username,
          firstName,
          lastName,
          updatedAt: new Date(),
        },
        create: {
          telegramUserId: BigInt(telegramUserId),
          username,
          firstName,
          lastName,
        },
      });

      // Создаём session token
      const sessionToken = createSessionToken(user.id);

      return reply.send({
        ok: true,
        sessionToken,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ ok: false, error: 'Internal server error' });
    }
  });

  /**
   * GET /site/me
   * Возвращает данные текущего пользователя и статус доступа к рандомайзеру
   */
  fastify.get('/site/me', async (request, reply) => {
    const userId = getUserIdFromSiteSession(request);

    if (!userId) {
      return reply.status(401).send({ ok: false, error: 'Unauthorized' });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return reply.status(401).send({ ok: false, error: 'User not found' });
      }

      // Проверяем доступ к рандомайзеру
      const hasRandomizerAccess = await hasEntitlement(userId, 'randomizer.access');

      return reply.send({
        ok: true,
        user: {
          id: user.id,
          telegramUserId: user.telegramUserId.toString(),
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          language: user.language,
          isPremium: user.isPremium,
          createdAt: user.createdAt.toISOString(),
        },
        hasRandomizerAccess,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ ok: false, error: 'Internal server error' });
    }
  });

  /**
   * GET /site/giveaways
   * Возвращает список завершённых розыгрышей текущего пользователя
   */
  fastify.get('/site/giveaways', async (request, reply) => {
    const userId = getUserIdFromSiteSession(request);

    if (!userId) {
      return reply.status(401).send({ ok: false, error: 'Unauthorized' });
    }

    try {
      const giveaways = await prisma.giveaway.findMany({
        where: {
          ownerUserId: userId,
          status: 'FINISHED',
        },
        orderBy: {
          updatedAt: 'desc',
        },
        include: {
          _count: {
            select: {
              winners: true,
              participations: {
                where: { status: 'JOINED' },
              },
            },
          },
        },
      });

      return reply.send({
        ok: true,
        giveaways: giveaways.map((g) => ({
          id: g.id,
          title: g.title,
          winnersCount: g._count.winners,
          participantsCount: g._count.participations,
          finishedAt: g.updatedAt.toISOString(),
        })),
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ ok: false, error: 'Internal server error' });
    }
  });

  /**
   * GET /site/giveaways/:id/randomizer
   * Возвращает данные для рандомайзера (защищённый эндпоинт)
   * Включает участников для "живого" розыгрыша
   */
  fastify.get<{ Params: { id: string } }>(
    '/site/giveaways/:id/randomizer',
    async (request, reply) => {
      const userId = getUserIdFromSiteSession(request);

      if (!userId) {
        return reply.status(401).send({ ok: false, error: 'Unauthorized' });
      }

      const { id } = request.params;

      try {
        // Проверяем доступ к рандомайзеру
        const hasRandomizerAccess = await hasEntitlement(userId, 'randomizer.access');
        if (!hasRandomizerAccess) {
          return reply.status(403).send({ ok: false, error: 'Randomizer access required' });
        }

        // Получаем розыгрыш с участниками и победителями
        const giveaway = await prisma.giveaway.findUnique({
          where: { id },
          include: {
            participations: {
              where: { status: 'JOINED' },
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
            winners: {
              orderBy: { place: 'asc' },
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
        });

        if (!giveaway) {
          return reply.status(404).send({ ok: false, error: 'Giveaway not found' });
        }

        // Проверяем, что розыгрыш принадлежит пользователю
        if (giveaway.ownerUserId !== userId) {
          return reply.status(403).send({ ok: false, error: 'Access denied' });
        }

        // Проверяем, что розыгрыш завершён
        if (giveaway.status !== 'FINISHED') {
          return reply.status(400).send({ ok: false, error: 'Giveaway is not finished' });
        }

        // Парсим JSON поля
        const randomizerPrizes = giveaway.randomizerPrizes as { place: number; title: string; description?: string }[] | null;
        const randomizerCustom = giveaway.randomizerCustom as { backgroundColor?: string; accentColor?: string; logoUrl?: string } | null;

        return reply.send({
          ok: true,
          giveaway: {
            id: giveaway.id,
            title: giveaway.title,
            winnersCount: giveaway.winnersCount,
            participantsCount: giveaway.participations.length,
            finishedAt: giveaway.updatedAt.toISOString(),
          },
          participants: giveaway.participations.map((p) => ({
            id: p.id,
            telegramUserId: p.user.telegramUserId.toString(),
            firstName: p.user.firstName,
            lastName: p.user.lastName,
            username: p.user.username,
            ticketsTotal: p.ticketsBase + p.ticketsExtra,
          })),
          winners: giveaway.winners.map((w) => ({
            place: w.place,
            odataUserId: w.user.id,
            telegramUserId: w.user.telegramUserId.toString(),
            firstName: w.user.firstName,
            lastName: w.user.lastName,
            username: w.user.username,
            ticketsUsed: w.ticketsUsed,
          })),
          prizes: randomizerPrizes || [],
          customization: randomizerCustom || {
            backgroundColor: '#0f0f23',
            accentColor: '#f2b6b6',
          },
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ ok: false, error: 'Internal server error' });
      }
    }
  );

  /**
   * POST /site/giveaways/:id/save-prizes
   * Сохраняет призы для рандомайзера
   */
  fastify.post<{ Params: { id: string }; Body: { prizes: { place: number; title: string; description?: string }[] } }>(
    '/site/giveaways/:id/save-prizes',
    async (request, reply) => {
      const userId = getUserIdFromSiteSession(request);

      if (!userId) {
        return reply.status(401).send({ ok: false, error: 'Unauthorized' });
      }

      const { id } = request.params;
      const { prizes } = request.body;

      try {
        // Проверяем что розыгрыш принадлежит пользователю
        const giveaway = await prisma.giveaway.findUnique({
          where: { id },
          select: { ownerUserId: true },
        });

        if (!giveaway) {
          return reply.status(404).send({ ok: false, error: 'Giveaway not found' });
        }

        if (giveaway.ownerUserId !== userId) {
          return reply.status(403).send({ ok: false, error: 'Access denied' });
        }

        // Сохраняем призы
        await prisma.giveaway.update({
          where: { id },
          data: { randomizerPrizes: prizes },
        });

        return reply.send({ ok: true });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ ok: false, error: 'Internal server error' });
      }
    }
  );

  /**
   * POST /site/giveaways/:id/save-customization
   * Сохраняет кастомизацию рандомайзера (цвета, логотип)
   */
  fastify.post<{ Params: { id: string }; Body: { backgroundColor?: string; accentColor?: string; logoUrl?: string } }>(
    '/site/giveaways/:id/save-customization',
    async (request, reply) => {
      const userId = getUserIdFromSiteSession(request);

      if (!userId) {
        return reply.status(401).send({ ok: false, error: 'Unauthorized' });
      }

      const { id } = request.params;
      const { backgroundColor, accentColor, logoUrl } = request.body;

      try {
        // Проверяем что розыгрыш принадлежит пользователю
        const giveaway = await prisma.giveaway.findUnique({
          where: { id },
          select: { ownerUserId: true },
        });

        if (!giveaway) {
          return reply.status(404).send({ ok: false, error: 'Giveaway not found' });
        }

        if (giveaway.ownerUserId !== userId) {
          return reply.status(403).send({ ok: false, error: 'Access denied' });
        }

        // Сохраняем кастомизацию
        await prisma.giveaway.update({
          where: { id },
          data: {
            randomizerCustom: {
              backgroundColor: backgroundColor || '#0f0f23',
              accentColor: accentColor || '#f2b6b6',
              logoUrl: logoUrl || null,
            },
          },
        });

        return reply.send({ ok: true });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ ok: false, error: 'Internal server error' });
      }
    }
  );

  /**
   * GET /site/giveaways/:id/results
   * Публичный эндпоинт для результатов розыгрыша
   */
  fastify.get<{ Params: { id: string } }>(
    '/site/giveaways/:id/results',
    async (request, reply) => {
      const { id } = request.params;

      try {
        const giveaway = await prisma.giveaway.findUnique({
          where: { id },
          include: {
            _count: {
              select: {
                participations: {
                  where: { status: 'JOINED' },
                },
              },
            },
            winners: {
              orderBy: { place: 'asc' },
              include: {
                user: {
                  select: {
                    username: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        });

        if (!giveaway) {
          return reply.status(404).send({ ok: false, error: 'Giveaway not found' });
        }

        // Проверяем, что розыгрыш завершён
        if (giveaway.status !== 'FINISHED') {
          return reply.status(400).send({ ok: false, error: 'Giveaway is not finished' });
        }

        // Парсим JSON поля
        const randomizerPrizes = giveaway.randomizerPrizes as { place: number; title: string; description?: string }[] | null;
        const randomizerCustom = giveaway.randomizerCustom as { backgroundColor?: string; accentColor?: string; logoUrl?: string } | null;

        return reply.send({
          ok: true,
          giveaway: {
            id: giveaway.id,
            title: giveaway.title,
            winnersCount: giveaway.winners.length,
            participantsCount: giveaway._count.participations,
            finishedAt: giveaway.updatedAt.toISOString(),
          },
          winners: giveaway.winners.map((w) => ({
            place: w.place,
            firstName: w.user.firstName,
            lastName: w.user.lastName,
            username: w.user.username,
          })),
          prizes: randomizerPrizes || [],
          customization: randomizerCustom || {
            backgroundColor: '#0f0f23',
            accentColor: '#f2b6b6',
          },
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ ok: false, error: 'Internal server error' });
      }
    }
  );

  /**
   * POST /site/logout
   * Удаляет cookie сессии
   */
  fastify.post('/site/logout', async (request, reply) => {
    reply.clearCookie(SITE_SESSION_COOKIE, {
      path: '/',
      domain: config.auth.cookieDomain,
    });

    return reply.send({ ok: true });
  });
}
