import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, PurchaseStatus } from '@randombeast/database';
import { requireUser, getUser } from '../plugins/auth.js';
import { config } from '../config.js';
import { createPayment, getPayment, isYooKassaConfigured, YooKassaWebhookPayload } from '../lib/yookassa.js';

/**
 * Routes для платежей
 */
export const paymentsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /payments/create
   * Создать платёж для покупки продукта
   */
  fastify.post<{
    Body: { productCode: string };
  }>('/payments/create', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    // Проверяем что ЮKassa настроена
    if (!isYooKassaConfigured()) {
      return reply.status(503).send({
        ok: false,
        error: 'Платёжная система временно недоступна',
      });
    }

    const body = z.object({
      productCode: z.string(),
    }).parse(request.body);

    // Находим продукт
    const product = await prisma.product.findFirst({
      where: {
        code: body.productCode,
        isActive: true,
      },
    });

    if (!product) {
      return reply.status(404).send({
        ok: false,
        error: 'Продукт не найден',
      });
    }

    // Проверяем нет ли уже активного доступа
    const existingEntitlement = await prisma.entitlement.findFirst({
      where: {
        userId: user.id,
        code: product.entitlementCode,
        revokedAt: null,
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
      });
    }

    // Создаём запись о покупке
    const purchase = await prisma.purchase.create({
      data: {
        userId: user.id,
        productId: product.id,
        amount: product.price,
        currency: product.currency,
        status: PurchaseStatus.PENDING,
      },
    });

    // Формируем URL возврата с purchaseId
    const returnUrl = `${config.yookassa.returnUrl}?purchaseId=${purchase.id}`;

    try {
      // Создаём платёж в ЮKassa
      const payment = await createPayment({
        amount: product.price / 100, // Конвертируем из копеек в рубли
        currency: product.currency,
        description: product.title,
        returnUrl,
        metadata: {
          purchaseId: purchase.id,
          userId: user.id,
          productCode: product.code,
        },
      });

      // Сохраняем ID платежа ЮKassa
      await prisma.purchase.update({
        where: { id: purchase.id },
        data: {
          externalId: payment.id,
        },
      });

      fastify.log.info(
        { userId: user.id, purchaseId: purchase.id, paymentId: payment.id },
        'Payment created'
      );

      return reply.send({
        ok: true,
        paymentUrl: payment.confirmation?.confirmation_url,
        purchaseId: purchase.id,
      });
    } catch (error) {
      fastify.log.error({ error, purchaseId: purchase.id }, 'Failed to create payment');
      
      // Помечаем покупку как неудачную
      await prisma.purchase.update({
        where: { id: purchase.id },
        data: { status: PurchaseStatus.FAILED },
      });

      return reply.status(500).send({
        ok: false,
        error: 'Ошибка создания платежа',
      });
    }
  });

  /**
   * GET /payments/status/:purchaseId
   * Проверить статус покупки
   */
  fastify.get<{
    Params: { purchaseId: string };
  }>('/payments/status/:purchaseId', async (request, reply) => {
    const user = await getUser(request);
    const { purchaseId } = request.params;

    // Находим покупку
    const purchase = await prisma.purchase.findFirst({
      where: {
        id: purchaseId,
        // Если пользователь авторизован — проверяем что это его покупка
        ...(user ? { userId: user.id } : {}),
      },
      include: {
        product: true,
      },
    });

    if (!purchase) {
      return reply.status(404).send({
        ok: false,
        error: 'Покупка не найдена',
      });
    }

    // Если статус PENDING — проверяем в ЮKassa
    if (purchase.status === PurchaseStatus.PENDING && purchase.externalId) {
      try {
        const payment = await getPayment(purchase.externalId);
        
        if (payment.status === 'succeeded') {
          // Обрабатываем успешный платёж
          await processSuccessfulPayment(purchase.id, fastify);
          
          return reply.send({
            ok: true,
            status: 'COMPLETED',
            productTitle: purchase.product.title,
          });
        } else if (payment.status === 'canceled') {
          await prisma.purchase.update({
            where: { id: purchase.id },
            data: { status: PurchaseStatus.FAILED },
          });
          
          return reply.send({
            ok: true,
            status: 'FAILED',
          });
        }
      } catch (error) {
        fastify.log.error({ error, purchaseId }, 'Failed to check payment status');
      }
    }

    return reply.send({
      ok: true,
      status: purchase.status,
      productTitle: purchase.product.title,
    });
  });

  /**
   * POST /webhooks/yookassa
   * Webhook от ЮKassa о статусе платежа
   */
  fastify.post('/webhooks/yookassa', async (request, reply) => {
    try {
      const payload = request.body as YooKassaWebhookPayload;

      fastify.log.info({ event: payload.event, paymentId: payload.object?.id }, 'YooKassa webhook received');

      // Обрабатываем только успешные платежи
      if (payload.event !== 'payment.succeeded') {
        return reply.send({ ok: true });
      }

      const payment = payload.object;
      const purchaseId = payment.metadata?.purchaseId;

      if (!purchaseId) {
        fastify.log.warn({ paymentId: payment.id }, 'Webhook without purchaseId in metadata');
        return reply.send({ ok: true });
      }

      // Обрабатываем успешный платёж
      await processSuccessfulPayment(purchaseId, fastify);

      return reply.send({ ok: true });
    } catch (error) {
      fastify.log.error({ error }, 'Webhook processing error');
      // Всегда возвращаем 200 чтобы ЮKassa не ретраила
      return reply.send({ ok: true });
    }
  });
};

/**
 * Обработать успешный платёж — создать Entitlement
 */
async function processSuccessfulPayment(purchaseId: string, fastify: { log: { info: Function; warn: Function; error: Function } }) {
  // Находим покупку
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: { product: true },
  });

  if (!purchase) {
    fastify.log.warn({ purchaseId }, 'Purchase not found for webhook');
    return;
  }

  // Идемпотентность: если уже обработано — пропускаем
  if (purchase.status === PurchaseStatus.COMPLETED) {
    fastify.log.info({ purchaseId }, 'Payment already processed');
    return;
  }

  // Транзакция: обновляем статус + создаём Entitlement
  await prisma.$transaction(async (tx) => {
    // Обновляем статус покупки
    await tx.purchase.update({
      where: { id: purchaseId },
      data: {
        status: PurchaseStatus.COMPLETED,
        paidAt: new Date(),
      },
    });

    // Вычисляем дату истечения
    const expiresAt = purchase.product.periodDays
      ? new Date(Date.now() + purchase.product.periodDays * 24 * 60 * 60 * 1000)
      : null;

    // Создаём Entitlement
    await tx.entitlement.create({
      data: {
        userId: purchase.userId,
        code: purchase.product.entitlementCode,
        sourceType: 'purchase',
        sourceId: purchase.id,
        expiresAt,
      },
    });
  });

  fastify.log.info(
    { purchaseId, userId: purchase.userId, entitlementCode: purchase.product.entitlementCode },
    'Payment processed, entitlement created'
  );
}
