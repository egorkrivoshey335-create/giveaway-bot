import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, GiveawayStatus } from '@randombeast/database';
import { ErrorCode } from '@randombeast/shared';
import { getUser, requireUser } from '../plugins/auth.js';
import { getCache, setCache } from '../lib/redis.js';

// Код права доступа к каталогу
const CATALOG_ENTITLEMENT_CODE = 'catalog.access';

// Сколько розыгрышей показывать без подписки
const PREVIEW_COUNT = 3;

// Цена подписки
const SUBSCRIPTION_PRICE = 1000;

/**
 * Проверить есть ли у пользователя активный доступ к каталогу
 */
async function checkCatalogAccess(userId: string): Promise<{ hasAccess: boolean; expiresAt: Date | null }> {
  const now = new Date();
  
  const entitlement = await prisma.entitlement.findFirst({
    where: {
      userId,
      code: CATALOG_ENTITLEMENT_CODE,
      revokedAt: null,
      OR: [
        { expiresAt: null }, // Бессрочный
        { expiresAt: { gt: now } }, // Ещё не истёк
      ],
    },
    orderBy: { expiresAt: 'desc' },
  });

  return {
    hasAccess: !!entitlement,
    expiresAt: entitlement?.expiresAt || null,
  };
}

/**
 * Routes для каталога розыгрышей
 */
export const catalogRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /catalog/count
   * Публичный endpoint с количеством розыгрышей в каталоге
   * 🔒 СОЗДАНО (2026-02-16): Redis кеширование (TTL 300 секунд)
   */
  fastify.get('/catalog/count', async (request, reply) => {
    // 🔒 Проверяем кеш (5 минут)
    const cacheKey = 'catalog:count';
    const cached = await getCache(cacheKey);
    if (cached) {
      return reply.success(cached);
    }

    // Считаем активные розыгрыши в каталоге
    const count = await prisma.giveaway.count({
      where: {
        status: GiveawayStatus.ACTIVE,
        isPublicInCatalog: true,
      },
    });

    const data = { count };

    // 🔒 Сохраняем в кеш (5 минут)
    await setCache(cacheKey, data, 300);

    return reply.success(data);
  });

  /**
   * GET /catalog
   * Список публичных розыгрышей в каталоге
   * 🔒 ИСПРАВЛЕНО (2026-02-16): Cursor-based pagination вместо offset
   */
  fastify.get<{
    Querystring: {
      limit?: string;
      cursor?: string; // ID последнего элемента предыдущей страницы
    };
  }>('/catalog', async (request, reply) => {
    const user = await getUser(request);
    const { limit: limitStr, cursor } = request.query;
    const limitNum = Math.min(parseInt(limitStr || '20', 10), 100);

    // Проверяем доступ (если авторизован)
    let hasAccess = false;
    if (user) {
      const access = await checkCatalogAccess(user.id);
      hasAccess = access.hasAccess;
    }

    // Если нет доступа — показываем только PREVIEW_COUNT
    const effectiveLimit = hasAccess ? limitNum : PREVIEW_COUNT;

    // 🔒 Cursor-based pagination: WHERE id > cursor
    const giveaways = await prisma.giveaway.findMany({
      where: {
        status: GiveawayStatus.ACTIVE,
        isPublicInCatalog: true,
        ...(cursor ? { id: { gt: cursor } } : {}), // Курсор: ID > последний элемент
      },
      select: {
        id: true,
        title: true,
        winnersCount: true,
        endAt: true,
        totalParticipants: true,
        _count: {
          select: { participations: true },
        },
        publishChannels: {
          take: 1,
          include: {
            channel: {
              select: {
                id: true,
                title: true,
                username: true,
                memberCount: true,
              },
            },
          },
        },
      },
      orderBy: [
        { totalParticipants: 'desc' },
        { id: 'asc' }, // Для стабильности курсора
      ],
      take: effectiveLimit + 1, // +1 для определения hasMore
    });

    // Проверяем есть ли ещё элементы
    const hasMore = giveaways.length > effectiveLimit;
    const items = hasMore ? giveaways.slice(0, effectiveLimit) : giveaways;

    // Следующий курсор = ID последнего элемента
    const nextCursor = items.length > 0 ? items[items.length - 1].id : null;

    // Общее количество (для UI)
    const total = await prisma.giveaway.count({
      where: {
        status: GiveawayStatus.ACTIVE,
        isPublicInCatalog: true,
      },
    });

    // Формируем ответ
    const result = items.map(g => {
      const channel = g.publishChannels[0]?.channel;
      return {
        id: g.id,
        title: g.title || 'Без названия',
        participantsCount: g._count.participations,
        winnersCount: g.winnersCount,
        endAt: g.endAt?.toISOString() || null,
        channel: channel
          ? {
              id: channel.id,
              title: channel.title,
              username: channel.username ? `@${channel.username}` : null,
              subscribersCount: channel.memberCount || 0,
            }
          : null,
      };
    });

    return reply.success({
      hasAccess,
      giveaways: result,
      pagination: {
        cursor: nextCursor,
        hasMore,
        total,
      },
      previewCount: PREVIEW_COUNT,
      subscriptionPrice: SUBSCRIPTION_PRICE,
    });
  });

  /**
   * GET /catalog/access
   * Проверить доступ текущего пользователя к каталогу
   */
  fastify.get('/catalog/access', async (request, reply) => {
    const user = await getUser(request);

    if (!user) {
      return reply.success({ hasAccess: false,
        price: SUBSCRIPTION_PRICE,
        currency: 'RUB' });
    }

    const access = await checkCatalogAccess(user.id);

    if (access.hasAccess) {
      return reply.success({ hasAccess: true,
        expiresAt: access.expiresAt?.toISOString() || null });
    }

    return reply.success({ hasAccess: false,
      price: SUBSCRIPTION_PRICE,
      currency: 'RUB' });
  });

  /**
   * POST /giveaways/:id/catalog
   * Включить/выключить показ в каталоге (для создателя)
   */
  fastify.post<{
    Params: { id: string };
    Body: { enabled: boolean };
  }>('/giveaways/:id/catalog', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { id } = request.params;
    const body = z.object({
      enabled: z.boolean(),
    }).parse(request.body);

    // Проверяем что розыгрыш принадлежит пользователю
    const giveaway = await prisma.giveaway.findFirst({
      where: {
        id,
        ownerUserId: user.id,
      },
    });

    if (!giveaway) {
      return reply.status(404).send({
        ok: false,
        error: 'Giveaway not found',
      });
    }

    // Обновляем флаг
    await prisma.giveaway.update({
      where: { id },
      data: {
        isPublicInCatalog: body.enabled,
      },
    });

    fastify.log.info(
      { userId: user.id, giveawayId: id, catalogEnabled: body.enabled },
      'Catalog visibility updated'
    );

    return reply.success({ catalogEnabled: body.enabled });
  });
};
