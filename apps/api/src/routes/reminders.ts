import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, GiveawayStatus } from '@randombeast/database';
import { requireUser } from '../plugins/auth.js';

export const remindersRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /giveaways/:id/remind-me
   * Подписка на напоминание о результатах розыгрыша
   * Напоминание отправляется перед завершением (endAt - 1 час) через BullMQ job
   */
  fastify.post<{ Params: { id: string } }>(
    '/giveaways/:id/remind-me',
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const { id: giveawayId } = request.params;

      const giveaway = await prisma.giveaway.findUnique({
        where: { id: giveawayId },
        select: {
          id: true,
          status: true,
          startAt: true,
          endAt: true,
          title: true,
        },
      });

      if (!giveaway) {
        return reply.notFound('Розыгрыш не найден');
      }

      if (giveaway.status !== GiveawayStatus.ACTIVE && giveaway.status !== GiveawayStatus.SCHEDULED) {
        return reply.badRequest('Можно подписаться только на активные или запланированные розыгрыши');
      }

      // For SCHEDULED giveaways: remind 1h before startAt
      // For ACTIVE giveaways: remind 1h before endAt
      let remindAt: Date;
      if (giveaway.status === GiveawayStatus.SCHEDULED && giveaway.startAt) {
        const oneHourBefore = new Date(giveaway.startAt.getTime() - 60 * 60 * 1000);
        remindAt = oneHourBefore > new Date() ? oneHourBefore : new Date(Date.now() + 60 * 1000);
      } else if (giveaway.endAt) {
        const oneHourBefore = new Date(giveaway.endAt.getTime() - 60 * 60 * 1000);
        remindAt = oneHourBefore > new Date() ? oneHourBefore : new Date(Date.now() + 60 * 1000);
      } else {
        remindAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      }

      // Upsert — обновляем если уже есть напоминание
      try {
        const reminder = await prisma.giveawayReminder.upsert({
          where: {
            giveawayId_userId: { giveawayId, userId: user.id },
          },
          update: { remindAt, sentAt: null },
          create: {
            giveawayId,
            userId: user.id,
            remindAt,
          },
        });

        return reply.success({
          id: reminder.id,
          giveawayId,
          remindAt: reminder.remindAt.toISOString(),
          message: `Напоминание установлено на ${reminder.remindAt.toLocaleString('ru-RU')}`,
        });
      } catch (err) {
        fastify.log.error({ err, giveawayId, userId: user.id }, 'Failed to create reminder');
        throw err;
      }
    }
  );

  /**
   * DELETE /giveaways/:id/remind-me
   * Отписка от напоминания
   */
  fastify.delete<{ Params: { id: string } }>(
    '/giveaways/:id/remind-me',
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const { id: giveawayId } = request.params;

      const deleted = await prisma.giveawayReminder.deleteMany({
        where: { giveawayId, userId: user.id },
      });

      if (deleted.count === 0) {
        return reply.notFound('Напоминание не найдено');
      }

      return reply.success({ deleted: true });
    }
  );

  /**
   * GET /giveaways/:id/remind-me
   * Проверить есть ли напоминание для текущего пользователя
   */
  fastify.get<{ Params: { id: string } }>(
    '/giveaways/:id/remind-me',
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const { id: giveawayId } = request.params;

      const reminder = await prisma.giveawayReminder.findUnique({
        where: { giveawayId_userId: { giveawayId, userId: user.id } },
      });

      if (!reminder) {
        return reply.success({ hasReminder: false });
      }

      return reply.success({
        hasReminder: true,
        remindAt: reminder.remindAt.toISOString(),
        sentAt: reminder.sentAt?.toISOString() || null,
      });
    }
  );

};

