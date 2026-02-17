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

      // Проверяем розыгрыш
      const giveaway = await prisma.giveaway.findUnique({
        where: { id: giveawayId },
        select: {
          id: true,
          status: true,
          endAt: true,
          title: true,
        },
      });

      if (!giveaway) {
        return reply.notFound('Розыгрыш не найден');
      }

      // Можно подписаться только на активные/запланированные
      if (giveaway.status !== GiveawayStatus.ACTIVE && giveaway.status !== GiveawayStatus.SCHEDULED) {
        return reply.badRequest('Можно подписаться только на активные или запланированные розыгрыши');
      }

      // Вычисляем время напоминания (за 1 час до окончания или сейчас + 1 день если нет endAt)
      let remindAt: Date;
      if (giveaway.endAt) {
        const oneHourBefore = new Date(giveaway.endAt.getTime() - 60 * 60 * 1000);
        remindAt = oneHourBefore > new Date() ? oneHourBefore : new Date(Date.now() + 60 * 1000);
      } else {
        // Если нет даты окончания — напоминание через 24 часа
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

  /**
   * PATCH /users/me/notifications
   * Настройки уведомлений пользователя
   */
  const notificationSettingsSchema = z.object({
    notificationsEnabled: z.boolean().optional(),
    creatorNotificationMode: z.enum(['MILESTONE', 'DAILY', 'OFF']).optional(),
  });

  fastify.patch('/users/me/notifications', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const parsed = notificationSettingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest('Ошибка валидации');
    }

    const data = parsed.data;
    const updateData: Record<string, unknown> = {};

    if (data.notificationsEnabled !== undefined) {
      updateData.notificationsEnabled = data.notificationsEnabled;
    }
    if (data.creatorNotificationMode !== undefined) {
      updateData.creatorNotificationMode = data.creatorNotificationMode;
    }

    if (Object.keys(updateData).length === 0) {
      return reply.badRequest('Нет данных для обновления');
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
      select: {
        notificationsEnabled: true,
        creatorNotificationMode: true,
      },
    });

    return reply.success(updated);
  });
};
