/**
 * RandomBeast — Webhooks Routes
 *
 * Единая точка обработки webhook'ов:
 *   - Telegram Bot updates
 *   - Cardlink payment postback (заменил ЮKassa)
 *
 * Cardlink postback приходит в формате `application/x-www-form-urlencoded`,
 * подпись = strtoupper(md5(OutSum + ":" + InvId + ":" + apiToken))
 *
 * @packageDocumentation
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, PurchaseStatus } from '@randombeast/database';
import { config } from '../config.js';
import {
  verifyCardlinkSignature,
  type CardlinkPaymentPostback,
} from '../lib/cardlink.js';
import { awardPatronBadge } from '../lib/badges.js';
import { notifyNewPurchase } from '../lib/admin-notify.js';

// ============================================================================
// Payment processing logic
// ============================================================================

/**
 * Обработка успешного платежа — атомарное создание Purchase + Entitlement.
 * Идемпотентна: повторный вызов с тем же purchaseId игнорируется.
 */
async function processSuccessfulPayment(
  purchaseId: string,
  externalPaymentId: string,
  log: { info: (obj: object, msg: string) => void; warn: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void }
): Promise<{ alreadyProcessed: boolean; userId?: string; entitlementCode?: string }> {
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: { product: true, user: true },
  });

  if (!purchase) {
    log.warn({ purchaseId, externalPaymentId }, 'Purchase not found for webhook');
    return { alreadyProcessed: false };
  }

  // Идемпотентность: если уже COMPLETED — пропускаем
  if (purchase.status === PurchaseStatus.COMPLETED) {
    log.info({ purchaseId }, 'Payment already processed (idempotent)');
    return { alreadyProcessed: true };
  }

  // Вычисляем дату истечения (periodDays = null → бессрочный)
  const expiresAt = purchase.product.periodDays
    ? new Date(Date.now() + purchase.product.periodDays * 24 * 60 * 60 * 1000)
    : null;

  // Атомарная транзакция: Purchase → COMPLETED + Entitlement
  await prisma.$transaction(async (tx) => {
    await tx.purchase.update({
      where: { id: purchaseId },
      data: {
        status: PurchaseStatus.COMPLETED,
        paidAt: new Date(),
        externalId: externalPaymentId, // Cardlink TrsId / bill_id
      },
    });

    // Отзываем предыдущие entitlement того же кода (если есть), чтобы не дублировать
    await tx.entitlement.updateMany({
      where: {
        userId: purchase.userId,
        code: purchase.product.entitlementCode,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    await tx.entitlement.create({
      data: {
        userId: purchase.userId,
        code: purchase.product.entitlementCode,
        sourceType: 'purchase',
        sourceId: purchase.id,
        expiresAt,
        autoRenew: purchase.product.periodDays !== null,
      },
    });

    // Auto-grant catalog.access with any tier subscription (PLUS/PRO/BUSINESS)
    const tierCodes = ['tier.plus', 'tier.pro', 'tier.business'];
    if (tierCodes.includes(purchase.product.entitlementCode)) {
      await tx.entitlement.updateMany({
        where: {
          userId: purchase.userId,
          code: 'catalog.access',
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      await tx.entitlement.create({
        data: {
          userId: purchase.userId,
          code: 'catalog.access',
          sourceType: 'purchase',
          sourceId: purchase.id,
          expiresAt,
          autoRenew: purchase.product.periodDays !== null,
        },
      });
    }
  });

  log.info(
    {
      purchaseId,
      userId: purchase.userId,
      entitlementCode: purchase.product.entitlementCode,
      expiresAt,
    },
    'Payment processed, entitlement created'
  );

  // Бейджи: начисляем 'patron' при первой оплате (fire-and-forget)
  awardPatronBadge(purchase.userId).catch(() => {});

  // Системные уведомления админу (fire-and-forget)
  notifyNewPurchase({
    username: purchase.user.username,
    productTitle: purchase.product.title,
    amount: purchase.amount,
    currency: purchase.currency,
  });

  return {
    alreadyProcessed: false,
    userId: purchase.userId,
    entitlementCode: purchase.product.entitlementCode,
  };
}

/**
 * Обработка отменённого/проваленного платежа
 */
async function processFailedPayment(
  purchaseId: string,
  log: { info: (obj: object, msg: string) => void; warn: (obj: object, msg: string) => void }
): Promise<void> {
  const purchase = await prisma.purchase.findUnique({ where: { id: purchaseId } });

  if (!purchase || purchase.status !== PurchaseStatus.PENDING) {
    log.warn({ purchaseId }, 'Cannot cancel: purchase not found or not PENDING');
    return;
  }

  await prisma.purchase.update({
    where: { id: purchase.id },
    data: { status: PurchaseStatus.FAILED },
  });

  log.info({ purchaseId }, 'Payment marked as FAILED');
}

/**
 * Уведомить пользователя через бота после успешной оплаты
 */
async function notifyUserAfterPayment(
  userId: string,
  entitlementCode: string,
  log: { info: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void }
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.telegramUserId) return;

    const telegramId = Number(user.telegramUserId);

    const messages: Record<string, Record<string, string>> = {
      'catalog.access': {
        ru: '🎉 <b>Оплата прошла!</b>\n\nДоступ к каталогу розыгрышей активирован на 30 дней.\n\n🎁 Открывайте приложение и участвуйте!',
        en: '🎉 <b>Payment successful!</b>\n\nCatalog access activated for 30 days.\n\n🎁 Open the app and participate!',
        kk: '🎉 <b>Төлем сәтті өтті!</b>\n\nКаталогқа қол жетімділік 30 күнге белсендірілді.\n\n🎁 Қолданбаны ашып, қатысыңыз!',
      },
      'tier.plus': {
        ru: '⭐ <b>PLUS подписка активирована!</b>\n\nТеперь вам доступны расширенные возможности.\n\nОткройте приложение, чтобы использовать все функции.',
        en: '⭐ <b>PLUS subscription activated!</b>\n\nExtended features are now available to you.',
        kk: '⭐ <b>PLUS жазылымы белсендірілді!</b>\n\nКеңейтілген мүмкіндіктер қолжетімді.',
      },
      'tier.pro': {
        ru: '🚀 <b>PRO подписка активирована!</b>\n\nПолный доступ ко всем профессиональным возможностям.',
        en: '🚀 <b>PRO subscription activated!</b>\n\nFull access to all professional features.',
        kk: '🚀 <b>PRO жазылымы белсендірілді!</b>\n\nБарлық кәсіби мүмкіндіктерге толық қол жетімділік.',
      },
      'tier.business': {
        ru: '💼 <b>BUSINESS подписка активирована!</b>\n\nМаксимальные возможности для вашего бизнеса.',
        en: '💼 <b>BUSINESS subscription activated!</b>\n\nMaximum capabilities for your business.',
        kk: '💼 <b>BUSINESS жазылымы белсендірілді!</b>\n\nБизнесіңіз үшін максималды мүмкіндіктер.',
      },
    };

    const lang = (user.language || 'ru') as 'ru' | 'en' | 'kk';
    const msgSet = messages[entitlementCode] || messages['catalog.access'];
    const text = msgSet[lang] || msgSet['ru'];

    const webappUrl = config.webappUrl || 'https://app.randombeast.ru';

    await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramId,
        text,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: '📱 Открыть приложение', web_app: { url: webappUrl } },
          ]],
        },
      }),
    });

    log.info({ userId, telegramId, entitlementCode }, 'Payment notification sent to user');
  } catch (error) {
    log.error({ error, userId }, 'Failed to send payment notification');
  }
}

// ============================================================================
// Telegram update schema
// ============================================================================

const telegramUpdateSchema = z.object({
  update_id: z.number(),
}).passthrough();

// ============================================================================
// Routes
// ============================================================================

export const webhooksRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Парсер для application/x-www-form-urlencoded ──────────────────────────
  // Cardlink postback приходит именно в этом формате.
  // Регистрируем тип-парсер только в области этого плагина.
  fastify.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_req, body, done) => {
      try {
        const params = new URLSearchParams(body as string);
        const obj: Record<string, string> = {};
        for (const [k, v] of params.entries()) {
          obj[k] = v;
        }
        done(null, obj);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  /**
   * POST /webhooks/telegram/:botToken
   * Webhook endpoint для Telegram Bot updates.
   */
  fastify.post<{ Params: { botToken: string } }>(
    '/telegram/:botToken',
    async (request, reply) => {
      const { botToken } = request.params;

      if (botToken !== config.botToken) {
        return reply.status(403).send({ success: false, error: 'Invalid bot token' });
      }

      const update = telegramUpdateSchema.parse(request.body);
      fastify.log.info({ updateId: update.update_id }, 'Telegram update received');

      return reply.success({ ok: true });
    }
  );

  /**
   * POST /webhooks/cardlink
   * 🔒 Защищённый webhook от Cardlink (Result URL).
   *
   * Порядок проверок:
   * 1. MD5 подпись: strtoupper(md5(OutSum + ":" + InvId + ":" + apiToken))
   * 2. Обработка события (Status: SUCCESS / FAIL / UNDERPAID / OVERPAID)
   * 3. Всегда 200 OK — чтобы Cardlink не ретраил
   *
   * Формат тела: application/x-www-form-urlencoded
   * Поля: InvId, OutSum, Commission, TrsId, Status, CurrencyIn, custom, SignatureValue, ...
   */
  fastify.post('/cardlink', async (request, reply) => {
    const log = fastify.log;

    const payload = request.body as Partial<CardlinkPaymentPostback>;

    if (!payload || typeof payload !== 'object') {
      log.warn({}, 'Cardlink webhook: empty/invalid body');
      return reply.status(200).send('OK'); // Cardlink ждёт 200
    }

    const { InvId, OutSum, Status, TrsId, SignatureValue } = payload;

    if (!InvId || !OutSum || !Status || !SignatureValue) {
      log.warn({ payload }, 'Cardlink webhook: missing required fields');
      return reply.status(200).send('OK');
    }

    // ── 1. Проверка подписи ─────────────────────────────────────────────────
    const isValid = verifyCardlinkSignature(OutSum, InvId, SignatureValue);

    if (!isValid) {
      log.warn(
        { InvId, signaturePreview: SignatureValue.slice(0, 8) + '...' },
        'Cardlink webhook: invalid signature'
      );
      // 200 чтобы не палить факт блокировки
      return reply.status(200).send('OK');
    }

    log.info({ InvId, Status, TrsId, OutSum }, 'Cardlink webhook received');

    // ── 2. Обработка статусов ────────────────────────────────────────────────
    try {
      if (Status === 'SUCCESS' || Status === 'OVERPAID') {
        // OVERPAID — клиент заплатил больше, считаем как успех
        const result = await processSuccessfulPayment(InvId, TrsId || '', log);

        if (!result.alreadyProcessed && result.userId && result.entitlementCode) {
          await notifyUserAfterPayment(result.userId, result.entitlementCode, log);
        }
      } else if (Status === 'FAIL') {
        await processFailedPayment(InvId, log);
      } else if (Status === 'UNDERPAID') {
        // Клиент заплатил меньше — это не успех, но и не fail.
        // Покупка остаётся PENDING, дальше уже руками разбирать.
        log.warn({ InvId, OutSum }, 'Cardlink webhook: UNDERPAID (manual review needed)');
      } else {
        log.info({ Status, InvId }, 'Cardlink webhook: unknown status, ignoring');
      }
    } catch (error) {
      // Логируем ошибку, но возвращаем 200 чтобы Cardlink не ретраил бесконечно
      log.error({ error, InvId, Status }, 'Cardlink webhook processing error');
    }

    // Cardlink ждёт код 200 (ретраит при любом другом)
    return reply.status(200).send('OK');
  });

  /**
   * POST /webhooks/cardlink/refund
   * Заглушка для Refund postback от Cardlink.
   * Пока что просто логируем и возвращаем 200, чтобы Cardlink не ретраил.
   * TODO: реализовать обработку возврата (обновить purchase.status = REFUNDED, отозвать entitlement).
   */
  fastify.post('/cardlink/refund', async (request, reply) => {
    fastify.log.warn({ body: request.body }, 'Cardlink refund webhook received (handler not implemented)');
    return reply.status(200).send('OK');
  });

  /**
   * POST /webhooks/cardlink/chargeback
   * Заглушка для Chargeback postback от Cardlink.
   * Пока что просто логируем и возвращаем 200, чтобы Cardlink не ретраил.
   * TODO: реализовать обработку чарджбэка (бан пользователя? уведомление админу?).
   */
  fastify.post('/cardlink/chargeback', async (request, reply) => {
    fastify.log.warn({ body: request.body }, 'Cardlink chargeback webhook received (handler not implemented)');
    return reply.status(200).send('OK');
  });
};

// ============================================================================
// Экспорт утилит для тестирования и polling fallback
// ============================================================================
export { processSuccessfulPayment, processFailedPayment };
