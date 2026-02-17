import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '@randombeast/database';
import { requireUser } from '../plugins/auth.js';

/**
 * Форматирует цену из минорных единиц в читаемый формат
 */
function formatPrice(priceMinor: number, currency: string): string {
  const amount = priceMinor / 100;
  if (currency === 'RUB') {
    return `${amount.toLocaleString('ru-RU')} \u20BD`;
  }
  return `${amount} ${currency}`;
}

export const productsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /products
   * Публичный список доступных продуктов (тарифов)
   * Возвращает только активные продукты с ценами
   */
  fastify.get('/products', async (_request, reply) => {
    const products = await prisma.product.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' },
      select: {
        id: true,
        code: true,
        title: true,
        description: true,
        price: true,
        currency: true,
        periodDays: true,
        type: true,
        entitlementCode: true,
        starsPrice: true,
      },
    });

    return reply.success({
      items: products.map(p => ({
        ...p,
        priceFormatted: formatPrice(p.price, p.currency),
      })),
      total: products.length,
    });
  });

  /**
   * POST /subscriptions/cancel
   * Отмена подписки (отключение auto-renew, подписка действует до expiresAt)
   */
  fastify.post<{ Body: { entitlementId: string } }>(
    '/subscriptions/cancel',
    {
      schema: {
        body: {
          type: 'object',
          required: ['entitlementId'],
          properties: {
            entitlementId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const { entitlementId } = request.body;

      // Находим entitlement
      const entitlement = await prisma.entitlement.findFirst({
        where: {
          id: entitlementId,
          userId: user.id,
          revokedAt: null,
          cancelledAt: null,
        },
      });

      if (!entitlement) {
        return reply.notFound('Subscription not found or already cancelled');
      }

      // Отменяем: выключаем autoRenew и ставим cancelledAt
      const updated = await prisma.entitlement.update({
        where: { id: entitlementId },
        data: {
          autoRenew: false,
          cancelledAt: new Date(),
        },
      });

      fastify.log.info(
        { userId: user.id, entitlementId, code: entitlement.code },
        'Subscription cancelled'
      );

      return reply.success({
        id: updated.id,
        code: updated.code,
        autoRenew: updated.autoRenew,
        cancelledAt: updated.cancelledAt?.toISOString(),
        expiresAt: updated.expiresAt?.toISOString(),
      });
    }
  );

  /**
   * GET /subscriptions/current
   * Текущая подписка пользователя (на основе entitlements)
   */
  fastify.get('/subscriptions/current', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    // Ищем активные tier-entitlements
    const tierEntitlements = await prisma.entitlement.findMany({
      where: {
        userId: user.id,
        code: { startsWith: 'tier.' },
        revokedAt: null,
        cancelledAt: null,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    if (tierEntitlements.length === 0) {
      return reply.success({
        tier: 'FREE',
        expiresAt: null,
        autoRenew: false,
        cancelledAt: null,
      });
    }

    // Берём самый высокий tier
    const tierPriority: Record<string, number> = {
      'tier.business': 4,
      'tier.pro': 3,
      'tier.plus': 2,
    };

    const bestEntitlement = tierEntitlements.sort(
      (a, b) => (tierPriority[b.code] || 0) - (tierPriority[a.code] || 0)
    )[0];

    const tierMap: Record<string, string> = {
      'tier.business': 'BUSINESS',
      'tier.pro': 'PRO',
      'tier.plus': 'PLUS',
    };

    return reply.success({
      tier: tierMap[bestEntitlement.code] || 'FREE',
      entitlementId: bestEntitlement.id,
      expiresAt: bestEntitlement.expiresAt?.toISOString() || null,
      autoRenew: bestEntitlement.autoRenew,
      cancelledAt: bestEntitlement.cancelledAt?.toISOString() || null,
      sourceType: bestEntitlement.sourceType,
    });
  });
};
