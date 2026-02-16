/**
 * RandomBeast — Stories Moderation Routes
 *
 * Endpoints для модерации stories участников.
 *
 * @packageDocumentation
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, StoryRequestStatus } from '@randombeast/database';
import { ErrorCode } from '@randombeast/shared';
import { requireUser } from '../plugins/auth.js';

// Schemas
const reviewStorySchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  rejectionReason: z.string().max(500).optional(),
});

export const storiesRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /stories/pending
   * Получить список всех stories на модерации для розыгрышей пользователя
   */
  fastify.get<{
    Querystring: {
      limit?: string;
      offset?: string;
    };
  }>('/stories/pending', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { limit: limitStr, offset: offsetStr } = request.query;
    const limit = Math.min(parseInt(limitStr || '50', 10), 100);
    const offset = parseInt(offsetStr || '0', 10);

    // Получаем все story requests для розыгрышей пользователя со статусом PENDING
    const [stories, total] = await Promise.all([
      prisma.storyRequest.findMany({
        where: {
          giveaway: {
            ownerUserId: user.id,
          },
          status: StoryRequestStatus.PENDING,
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
          giveaway: {
            select: {
              id: true,
              title: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.storyRequest.count({
        where: {
          giveaway: {
            ownerUserId: user.id,
          },
          status: StoryRequestStatus.PENDING,
        },
      }),
    ]);

    return reply.paginated(
      stories.map(s => ({
        id: s.id,
        user: {
          id: s.user.id,
          telegramUserId: s.user.telegramUserId.toString(),
          firstName: s.user.firstName,
          lastName: s.user.lastName,
          username: s.user.username,
        },
        giveaway: s.giveaway,
        screenshotFileId: s.screenshotFileId,
        status: s.status,
        createdAt: s.createdAt.toISOString(),
      })),
      { total, hasMore: offset + stories.length < total }
    );
  });

  /**
   * GET /stories/giveaway/:giveawayId
   * Получить все story requests для конкретного розыгрыша
   */
  fastify.get<{
    Params: { giveawayId: string };
    Querystring: {
      status?: string;
      limit?: string;
      offset?: string;
    };
  }>('/stories/giveaway/:giveawayId', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { giveawayId } = request.params;
    const { status, limit: limitStr, offset: offsetStr } = request.query;
    const limit = Math.min(parseInt(limitStr || '50', 10), 100);
    const offset = parseInt(offsetStr || '0', 10);

    // Проверяем что розыгрыш принадлежит пользователю
    const giveaway = await prisma.giveaway.findFirst({
      where: {
        id: giveawayId,
        ownerUserId: user.id,
      },
    });

    if (!giveaway) {
      return reply.notFound('Giveaway not found');
    }

    // Фильтр по статусу
    const statusFilter = status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status)
      ? (status as StoryRequestStatus)
      : undefined;

    const [stories, total] = await Promise.all([
      prisma.storyRequest.findMany({
        where: {
          giveawayId,
          ...(statusFilter ? { status: statusFilter } : {}),
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
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.storyRequest.count({
        where: {
          giveawayId,
          ...(statusFilter ? { status: statusFilter } : {}),
        },
      }),
    ]);

    return reply.paginated(
      stories.map(s => ({
        id: s.id,
        user: {
          id: s.user.id,
          telegramUserId: s.user.telegramUserId.toString(),
          firstName: s.user.firstName,
          lastName: s.user.lastName,
          username: s.user.username,
        },
        screenshotFileId: s.screenshotFileId,
        status: s.status,
        rejectionReason: s.rejectionReason,
        reviewedAt: s.reviewedAt?.toISOString() || null,
        createdAt: s.createdAt.toISOString(),
      })),
      { total, hasMore: offset + stories.length < total }
    );
  });

  /**
   * POST /stories/:id/review
   * Модерировать story (одобрить или отклонить)
   */
  fastify.post<{ Params: { id: string } }>('/stories/:id/review', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;
    const body = reviewStorySchema.parse(request.body);

    // Проверяем что story request существует и розыгрыш принадлежит пользователю
    const storyRequest = await prisma.storyRequest.findFirst({
      where: {
        id,
        giveaway: {
          ownerUserId: user.id,
        },
      },
      include: {
        participation: true,
      },
    });

    if (!storyRequest) {
      return reply.notFound('Story request not found');
    }

    // Проверяем что story еще не промодерирован
    if (storyRequest.status !== StoryRequestStatus.PENDING) {
      return reply.badRequest('Story already reviewed');
    }

    // Обновляем статус story
    const updated = await prisma.storyRequest.update({
      where: { id },
      data: {
        status: body.status as StoryRequestStatus,
        rejectionReason: body.status === 'REJECTED' ? body.rejectionReason : null,
        reviewedAt: new Date(),
      },
    });

    // Если одобрено - добавляем бонусный билет участнику
    if (body.status === 'APPROVED' && storyRequest.participation) {
      await prisma.participation.update({
        where: { id: storyRequest.participation.id },
        data: {
          ticketsExtra: { increment: 1 },
          storiesShared: { increment: 1 },
        },
      });
    }

    fastify.log.info(
      { userId: user.id, storyRequestId: id, status: body.status },
      'Story reviewed'
    );

    return reply.success({
      id: updated.id,
      status: updated.status,
      rejectionReason: updated.rejectionReason,
      reviewedAt: updated.reviewedAt?.toISOString() || null,
    });
  });
};
