/**
 * RandomBeast — Reports Routes
 *
 * Endpoints для системы жалоб и репортов.
 *
 * @packageDocumentation
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, ReportStatus } from '@randombeast/database';
import { ErrorCode } from '@randombeast/shared';
import { requireUser } from '../plugins/auth.js';

// Schemas
const createReportSchema = z.object({
  targetType: z.enum(['USER', 'GIVEAWAY']),
  targetId: z.string().uuid(),
  reason: z.enum(['SPAM', 'FRAUD', 'INAPPROPRIATE_CONTENT', 'FAKE_GIVEAWAY', 'OTHER']),
  description: z.string().max(1000).optional(),
});

const updateReportSchema = z.object({
  status: z.enum(['PENDING', 'REVIEWING', 'RESOLVED', 'REJECTED']),
  moderatorNotes: z.string().max(1000).optional(),
});

export const reportsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /reports
   * Создать новый репорт (жалобу)
   */
  fastify.post('/reports', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const body = createReportSchema.parse(request.body);

    // Проверяем что цель существует
    if (body.targetType === 'USER') {
      const targetUser = await prisma.user.findUnique({
        where: { id: body.targetId },
      });
      if (!targetUser) {
        return reply.notFound('Target user not found');
      }
    } else if (body.targetType === 'GIVEAWAY') {
      const targetGiveaway = await prisma.giveaway.findUnique({
        where: { id: body.targetId },
      });
      if (!targetGiveaway) {
        return reply.notFound('Target giveaway not found');
      }
    }

    // Проверяем что пользователь еще не отправлял жалобу на эту цель
    const existingReport = await prisma.report.findFirst({
      where: {
        reporterUserId: user.id,
        targetType: body.targetType,
        targetId: body.targetId,
        status: { not: ReportStatus.RESOLVED },
      },
    });

    if (existingReport) {
      return reply.badRequest('You have already reported this');
    }

    // Создаём репорт
    const report = await prisma.report.create({
      data: {
        reporterUserId: user.id,
        targetType: body.targetType,
        targetId: body.targetId,
        reason: body.reason,
        description: body.description,
        status: ReportStatus.PENDING,
      },
    });

    fastify.log.info({ userId: user.id, reportId: report.id, targetType: body.targetType }, 'Report created');

    return reply.success({
      id: report.id,
      status: report.status,
      createdAt: report.createdAt.toISOString(),
    });
  });

  /**
   * GET /reports/my
   * Получить все репорты текущего пользователя
   */
  fastify.get<{
    Querystring: {
      limit?: string;
      offset?: string;
    };
  }>('/reports/my', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { limit: limitStr, offset: offsetStr } = request.query;
    const limit = Math.min(parseInt(limitStr || '20', 10), 100);
    const offset = parseInt(offsetStr || '0', 10);

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where: { reporterUserId: user.id },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.report.count({
        where: { reporterUserId: user.id },
      }),
    ]);

    return reply.paginated(
      reports.map(r => ({
        id: r.id,
        targetType: r.targetType,
        targetId: r.targetId,
        reason: r.reason,
        description: r.description,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        resolvedAt: r.resolvedAt?.toISOString() || null,
      })),
      { total, hasMore: offset + reports.length < total }
    );
  });

  /**
   * GET /reports/:id
   * Получить детали конкретного репорта
   */
  fastify.get<{ Params: { id: string } }>('/reports/:id', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    const report = await prisma.report.findUnique({
      where: { id },
    });

    if (!report) {
      return reply.notFound('Report not found');
    }

    // Проверяем доступ (только автор репорта может видеть детали)
    if (report.reporterUserId !== user.id) {
      return reply.forbidden('Access denied');
    }

    return reply.success({
      id: report.id,
      targetType: report.targetType,
      targetId: report.targetId,
      reason: report.reason,
      description: report.description,
      status: report.status,
      moderatorNotes: report.moderatorNotes,
      createdAt: report.createdAt.toISOString(),
      resolvedAt: report.resolvedAt?.toISOString() || null,
    });
  });

  /**
   * GET /reports/about-giveaway/:giveawayId
   * Получить все репорты о конкретном розыгрыше (для владельца)
   */
  fastify.get<{ Params: { giveawayId: string } }>(
    '/reports/about-giveaway/:giveawayId',
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const { giveawayId } = request.params;

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

      // Получаем все репорты о розыгрыше
      const reports = await prisma.report.findMany({
        where: {
          targetType: 'GIVEAWAY',
          targetId: giveawayId,
        },
        include: {
          reporter: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return reply.success(
        reports.map(r => ({
          id: r.id,
          reason: r.reason,
          description: r.description,
          status: r.status,
          reporter: r.reporter,
          createdAt: r.createdAt.toISOString(),
        }))
      );
    }
  );
};
