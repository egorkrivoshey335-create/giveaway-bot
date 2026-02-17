import { FastifyInstance } from 'fastify';
import { prisma } from '@randombeast/database';
import { ErrorCode, TIER_LIMITS } from '@randombeast/shared';
import { requireUser } from '../plugins/auth.js';

type TierKey = 'FREE' | 'PLUS' | 'PRO' | 'BUSINESS';

/**
 * Определяем tier пользователя по entitlements
 */
async function getUserTier(userId: string): Promise<TierKey> {
  const entitlements = await prisma.entitlement.findMany({
    where: {
      userId,
      revokedAt: null,
      cancelledAt: null,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    select: { code: true },
  });

  const codes = entitlements.map(e => e.code);

  if (codes.includes('tier.business')) return 'BUSINESS';
  if (codes.includes('tier.pro')) return 'PRO';
  if (codes.includes('tier.plus')) return 'PLUS';
  return 'FREE';
}

/**
 * GET /api/v1/init
 * Единый endpoint при открытии Mini App:
 * - user (profile, language, subscription, badges)
 * - draft (текущий черновик)
 * - participantStats (active, won)
 * - creatorStats (active, channels, posts)
 * - config (limits, features по подписке)
 */
export async function initRoutes(server: FastifyInstance) {
  server.get('/init', async (request, reply) => {
    const user = await requireUser(request, reply);

    if (!user) {
      return;
    }

    try {
      // Параллельно запрашиваем все данные
      const [
        fullUser,
        draft,
        participantTotal,
        wonCount,
        activeParticipations,
        creatorTotal,
        activeGiveaways,
        channelCount,
        postCount,
        tier,
        badges,
      ] = await Promise.all([
        // Полные данные пользователя (включая notification settings)
        prisma.user.findUnique({
          where: { id: user.id },
          select: {
            notificationsEnabled: true,
            creatorNotificationMode: true,
          },
        }),
        // Текущий черновик
        prisma.giveaway.findFirst({
          where: { ownerUserId: user.id, status: 'DRAFT' },
          select: {
            id: true,
            wizardStep: true,
            draftPayload: true,
            draftVersion: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: 'desc' },
        }),
        // Общее количество участий
        prisma.participation.count({
          where: { userId: user.id },
        }),
        // Количество побед
        prisma.winner.count({
          where: { userId: user.id, rerolled: false },
        }),
        // Активные участия
        prisma.participation.count({
          where: { userId: user.id, giveaway: { status: 'ACTIVE' } },
        }),
        // Всего розыгрышей создателя
        prisma.giveaway.count({
          where: { ownerUserId: user.id },
        }),
        // Активные розыгрыши создателя
        prisma.giveaway.count({
          where: {
            ownerUserId: user.id,
            status: { in: ['ACTIVE', 'SCHEDULED', 'PENDING_CONFIRM'] },
          },
        }),
        // Количество каналов
        prisma.channel.count({
          where: { addedByUserId: user.id },
        }),
        // Количество шаблонов постов
        prisma.postTemplate.count({
          where: { ownerUserId: user.id, deletedAt: null },
        }),
        // Тир подписки
        getUserTier(user.id),
        // Бейджи пользователя
        prisma.userBadge.findMany({
          where: { userId: user.id },
          select: { badgeCode: true, earnedAt: true },
        }),
      ]);

      // Лимиты на основе тира
      const limits = {
        maxActiveGiveaways: TIER_LIMITS.maxActiveGiveaways[tier],
        maxChannels: TIER_LIMITS.maxChannels[tier],
        maxPostTemplates: TIER_LIMITS.maxPostTemplates[tier],
        maxCustomTasks: TIER_LIMITS.maxCustomTasks[tier],
        maxTrackingLinks: TIER_LIMITS.maxTrackingLinks[tier],
        maxChannelsPerGiveaway: TIER_LIMITS.maxChannelsPerGiveaway[tier],
        maxWinners: TIER_LIMITS.maxWinners[tier],
        maxInvites: TIER_LIMITS.maxInvites[tier],
        postCharLimit: TIER_LIMITS.postCharLimit[tier],
      };

      const isPaid = tier !== 'FREE';
      const features = {
        catalogAccess: isPaid,
        livenessCheck: isPaid,
        customMascot: isPaid,
        exportParticipants: isPaid,
        advancedAnalytics: tier === 'PRO' || tier === 'BUSINESS',
        prioritySupport: tier === 'BUSINESS',
      };

      return reply.success({
        user: {
          id: user.id,
          telegramUserId: user.telegramUserId.toString(),
          firstName: user.firstName || '',
          lastName: user.lastName,
          username: user.username,
          language: user.language,
          isPremium: user.isPremium,
          notificationsEnabled: fullUser?.notificationsEnabled ?? true,
          creatorNotificationMode: fullUser?.creatorNotificationMode ?? 'MILESTONE',
          badges: badges.map(b => ({
            code: b.badgeCode,
            earnedAt: b.earnedAt.toISOString(),
          })),
          createdAt: user.createdAt.toISOString(),
        },
        draft: draft
          ? {
              id: draft.id,
              step: draft.wizardStep,
              payload: draft.draftPayload,
              version: draft.draftVersion,
              updatedAt: draft.updatedAt.toISOString(),
            }
          : null,
        participantStats: {
          totalCount: participantTotal,
          wonCount,
          activeCount: activeParticipations,
        },
        creatorStats: {
          totalCount: creatorTotal,
          activeCount: activeGiveaways,
          channelCount,
          postCount,
        },
        config: {
          limits,
          features,
          subscriptionTier: tier,
        },
      });
    } catch (error) {
      request.log.error(error, 'Failed to fetch init data');
      return reply.error(ErrorCode.INTERNAL_ERROR, 'Failed to load initial data');
    }
  });
}
