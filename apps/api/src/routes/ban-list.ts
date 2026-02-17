import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '@randombeast/database';
import { requireUser } from '../plugins/auth.js';

export const banListRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /giveaways/:id/participants/:userId/ban
   * Забанить участника (добавить в бан-лист создателя)
   */
  fastify.post<{ Params: { id: string; userId: string } }>(
    '/giveaways/:id/participants/:userId/ban',
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const { id: giveawayId, userId: targetUserId } = request.params;

      const body = z.object({
        reason: z.string().max(500).optional(),
      }).parse(request.body || {});

      // Проверяем владение розыгрышем
      const giveaway = await prisma.giveaway.findFirst({
        where: { id: giveawayId, ownerUserId: user.id },
        select: { id: true },
      });

      if (!giveaway) {
        return reply.notFound('Розыгрыш не найден');
      }

      // Проверяем что целевой пользователь существует
      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, firstName: true, username: true },
      });

      if (!targetUser) {
        return reply.notFound('Пользователь не найден');
      }

      // Нельзя забанить себя
      if (targetUserId === user.id) {
        return reply.badRequest('Нельзя забанить самого себя');
      }

      // Создаём запись в бан-листе (или пропускаем если уже забанен)
      try {
        const ban = await prisma.creatorBanList.create({
          data: {
            creatorUserId: user.id,
            bannedUserId: targetUserId,
            reason: body.reason || null,
          },
        });

        fastify.log.info(
          { creatorId: user.id, bannedUserId: targetUserId, giveawayId },
          'User banned by creator'
        );

        return reply.success({
          id: ban.id,
          bannedUserId: targetUserId,
          reason: ban.reason,
          createdAt: ban.createdAt.toISOString(),
        });
      } catch (err: unknown) {
        // Unique constraint — уже в бан-листе
        if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
          return reply.conflict('Пользователь уже в бан-листе');
        }
        throw err;
      }
    }
  );

  /**
   * POST /giveaways/:id/participants/:userId/unban
   * Разбанить участника
   */
  fastify.post<{ Params: { id: string; userId: string } }>(
    '/giveaways/:id/participants/:userId/unban',
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const { id: giveawayId, userId: targetUserId } = request.params;

      // Проверяем владение розыгрышем
      const giveaway = await prisma.giveaway.findFirst({
        where: { id: giveawayId, ownerUserId: user.id },
        select: { id: true },
      });

      if (!giveaway) {
        return reply.notFound('Розыгрыш не найден');
      }

      // Удаляем из бан-листа
      const deleted = await prisma.creatorBanList.deleteMany({
        where: {
          creatorUserId: user.id,
          bannedUserId: targetUserId,
        },
      });

      if (deleted.count === 0) {
        return reply.notFound('Пользователь не найден в бан-листе');
      }

      fastify.log.info(
        { creatorId: user.id, unbannedUserId: targetUserId, giveawayId },
        'User unbanned by creator'
      );

      return reply.success({ unbanned: true });
    }
  );

  /**
   * GET /ban-list
   * Список забаненных пользователей для текущего создателя
   */
  fastify.get<{
    Querystring: { limit?: string; offset?: string };
  }>('/ban-list', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { limit: limitStr, offset: offsetStr } = request.query;
    const limit = Math.min(parseInt(limitStr || '50', 10), 100);
    const offset = parseInt(offsetStr || '0', 10);

    const [items, total] = await Promise.all([
      prisma.creatorBanList.findMany({
        where: { creatorUserId: user.id },
        include: {
          bannedUser: {
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
      prisma.creatorBanList.count({
        where: { creatorUserId: user.id },
      }),
    ]);

    return reply.success({
      items: items.map(ban => ({
        id: ban.id,
        reason: ban.reason,
        createdAt: ban.createdAt.toISOString(),
        user: {
          id: ban.bannedUser.id,
          telegramUserId: ban.bannedUser.telegramUserId.toString(),
          firstName: ban.bannedUser.firstName,
          lastName: ban.bannedUser.lastName,
          username: ban.bannedUser.username,
        },
      })),
      total,
    });
  });

  /**
   * DELETE /ban-list/:id
   * Удалить запись из бан-листа по ID
   */
  fastify.delete<{ Params: { id: string } }>(
    '/ban-list/:id',
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const { id } = request.params;

      // Проверяем что запись принадлежит текущему пользователю
      const ban = await prisma.creatorBanList.findFirst({
        where: { id, creatorUserId: user.id },
      });

      if (!ban) {
        return reply.notFound('Запись не найдена');
      }

      await prisma.creatorBanList.delete({ where: { id } });

      fastify.log.info(
        { creatorId: user.id, banId: id, unbannedUserId: ban.bannedUserId },
        'Ban list entry deleted'
      );

      return reply.success({ deleted: true });
    }
  );
};
