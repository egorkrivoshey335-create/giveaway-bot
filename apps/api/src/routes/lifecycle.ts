import type { FastifyPluginAsync } from 'fastify';
import { prisma, GiveawayStatus } from '@randombeast/database';
import { ErrorCode } from '@randombeast/shared';
import { requireUser, getUser } from '../plugins/auth.js';
import { finishGiveaway } from '../scheduler/giveaway-lifecycle.js';

/**
 * Routes для жизненного цикла розыгрышей (статус, победители, ручное завершение)
 */
export const lifecycleRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /giveaways/:id/status
   * Текущий статус розыгрыша (публичный)
   */
  fastify.get<{ Params: { id: string } }>('/giveaways/:id/status', async (request, reply) => {
    const { id } = request.params;

    const giveaway = await prisma.giveaway.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        title: true,
        winnersCount: true,
        startAt: true,
        endAt: true,
        totalParticipants: true,
        _count: {
          select: {
            participations: true,
            winners: true,
          },
        },
      },
    });

    if (!giveaway) {
      return reply.status(404).send({
        ok: false,
        error: 'Розыгрыш не найден',
      });
    }

    return reply.success({ status: giveaway.status,
      title: giveaway.title,
      winnersCount: giveaway.winnersCount,
      participantsCount: giveaway._count.participations,
      selectedWinnersCount: giveaway._count.winners,
      startsAt: giveaway.startAt?.toISOString() || null,
      endsAt: giveaway.endAt?.toISOString() || null });
  });

  /**
   * GET /giveaways/:id/winners
   * Получить список победителей (публичный)
   */
  fastify.get<{ Params: { id: string } }>('/giveaways/:id/winners', async (request, reply) => {
    const { id } = request.params;

    const giveaway = await prisma.giveaway.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        title: true,
        winnersCount: true,
        totalParticipants: true,
        updatedAt: true,
        winners: {
          orderBy: { place: 'asc' },
          include: {
            user: {
              select: {
                telegramUserId: true,
                firstName: true,
                lastName: true,
                username: true,
              },
            },
          },
        },
        _count: {
          select: {
            participations: true,
          },
        },
      },
    });

    if (!giveaway) {
      return reply.status(404).send({
        ok: false,
        error: 'Розыгрыш не найден',
      });
    }

    // Если розыгрыш не завершён — победителей нет
    if (giveaway.status !== GiveawayStatus.FINISHED) {
      return reply.success({ status: giveaway.status,
        winners: [],
        totalParticipants: giveaway._count.participations,
        message: 'Розыгрыш ещё не завершён' });
    }

    return reply.send({
      ok: true,
      status: giveaway.status,
      title: giveaway.title,
      winners: giveaway.winners.map((w) => ({
        place: w.place,
        ticketsUsed: w.ticketsUsed,
        selectedAt: w.selectedAt.toISOString(),
        user: {
          telegramUserId: w.user.telegramUserId.toString(),
          firstName: w.user.firstName,
          lastName: w.user.lastName,
          username: w.user.username,
        },
      })),
      totalParticipants: giveaway._count.participations,
      finishedAt: giveaway.updatedAt.toISOString(),
    });
  });

  /**
   * POST /giveaways/:id/finish
   * Ручное завершение розыгрыша (только владелец)
   */
  fastify.post<{ Params: { id: string } }>('/giveaways/:id/finish', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;

    // Проверяем ownership
    const giveaway = await prisma.giveaway.findFirst({
      where: {
        id,
        ownerUserId: user.id,
      },
      select: {
        id: true,
        status: true,
        title: true,
      },
    });

    if (!giveaway) {
      return reply.status(404).send({
        ok: false,
        error: 'Розыгрыш не найден или нет доступа',
      });
    }

    if (giveaway.status !== GiveawayStatus.ACTIVE) {
      return reply.status(400).send({
        ok: false,
        error: `Можно завершить только активный розыгрыш (текущий статус: ${giveaway.status})`,
      });
    }

    // Завершаем розыгрыш
    const result = await finishGiveaway(id);

    if (!result.ok) {
      return reply.status(400).send({
        ok: false,
        error: result.error,
      });
    }

    // Получаем победителей для ответа
    const winners = await prisma.winner.findMany({
      where: { giveawayId: id },
      orderBy: { place: 'asc' },
      include: {
        user: {
          select: {
            telegramUserId: true,
            firstName: true,
            username: true,
          },
        },
      },
    });

    fastify.log.info(
      { userId: user.id, giveawayId: id, winnersCount: result.winnersCount },
      'Giveaway manually finished'
    );

    return reply.send({
      ok: true,
      winnersCount: result.winnersCount,
      winners: winners.map((w) => ({
        place: w.place,
        user: {
          telegramUserId: w.user.telegramUserId.toString(),
          firstName: w.user.firstName,
          username: w.user.username,
        },
      })),
    });
  });

  /**
   * GET /giveaways/:id/my-result
   * Проверить свой результат в розыгрыше (авторизованный пользователь)
   */
  fastify.get<{ Params: { id: string } }>('/giveaways/:id/my-result', async (request, reply) => {
    const user = await getUser(request);
    
    if (!user) {
      return reply.status(401).send({
        ok: false,
        error: 'Требуется авторизация',
      });
    }

    const { id } = request.params;

    // Проверяем участие
    const participation = await prisma.participation.findUnique({
      where: {
        giveawayId_userId: {
          giveawayId: id,
          userId: user.id,
        },
      },
      select: {
        id: true,
        ticketsBase: true,
        ticketsExtra: true,
        status: true,
      },
    });

    if (!participation) {
      return reply.success({ participated: false,
        message: 'Вы не участвовали в этом розыгрыше' });
    }

    // Проверяем победу
    const winner = await prisma.winner.findUnique({
      where: {
        giveawayId_userId: {
          giveawayId: id,
          userId: user.id,
        },
      },
      select: {
        place: true,
        ticketsUsed: true,
        selectedAt: true,
        notifiedAt: true,
      },
    });

    const giveaway = await prisma.giveaway.findUnique({
      where: { id },
      select: {
        status: true,
        winnersCount: true,
        _count: {
          select: { winners: true },
        },
      },
    });

    return reply.send({
      ok: true,
      participated: true,
      tickets: participation.ticketsBase + participation.ticketsExtra,
      isWinner: !!winner,
      giveawayStatus: giveaway?.status,
      winner: winner ? {
        place: winner.place,
        totalWinners: giveaway?._count.winners || 0,
        selectedAt: winner.selectedAt.toISOString(),
      } : null,
    });
  });
};
