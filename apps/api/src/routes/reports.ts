/**
 * RandomBeast — Reports Routes
 *
 * Endpoints для системы жалоб и репортов.
 *
 * @packageDocumentation
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '@randombeast/database';
import { ErrorCode } from '@randombeast/shared';
import { requireUser } from '../plugins/auth.js';
import { notifyNewReport, notifyCatalogRemoved } from '../lib/admin-notify.js';

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

/** Порог автоматического снятия розыгрыша с каталога */
const AUTO_REMOVE_CATALOG_THRESHOLD = 5;

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
    let giveawayForReport: { id: string; title: string; isPublicInCatalog: boolean; catalogApproved: boolean; ownerUserId: string } | null = null;

    if (body.targetType === 'USER') {
      const targetUser = await prisma.user.findUnique({
        where: { id: body.targetId },
      });
      if (!targetUser) {
        return reply.notFound('Target user not found');
      }
    } else if (body.targetType === 'GIVEAWAY') {
      giveawayForReport = await prisma.giveaway.findUnique({
        where: { id: body.targetId },
        select: { id: true, title: true, isPublicInCatalog: true, catalogApproved: true, ownerUserId: true },
      });
      if (!giveawayForReport) {
        return reply.notFound('Target giveaway not found');
      }
    }

    // Один пользователь = одна активная жалоба на ту же цель
    const existingReport = await prisma.report.findFirst({
      where: {
        reporterId: user.id,
        targetType: body.targetType,
        targetId: body.targetId,
        status: { not: 'RESOLVED' },
      },
    });

    if (existingReport) {
      return reply.badRequest('You have already reported this');
    }

    // Создаём репорт
    const report = await prisma.report.create({
      data: {
        giveawayId: body.targetType === 'GIVEAWAY' ? body.targetId : body.targetId,
        reporterId: user.id,
        targetType: body.targetType,
        targetId: body.targetId,
        reason: body.reason,
        description: body.description,
        status: 'PENDING',
      },
    });

    fastify.log.info({ userId: user.id, reportId: report.id, targetType: body.targetType }, 'Report created');

    // Считаем суммарное количество активных жалоб на эту цель
    const totalReports = await prisma.report.count({
      where: {
        targetType: body.targetType,
        targetId: body.targetId,
        status: { not: 'RESOLVED' },
      },
    });

    // 17.3 Уведомление администратору о новой жалобе
    if (body.targetType === 'GIVEAWAY' && giveawayForReport) {
      notifyNewReport({
        giveawayTitle: giveawayForReport.title,
        giveawayId: giveawayForReport.id,
        reason: body.reason,
        reporterUsername: user.username,
        totalReports,
      });

      // 17.3 Автоснятие с каталога при > AUTO_REMOVE_CATALOG_THRESHOLD жалоб
      if (
        totalReports > AUTO_REMOVE_CATALOG_THRESHOLD &&
        giveawayForReport.isPublicInCatalog
      ) {
        await prisma.giveaway.update({
          where: { id: giveawayForReport.id },
          data: {
            isPublicInCatalog: false,
            catalogApproved: false,
          },
        });

        fastify.log.warn(
          { giveawayId: giveawayForReport.id, totalReports },
          'Giveaway auto-removed from catalog due to report threshold'
        );

        // Уведомляем администратора об автоснятии
        notifyCatalogRemoved({
          giveawayTitle: giveawayForReport.title,
          giveawayId: giveawayForReport.id,
          reportCount: totalReports,
        });

        // Уведомляем создателя розыгрыша (через Telegram Bot API)
        notifyCreatorCatalogRemoved(giveawayForReport.ownerUserId, giveawayForReport.title).catch(() => {});
      }
    }

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
        where: { reporterId: user.id },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.report.count({
        where: { reporterId: user.id },
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

    // Только автор репорта может видеть детали
    if (report.reporterId !== user.id) {
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
   * Получить все репорты о конкретном розыгрыше (для создателя)
   */
  fastify.get<{ Params: { giveawayId: string } }>(
    '/reports/about-giveaway/:giveawayId',
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const { giveawayId } = request.params;

      // Только владелец розыгрыша
      const giveaway = await prisma.giveaway.findFirst({
        where: {
          id: giveawayId,
          ownerUserId: user.id,
        },
      });

      if (!giveaway) {
        return reply.notFound('Giveaway not found');
      }

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

  /**
   * PATCH /reports/:id
   * Обновить статус репорта (для модератора — внутреннее использование)
   * Доступно только через internal-token аутентификацию (заголовок X-Internal-Token)
   */
  fastify.patch<{ Params: { id: string } }>('/reports/:id', async (request, reply) => {
    const token = request.headers['x-internal-token'];
    if (!token || token !== process.env.INTERNAL_API_TOKEN) {
      return reply.forbidden('Access denied');
    }

    const { id } = request.params;
    const body = updateReportSchema.parse(request.body);

    const report = await prisma.report.findUnique({ where: { id } });
    if (!report) {
      return reply.notFound('Report not found');
    }

    const updated = await prisma.report.update({
      where: { id },
      data: {
        status: body.status,
        moderatorNotes: body.moderatorNotes,
        resolvedAt: body.status === 'RESOLVED' || body.status === 'REJECTED' ? new Date() : undefined,
      },
    });

    return reply.success({
      id: updated.id,
      status: updated.status,
      resolvedAt: updated.resolvedAt?.toISOString() || null,
    });
  });
};

/**
 * Уведомить создателя розыгрыша через Telegram Bot API о снятии с каталога из-за жалоб.
 */
async function notifyCreatorCatalogRemoved(ownerUserId: string, giveawayTitle: string): Promise<void> {
  const { config } = await import('../config.js');

  if (!config.botToken) return;

  const owner = await prisma.user.findUnique({
    where: { id: ownerUserId },
    select: { telegramUserId: true, notificationsBlocked: true },
  });

  if (!owner || owner.notificationsBlocked) return;

  await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: owner.telegramUserId.toString(),
      text:
        `⚠️ <b>Ваш розыгрыш снят с каталога</b>\n\n` +
        `Розыгрыш "<b>${giveawayTitle.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</b>" ` +
        `получил несколько жалоб от пользователей и был автоматически снят с публикации в каталоге.\n\n` +
        `Если вы считаете это ошибкой, обратитесь в поддержку @Cosmolex_bot.`,
      parse_mode: 'HTML',
    }),
  }).catch(() => {});
}
