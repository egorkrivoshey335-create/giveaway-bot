import type { FastifyPluginAsync } from 'fastify';
import { prisma, PurchaseStatus } from '@randombeast/database';
import { requireUser } from '../plugins/auth.js';
import { createPayment, isYooKassaConfigured } from '../lib/yookassa.js';
import { config } from '../config.js';

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

  /**
   * POST /subscriptions/change
   * Смена тарифного плана (апгрейд или даунгрейд).
   */
  fastify.post<{ Body: { newProductCode: string } }>(
    '/subscriptions/change',
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const body = request.body as { newProductCode: string };
      const newProductCode = body?.newProductCode;

      if (!newProductCode) {
        return reply.status(400).send({ ok: false, error: 'newProductCode required' });
      }

      if (!isYooKassaConfigured()) {
        return reply.status(503).send({ ok: false, error: 'Платёжная система временно недоступна' });
      }

      const newProduct = await prisma.product.findFirst({
        where: { code: newProductCode, isActive: true },
      });

      if (!newProduct) {
        return reply.status(404).send({ ok: false, error: 'Продукт не найден' });
      }

      // Текущий tier
      const currentEntitlement = await prisma.entitlement.findFirst({
        where: {
          userId: user.id,
          code: { startsWith: 'tier.' },
          revokedAt: null,
          cancelledAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { createdAt: 'desc' },
      });

      const tierPriority: Record<string, number> = {
        'tier.business': 4, 'tier.pro': 3, 'tier.plus': 2, 'tier.free': 1,
      };

      const currentTierPriority = tierPriority[currentEntitlement?.code || 'tier.free'] || 1;
      const newTierPriority = tierPriority[newProduct.entitlementCode] || 1;

      if (currentTierPriority === newTierPriority) {
        return reply.status(400).send({ ok: false, error: 'Вы уже на этом плане' });
      }

      // Отмечаем текущую подписку как отменённую (access до expiresAt сохраняется)
      if (currentEntitlement) {
        await prisma.entitlement.update({
          where: { id: currentEntitlement.id },
          data: { autoRenew: false, cancelledAt: new Date() },
        });
      }

      // Создаём новый платёж
      const purchase = await prisma.purchase.create({
        data: {
          userId: user.id,
          productId: newProduct.id,
          amount: newProduct.price,
          currency: newProduct.currency,
          status: PurchaseStatus.PENDING,
        },
      });

      const returnUrl = `${config.yookassa.returnUrl}?purchaseId=${purchase.id}`;

      try {
        const payment = await createPayment({
          amount: newProduct.price / 100,
          currency: newProduct.currency,
          description: `${newTierPriority > currentTierPriority ? 'Апгрейд' : 'Смена плана'}: ${newProduct.title}`,
          returnUrl,
          metadata: {
            purchaseId: purchase.id,
            userId: user.id,
            productCode: newProduct.code,
          },
        });

        await prisma.purchase.update({
          where: { id: purchase.id },
          data: { externalId: payment.id },
        });

        return reply.success({
          paymentUrl: payment.confirmation?.confirmation_url,
          purchaseId: purchase.id,
          action: newTierPriority > currentTierPriority ? 'upgrade' : 'downgrade',
        });
      } catch (error) {
        fastify.log.error({ error, purchaseId: purchase.id }, 'Failed to create subscription change payment');
        await prisma.purchase.update({
          where: { id: purchase.id },
          data: { status: PurchaseStatus.FAILED },
        });
        return reply.status(500).send({ ok: false, error: 'Ошибка создания платежа' });
      }
    }
  );

  /**
   * GET /users/me/entitlements
   * Список всех активных прав доступа текущего пользователя
   */
  fastify.get('/users/me/entitlements', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const entitlements = await prisma.entitlement.findMany({
      where: {
        userId: user.id,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.success({
      items: entitlements.map(e => ({
        id: e.id,
        code: e.code,
        expiresAt: e.expiresAt?.toISOString() || null,
        autoRenew: e.autoRenew,
        cancelledAt: e.cancelledAt?.toISOString() || null,
        sourceType: e.sourceType,
      })),
    });
  });
};
