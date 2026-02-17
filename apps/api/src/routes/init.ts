import { FastifyInstance } from 'fastify';
import { prisma } from '@randombeast/database';
import { ErrorCode } from '@randombeast/shared';
import { requireUser } from '../plugins/auth.js';

/**
 * GET /api/v1/init
 * Получить все начальные данные для Mini App (user, draft, stats, config)
 * Один запрос вместо множества отдельных
 */
export async function initRoutes(server: FastifyInstance) {
  server.get('/init', async (request, reply) => {
    const user = await requireUser(request, reply);

    if (!user) {
      return;
    }

    try {
      // Получить черновик (если есть)
      const draft = await prisma.giveaway.findFirst({
        where: {
          ownerUserId: user.id,
          status: 'DRAFT',
        },
        select: {
          id: true,
          wizardStep: true,
          draftPayload: true,
          updatedAt: true,
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });

      // Статистика участника
      const participantStats = await prisma.participation.aggregate({
        where: {
          userId: user.id,
        },
        _count: {
          id: true,
        },
      });

      const wonCount = await prisma.winner.count({
        where: {
          userId: user.id,
        },
      });

      const activeParticipations = await prisma.participation.count({
        where: {
          userId: user.id,
          giveaway: {
            status: 'ACTIVE',
          },
        },
      });

      // Статистика создателя
      const creatorStats = await prisma.giveaway.aggregate({
        where: {
          ownerUserId: user.id,
        },
        _count: {
          id: true,
        },
      });

      const activeGiveaways = await prisma.giveaway.count({
        where: {
          ownerUserId: user.id,
          status: {
            in: ['ACTIVE', 'SCHEDULED', 'PENDING_CONFIRM'],
          },
        },
      });

      const channelCount = await prisma.channel.count({
        where: {
          addedByUserId: user.id,
        },
      });

      const postCount = await prisma.postTemplate.count({
        where: {
          ownerUserId: user.id,
          deletedAt: null,
        },
      });

      // Config & Limits (на основе подписки пользователя)
      const subscriptionTier = 'FREE' as const; // TODO: получать из User.subscriptionTier когда будет реализовано
      const isPremium = false; // subscriptionTier !== 'FREE'

      const limits = {
        maxActiveGiveaways: isPremium ? 10 : 3,
        maxChannels: isPremium ? 20 : 5,
        maxPostTemplates: isPremium ? 50 : 10,
        maxWinners: isPremium ? 100 : 10,
        maxInvites: isPremium ? 500 : 10,
        maxCustomTasks: isPremium ? 5 : 1,
        maxTrackingLinks: isPremium ? 50 : 3,
        postCharLimit: isPremium ? 4096 : 1024,
      };

      const features = {
        captchaRequired: !isPremium,
        analyticsLevel: isPremium ? 'advanced' : 'basic',
        catalogAccess: isPremium,
        livenessCheck: isPremium,
        customMascot: isPremium,
        exportParticipants: isPremium,
      };

      return reply.success({
        user: {
          id: user.id,
          telegramUserId: user.telegramUserId,
          firstName: user.firstName || '',
          lastName: user.lastName,
          username: user.username,
          language: user.language,
          createdAt: user.createdAt.toISOString(),
        },
        draft: draft
          ? {
              id: draft.id,
              step: draft.wizardStep,
              payload: draft.draftPayload,
              updatedAt: draft.updatedAt.toISOString(),
            }
          : null,
        participantStats: {
          totalCount: participantStats._count.id,
          wonCount,
          activeCount: activeParticipations,
        },
        creatorStats: {
          totalCount: creatorStats._count.id,
          activeCount: activeGiveaways,
          channelCount,
          postCount,
        },
        config: {
          limits,
          features,
          subscriptionTier,
        },
      });
    } catch (error) {
      request.log.error(error, 'Failed to fetch init data');
      return reply.error(ErrorCode.INTERNAL_ERROR, 'Failed to load initial data');
    }
  });
}
