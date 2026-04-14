import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, PurchaseStatus } from '@randombeast/database';
import { requireUser, getUser } from '../plugins/auth.js';
import { config } from '../config.js';
import { createPayment, getPayment, isYooKassaConfigured } from '../lib/yookassa.js';
import { processSuccessfulPayment } from './webhooks.js';

/**
 * Routes для платежей (создание, проверка статуса, список продуктов)
 * Webhook обработка перенесена в webhooks.ts (с IP whitelist + подписью)
 */
export const paymentsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /payments/create
   * Создать платёж для покупки продукта через ЮKassa.
   * Возвращает confirmation_url для редиректа пользователя на страницу оплаты.
   */
  fastify.post<{ Body: { productCode: string } }>(
    '/payments/create',
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      if (!isYooKassaConfigured()) {
        return reply.status(503).send({
          ok: false,
          error: 'Платёжная система временно недоступна',
        });
      }

      const body = z.object({
        productCode: z.string().min(1),
      }).parse(request.body);

      // Находим продукт
      const product = await prisma.product.findFirst({
        where: { code: body.productCode, isActive: true },
      });

      if (!product) {
        return reply.status(404).send({ ok: false, error: 'Продукт не найден' });
      }

      // Проверяем нет ли уже активного доступа этого типа
      const existingEntitlement = await prisma.entitlement.findFirst({
        where: {
          userId: user.id,
          code: product.entitlementCode,
          revokedAt: null,
          cancelledAt: null,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
      });

      if (existingEntitlement) {
        return reply.status(400).send({
          ok: false,
          error: 'У вас уже есть активный доступ',
          expiresAt: existingEntitlement.expiresAt?.toISOString() || null,
        });
      }

      // Создаём запись о покупке (PENDING)
      const purchase = await prisma.purchase.create({
        data: {
          userId: user.id,
          productId: product.id,
          amount: product.price,
          currency: product.currency,
          status: PurchaseStatus.PENDING,
        },
      });

      // Формируем return URL с purchaseId для polling
      const returnUrl = `${config.yookassa.returnUrl}?purchaseId=${purchase.id}`;

      try {
        const amountRub = product.price / 100;
        const payment = await createPayment({
          amount: amountRub,
          currency: product.currency,
          description: product.title,
          returnUrl,
          metadata: {
            purchaseId: purchase.id,
            userId: user.id,
            productCode: product.code,
          },
          receipt: {
            customer: { email: 'noreply@cosmolex.ru' },
            items: [{
              description: product.title,
              quantity: '1',
              amount: { value: amountRub.toFixed(2), currency: product.currency },
              vat_code: 1,
            }],
          },
        });

        // Сохраняем ID платежа ЮKassa для дальнейшего polling
        await prisma.purchase.update({
          where: { id: purchase.id },
          data: { externalId: payment.id },
        });

        fastify.log.info(
          { userId: user.id, purchaseId: purchase.id, paymentId: payment.id, productCode: product.code },
          'Payment created'
        );

        return reply.success({
          paymentUrl: payment.confirmation?.confirmation_url,
          purchaseId: purchase.id,
        });
      } catch (error) {
        fastify.log.error({ error, purchaseId: purchase.id }, 'Failed to create payment');

        await prisma.purchase.update({
          where: { id: purchase.id },
          data: { status: PurchaseStatus.FAILED },
        });

        return reply.status(500).send({ ok: false, error: 'Ошибка создания платежа' });
      }
    }
  );

  /**
   * GET /payments/status/:purchaseId
   * Проверить статус покупки (для polling после возврата с ЮKassa).
   * Если PENDING и есть externalId — запрашивает статус у ЮKassa.
   */
  fastify.get<{ Params: { purchaseId: string } }>(
    '/payments/status/:purchaseId',
    async (request, reply) => {
      const user = await getUser(request);
      const { purchaseId } = request.params;

      const purchase = await prisma.purchase.findFirst({
        where: {
          id: purchaseId,
          ...(user ? { userId: user.id } : {}),
        },
        include: { product: true },
      });

      if (!purchase) {
        return reply.status(404).send({ ok: false, error: 'Покупка не найдена' });
      }

      // Если PENDING — проверяем в ЮKassa напрямую (polling fallback)
      if (purchase.status === PurchaseStatus.PENDING && purchase.externalId) {
        try {
          const payment = await getPayment(purchase.externalId);

          if (payment.status === 'succeeded') {
            await processSuccessfulPayment(purchaseId, purchase.externalId, fastify.log);
            return reply.success({ status: 'COMPLETED', productTitle: purchase.product.title });
          } else if (payment.status === 'canceled') {
            await prisma.purchase.update({
              where: { id: purchase.id },
              data: { status: PurchaseStatus.FAILED },
            });
            return reply.success({ status: 'FAILED', productTitle: purchase.product.title });
          }
        } catch (error) {
          fastify.log.error({ error, purchaseId }, 'Failed to check payment status from YooKassa');
        }
      }

      return reply.success({
        status: purchase.status,
        productTitle: purchase.product.title,
        expiresAt: null,
      });
    }
  );

  /**
   * GET /payments/history
   * История покупок текущего пользователя
   */
  fastify.get('/payments/history', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const purchases = await prisma.purchase.findMany({
      where: { userId: user.id },
      include: { product: { select: { code: true, title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return reply.success({
      items: purchases.map(p => ({
        id: p.id,
        productCode: p.product.code,
        productTitle: p.product.title,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        paidAt: p.paidAt?.toISOString() || null,
        createdAt: p.createdAt.toISOString(),
      })),
    });
  });
};
