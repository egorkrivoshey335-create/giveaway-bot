import { FastifyInstance } from 'fastify';
import { prisma } from '@randombeast/database';
import { isValidShortCode } from '@randombeast/shared';
import { ErrorCode } from '@randombeast/shared';

/**
 * GET /api/v1/giveaways/by-code/:shortCode
 * Получить розыгрыш по shortCode (для deep links)
 */
export async function giveawayByShortCodeRoutes(server: FastifyInstance) {
  server.get<{
    Params: { shortCode: string };
  }>('/by-code/:shortCode', async (request, reply) => {
    const { shortCode } = request.params;

    // Валидация shortCode
    if (!isValidShortCode(shortCode)) {
      return reply.badRequest('Invalid short code format');
    }

    // Поиск розыгрыша
    const giveaway = await prisma.giveaway.findUnique({
      where: { shortCode },
      select: {
        id: true,
        shortCode: true,
        title: true,
        status: true,
        type: true,
        startAt: true,
        endAt: true,
        isPublicInCatalog: true,
      },
    });

    if (!giveaway) {
      return reply.notFound('Giveaway not found');
    }

    return reply.success(giveaway);
  });
}
