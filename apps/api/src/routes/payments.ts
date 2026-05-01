import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, PurchaseStatus } from '@randombeast/database';
import { requireUser, getUser } from '../plugins/auth.js';
import { config } from '../config.js';
import { createBill, getBillStatus, isCardlinkConfigured } from '../lib/cardlink.js';
import { processSuccessfulPayment } from './webhooks.js';

/**
 * Routes для платежей (создание, проверка статуса, список продуктов)
 * Платёжный провайдер: Cardlink (https://cardlink.link/).
 * Webhook обработка — в webhooks.ts (HMAC-MD5 подпись от Cardlink).
 */
export const paymentsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /payments/create
   * Создать платёж для покупки продукта через Cardlink.
   * Возвращает paymentUrl для редиректа пользователя на платёжную страницу.
   */
  fastify.post<{ Body: { productCode: string } }>(
    '/payments/create',
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      if (!isCardlinkConfigured()) {
        return reply.status(503).send({
          ok: false,
          error: 'Платёжная система временно недоступна',
        });
      }

      const body = z.object({
        productCode: z.string().min(1),
      }).parse(request.body);

      const product = await prisma.product.findFirst({
        where: { code: body.productCode, isActive: true },
      });

      if (!product) {
        return reply.status(404).send({ ok: false, error: 'Продукт не найден' });
      }

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

      const purchase = await prisma.purchase.create({
        data: {
          userId: user.id,
          productId: product.id,
          amount: product.price,
          currency: product.currency,
          status: PurchaseStatus.PENDING,
        },
      });

      // Cardlink делает POST-редирект на success/fail URL.
      // На этой странице фронт делает polling /payments/status/:purchaseId.
      const returnUrl = `${config.cardlink.returnUrl}?purchaseId=${purchase.id}`;

      try {
        const amountRub = product.price / 100;
        const bill = await createBill({
          amount: amountRub,
          currency: product.currency as 'RUB' | 'USD' | 'EUR',
          description: product.title,
          orderId: purchase.id,
          custom: user.id, // userId на всякий случай в custom
          successUrl: returnUrl,
          failUrl: returnUrl,
          returnUrl,
          name: product.title,
        });

        await prisma.purchase.update({
          where: { id: purchase.id },
          data: { externalId: bill.bill_id },
        });

        fastify.log.info(
          { userId: user.id, purchaseId: purchase.id, billId: bill.bill_id, productCode: product.code },
          'Cardlink bill created'
        );

        return reply.success({
          paymentUrl: bill.link_page_url,
          purchaseId: purchase.id,
        });
      } catch (error) {
        fastify.log.error({ error, purchaseId: purchase.id }, 'Failed to create Cardlink bill');

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
   * Проверить статус покупки (для polling после возврата с платёжной страницы).
   * Если PENDING и есть externalId — запрашивает статус у Cardlink (fallback).
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

      // Если PENDING — спрашиваем Cardlink напрямую
      if (purchase.status === PurchaseStatus.PENDING && purchase.externalId) {
        try {
          const bill = await getBillStatus(purchase.externalId);

          if (bill.status === 'SUCCESS') {
            await processSuccessfulPayment(purchaseId, purchase.externalId, fastify.log);
            return reply.success({ status: 'COMPLETED', productTitle: purchase.product.title });
          } else if (bill.status === 'FAIL') {
            await prisma.purchase.update({
              where: { id: purchase.id },
              data: { status: PurchaseStatus.FAILED },
            });
            return reply.success({ status: 'FAILED', productTitle: purchase.product.title });
          }
        } catch (error) {
          fastify.log.error({ error, purchaseId }, 'Failed to check Cardlink bill status');
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
