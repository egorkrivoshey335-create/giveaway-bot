import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, GiveawayStatus } from '@randombeast/database';
import { requireUser } from '../plugins/auth.js';

const updateNotificationsSchema = z.object({
  notificationsBlocked: z.boolean(),
});

const updateCatalogNotificationsSchema = z.object({
  catalogNotificationsEnabled: z.boolean(),
});

export const usersRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /users/me/profile
   * Возвращает профиль создателя (реальные данные из БД)
   * Задача 14.6 из TASKS-14-features.md
   */
  fastify.get('/users/me/profile', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const [fullUser, totalGiveaways, activeGiveaways, thisMonthGiveaways, lastMonthGiveaways, participantsAgg, winnersAgg, badges, entitlement] =
      await Promise.all([
        prisma.user.findUnique({
          where: { id: user.id },
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            telegramUserId: true,
            isPremium: true,
            language: true,
            notificationsBlocked: true,
            createdAt: true,
          },
        }),
        prisma.giveaway.count({ where: { ownerUserId: user.id } }),
        prisma.giveaway.count({ where: { ownerUserId: user.id, status: GiveawayStatus.ACTIVE } }),
        prisma.giveaway.count({
          where: { ownerUserId: user.id, createdAt: { gte: thisMonthStart } },
        }),
        prisma.giveaway.count({
          where: {
            ownerUserId: user.id,
            createdAt: { gte: lastMonthStart, lte: lastMonthEnd },
          },
        }),
        prisma.participation.aggregate({
          where: { giveaway: { ownerUserId: user.id } },
          _count: { _all: true },
        }),
        prisma.winner.count({ where: { giveaway: { ownerUserId: user.id }, isReserve: false } }),
        prisma.userBadge.findMany({
          where: { userId: user.id },
          orderBy: { earnedAt: 'asc' },
        }),
        prisma.entitlement.findFirst({
          where: {
            userId: user.id,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

    if (!fullUser) {
      return reply.notFound('Пользователь не найден');
    }

    // Определяем уровень подписки
    let subscriptionTier: 'FREE' | 'PLUS' | 'PRO' = 'FREE';
    if (entitlement) {
      if (entitlement.code.includes('pro') || entitlement.code.includes('PRO')) {
        subscriptionTier = 'PRO';
      } else {
        subscriptionTier = 'PLUS';
      }
    }

    // Участники за этот/прошлый месяц — через отдельный запрос
    const [thisMonthPart, lastMonthPart] = await Promise.all([
      prisma.participation.count({
        where: {
          giveaway: { ownerUserId: user.id },
          joinedAt: { gte: thisMonthStart },
        },
      }),
      prisma.participation.count({
        where: {
          giveaway: { ownerUserId: user.id },
          joinedAt: { gte: lastMonthStart, lte: lastMonthEnd },
        },
      }),
    ]);

    return reply.success({
      profile: {
        id: fullUser.id,
        username: fullUser.username,
        firstName: fullUser.firstName,
        lastName: fullUser.lastName,
        telegramUserId: fullUser.telegramUserId,
        isPremium: fullUser.isPremium,
        language: fullUser.language,
        notificationsBlocked: fullUser.notificationsBlocked,
        joinedAt: fullUser.createdAt.toISOString(),
        subscriptionTier,
        entitlementCode: entitlement?.code ?? null,
        entitlementExpiresAt: entitlement?.expiresAt?.toISOString() ?? null,
        stats: {
          totalGiveaways,
          activeGiveaways,
          totalParticipants: participantsAgg._count._all,
          totalWinners: winnersAgg,
          thisMonth: {
            giveaways: thisMonthGiveaways,
            participants: thisMonthPart,
          },
          lastMonth: {
            giveaways: lastMonthGiveaways,
            participants: lastMonthPart,
          },
        },
        badges: badges.map((b) => ({
          code: b.badgeCode,
          earnedAt: b.earnedAt.toISOString(),
        })),
      },
    });
  });

  /**
   * PATCH /users/me/notifications
   * Включить/выключить уведомления от бота
   */
  fastify.patch('/users/me/notifications', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const body = updateNotificationsSchema.parse(request.body);

    await prisma.user.update({
      where: { id: user.id },
      data: { notificationsBlocked: body.notificationsBlocked },
    });

    return reply.success({ notificationsBlocked: body.notificationsBlocked });
  });

  /**
   * PATCH /users/me/catalog-notifications
   * Включить/выключить уведомления о новых розыгрышах в каталоге (14.8)
   */
  fastify.patch('/users/me/catalog-notifications', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const body = updateCatalogNotificationsSchema.parse(request.body);

    await prisma.user.update({
      where: { id: user.id },
      data: { catalogNotificationsEnabled: body.catalogNotificationsEnabled },
    });

    return reply.success({ catalogNotificationsEnabled: body.catalogNotificationsEnabled });
  });

  /**
   * GET /users/me/badges
   * Возвращает список бейджей пользователя
   */
  fastify.get('/users/me/badges', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const badges = await prisma.userBadge.findMany({
      where: { userId: user.id },
      orderBy: { earnedAt: 'asc' },
    });

    return reply.success({
      badges: badges.map((b) => ({
        code: b.badgeCode,
        earnedAt: b.earnedAt.toISOString(),
      })),
    });
  });

  /**
   * GET /users/:telegramId/profile
   * Публичный профиль участника (для другого пользователя)
   */
  fastify.get<{ Params: { telegramId: string } }>('/users/:telegramId/profile', async (request, reply) => {
    const viewer = await requireUser(request, reply);
    if (!viewer) return;

    const { telegramId } = request.params;

    const targetUser = await prisma.user.findFirst({
      where: { telegramUserId: BigInt(telegramId) },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        telegramUserId: true,
        isPremium: true,
        createdAt: true,
      },
    });

    if (!targetUser) {
      return reply.notFound('Пользователь не найден');
    }

    const [participations, wins, badges] = await Promise.all([
      prisma.participation.count({ where: { userId: targetUser.id } }),
      prisma.winner.count({ where: { userId: targetUser.id, isReserve: false } }),
      prisma.userBadge.findMany({
        where: { userId: targetUser.id },
        orderBy: { earnedAt: 'asc' },
      }),
    ]);

    return reply.success({
      profile: {
        id: targetUser.id,
        username: targetUser.username,
        firstName: targetUser.firstName,
        lastName: targetUser.lastName,
        telegramUserId: targetUser.telegramUserId.toString(),
        isPremium: targetUser.isPremium,
        joinedAt: targetUser.createdAt.toISOString(),
        stats: {
          participations,
          wins,
        },
        badges: badges.map((b) => ({
          code: b.badgeCode,
          earnedAt: b.earnedAt.toISOString(),
        })),
      },
    });
  });
};

