/**
 * RandomBeast — Custom Tasks Routes
 *
 * Endpoints для управления кастомными заданиями для участников.
 *
 * @packageDocumentation
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '@randombeast/database';
import { ErrorCode } from '@randombeast/shared';
import { requireUser } from '../plugins/auth.js';

// Schemas
const createCustomTaskSchema = z.object({
  giveawayId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  linkUrl: z.string().url().optional().nullable(),
  isRequired: z.boolean().default(false),
  bonusTickets: z.number().int().min(0).max(100).default(1),
});

const updateCustomTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  linkUrl: z.string().url().optional().nullable(),
  isRequired: z.boolean().optional(),
  bonusTickets: z.number().int().min(0).max(100).optional(),
});

export const customTasksRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /custom-tasks
   * Создать кастомное задание
   */
  fastify.post('/custom-tasks', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const body = createCustomTaskSchema.parse(request.body);

    // Проверяем что giveaway принадлежит пользователю
    const giveaway = await prisma.giveaway.findFirst({
      where: {
        id: body.giveawayId,
        ownerUserId: user.id,
      },
    });

    if (!giveaway) {
      return reply.notFound('Giveaway not found');
    }

    // Проверяем статус розыгрыша (можно добавлять задания только в DRAFT/PENDING_CONFIRM)
    if (!['DRAFT', 'PENDING_CONFIRM'].includes(giveaway.status)) {
      return reply.badRequest('Cannot add tasks to active or finished giveaway');
    }

    // Создаём задание
    const customTask = await prisma.giveawayCustomTask.create({
      data: {
        giveawayId: body.giveawayId,
        title: body.title,
        url: body.linkUrl || '',
        bonusTickets: body.bonusTickets,
      },
    });

    fastify.log.info({ userId: user.id, taskId: customTask.id }, 'Custom task created');

    return reply.success(customTask);
  });

  /**
   * GET /custom-tasks/giveaway/:giveawayId
   * Получить все кастомные задания розыгрыша
   */
  fastify.get<{ Params: { giveawayId: string } }>(
    '/custom-tasks/giveaway/:giveawayId',
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const { giveawayId } = request.params;

      // Проверяем что giveaway принадлежит пользователю
      const giveaway = await prisma.giveaway.findFirst({
        where: {
          id: giveawayId,
          ownerUserId: user.id,
        },
      });

      if (!giveaway) {
        return reply.notFound('Giveaway not found');
      }

      // Получаем все задания
      const tasks = await prisma.giveawayCustomTask.findMany({
        where: { giveawayId },
        orderBy: { createdAt: 'asc' },
      });

      return reply.success(tasks);
    }
  );

  /**
   * PATCH /custom-tasks/:id
   * Обновить кастомное задание
   */
  fastify.patch<{ Params: { id: string } }>('/custom-tasks/:id', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;
    const body = updateCustomTaskSchema.parse(request.body);

    // Проверяем что задание существует и принадлежит пользователю
    const task = await prisma.giveawayCustomTask.findFirst({
      where: { id },
      include: {
        giveaway: {
          select: {
            ownerUserId: true,
            status: true,
          },
        },
      },
    });

    if (!task || task.giveaway.ownerUserId !== user.id) {
      return reply.notFound('Custom task not found');
    }

    // Проверяем статус розыгрыша
    if (!['DRAFT', 'PENDING_CONFIRM'].includes(task.giveaway.status)) {
      return reply.badRequest('Cannot update tasks in active or finished giveaway');
    }

    // Обновляем
    const updated = await prisma.giveawayCustomTask.update({
      where: { id },
      data: body,
    });

    fastify.log.info({ userId: user.id, taskId: id }, 'Custom task updated');

    return reply.success(updated);
  });

  /**
   * DELETE /custom-tasks/:id
   * Удалить кастомное задание
   */
  fastify.delete<{ Params: { id: string } }>('/custom-tasks/:id', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    // Проверяем что задание существует и принадлежит пользователю
    const task = await prisma.giveawayCustomTask.findFirst({
      where: { id },
      include: {
        giveaway: {
          select: {
            ownerUserId: true,
            status: true,
          },
        },
      },
    });

    if (!task || task.giveaway.ownerUserId !== user.id) {
      return reply.notFound('Custom task not found');
    }

    // Проверяем статус розыгрыша
    if (!['DRAFT', 'PENDING_CONFIRM'].includes(task.giveaway.status)) {
      return reply.badRequest('Cannot delete tasks from active or finished giveaway');
    }

    // Удаляем
    await prisma.giveawayCustomTask.delete({
      where: { id },
    });

    fastify.log.info({ userId: user.id, taskId: id }, 'Custom task deleted');

    return reply.success({ message: 'Custom task deleted successfully' });
  });
};
