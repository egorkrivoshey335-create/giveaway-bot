/**
 * RandomBeast — Webhooks Routes
 *
 * Единая точка обработки webhook'ов (YooKassa, Telegram Bot).
 * YooKassa webhook: IP whitelist + HMAC-SHA256 подпись + обработка платежей.
 *
 * @packageDocumentation
 */

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma, PurchaseStatus } from '@randombeast/database';
import { ErrorCode } from '@randombeast/shared';
import { config } from '../config.js';
import crypto from 'crypto';
import { awardPatronBadge } from '../lib/badges.js';
import { notifyNewPurchase } from '../lib/admin-notify.js';

// ============================================================================
// IP Whitelist ЮKassa
// https://yookassa.ru/developers/using-api/webhooks#ip
// ============================================================================

/** Список IP-диапазонов ЮKassa в CIDR нотации */
const YOOKASSA_IP_RANGES = [
  { base: [185, 71, 76, 0], prefix: 27 },  // 185.71.76.0/27
  { base: [185, 71, 77, 0], prefix: 27 },  // 185.71.77.0/27
  { base: [77, 75, 153, 0], prefix: 25 },  // 77.75.153.0/25
  // IPv6 диапазоны ЮKassa (для полноты)
];

/** Проверить, входит ли IP в CIDR диапазон */
function ipInCIDR(ip: string, base: number[], prefix: number): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }

  const ipInt = (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
  const baseInt = (base[0] << 24) | (base[1] << 16) | (base[2] << 8) | base[3];
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;

  return (ipInt & mask) === (baseInt & mask);
}

/** Проверить IP клиента на принадлежность ЮKassa */
function isYooKassaIP(ip: string): boolean {
  // В dev режиме разрешаем localhost
  if (config.isDev && (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1')) {
    return true;
  }

  // Убираем IPv6 prefix
  const cleanIp = ip.replace(/^::ffff:/, '');

  return YOOKASSA_IP_RANGES.some(range => ipInCIDR(cleanIp, range.base, range.prefix));
}

/** Получить реальный IP клиента (с учётом Nginx proxy) */
function getClientIP(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    const firstIP = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
      .split(',')[0]
      .trim();
    return firstIP;
  }
  return request.ip;
}

// ============================================================================
// YooKassa signature verification
// ============================================================================

/**
 * Проверка HMAC-SHA256 подписи от ЮKassa
 * @see https://yookassa.ru/developers/using-api/webhooks#notification-auth
 */
function verifyYooKassaSignature(rawBody: string, signature: string, secret: string): boolean {
  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    // timing-safe comparison для защиты от timing attacks
    if (expectedSignature.length !== signature.length) return false;

    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

// ============================================================================
// YooKassa payload types
// ============================================================================

interface YooKassaPaymentObject {
  id: string;
  status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';
  amount: { value: string; currency: string };
  metadata?: Record<string, string>;
  payment_method?: { type: string; saved?: boolean };
  refundable?: boolean;
  captured_at?: string;
  description?: string;
}

interface YooKassaRefundObject {
  id: string;
  payment_id: string;
  status: string;
  amount: { value: string; currency: string };
}

type YooKassaWebhookEvent =
  | 'payment.succeeded'
  | 'payment.canceled'
  | 'payment.waiting_for_capture'
  | 'refund.succeeded';

interface YooKassaWebhookPayload {
  type: 'notification';
  event: YooKassaWebhookEvent;
  object: YooKassaPaymentObject | YooKassaRefundObject;
}

// ============================================================================
// Payment processing logic
// ============================================================================

/**
 * Обработка успешного платежа — атомарное создание Purchase + Entitlement.
 * Идемпотентна: повторный вызов с тем же purchaseId игнорируется.
 */
async function processSuccessfulPayment(
  purchaseId: string,
  yookassaPaymentId: string,
  log: { info: (obj: object, msg: string) => void; warn: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void }
): Promise<{ alreadyProcessed: boolean; userId?: string; entitlementCode?: string }> {
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: { product: true, user: true },
  });

  if (!purchase) {
    log.warn({ purchaseId, yookassaPaymentId }, 'Purchase not found for webhook');
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
        externalId: yookassaPaymentId, // Фиксируем ID платежа ЮKassa
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

  // 14.5 Бейджи: начисляем бейдж 'patron' при первой оплате (fire-and-forget)
  awardPatronBadge(purchase.userId).catch(() => {});

  // 17.2 Системные уведомления: уведомляем админа о покупке (fire-and-forget)
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
 * Обработка отменённого платежа
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
    where: { id: purchaseId },
    data: { status: PurchaseStatus.FAILED },
  });

  log.info({ purchaseId }, 'Payment marked as FAILED');
}

/**
 * Обработка возврата — отзываем Entitlement
 */
async function processRefund(
  yookassaPaymentId: string,
  log: { info: (obj: object, msg: string) => void; warn: (obj: object, msg: string) => void }
): Promise<void> {
  const purchase = await prisma.purchase.findFirst({
    where: { externalId: yookassaPaymentId, status: PurchaseStatus.COMPLETED },
    include: { product: true },
  });

  if (!purchase) {
    log.warn({ yookassaPaymentId }, 'Cannot refund: completed purchase not found');
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.purchase.update({
      where: { id: purchase.id },
      data: { status: PurchaseStatus.REFUNDED },
    });

    await tx.entitlement.updateMany({
      where: {
        userId: purchase.userId,
        code: purchase.product.entitlementCode,
        sourceId: purchase.id,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  });

  log.info({ purchaseId: purchase.id, yookassaPaymentId }, 'Refund processed, entitlement revoked');
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
  /**
   * POST /webhooks/telegram/:botToken
   * Webhook endpoint для Telegram Bot updates.
   */
  fastify.post<{ Params: { botToken: string } }>(
    '/webhooks/telegram/:botToken',
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
   * POST /webhooks/yookassa
   * 🔒 Защищённый webhook от ЮKassa.
   *
   * Порядок проверок:
   * 1. IP whitelist (185.71.76.0/27, 185.71.77.0/27, 77.75.153.0/25)
   * 2. HMAC-SHA256 подпись (X-YooKassa-Signature заголовок)
   * 3. Обработка события (payment.succeeded / payment.canceled / refund.succeeded)
   * 4. Всегда 200 OK — чтобы ЮKassa не ретраила
   */
  fastify.post('/webhooks/yookassa', async (request, reply) => {
    const log = fastify.log;

    // ── 1. IP Whitelist ──────────────────────────────────────────────────────
    const clientIP = getClientIP(request);

    if (!isYooKassaIP(clientIP)) {
      log.warn({ clientIP }, 'YooKassa webhook: IP not in whitelist');
      // Возвращаем 200 чтобы не раскрывать информацию о блокировке
      return reply.success({ ok: true });
    }

    // ── 2. Signature verification ────────────────────────────────────────────
    const webhookSecret = config.yookassa?.webhookSecret;

    if (webhookSecret) {
      const signature = request.headers['x-yookassa-signature'] as string | undefined;

      if (!signature) {
        log.warn({ clientIP }, 'YooKassa webhook: missing signature header');
        return reply.success({ ok: true }); // 200 чтобы не ретраила
      }

      const rawBody = JSON.stringify(request.body);
      const isValid = verifyYooKassaSignature(rawBody, signature, webhookSecret);

      if (!isValid) {
        log.warn({ clientIP, signature: signature.slice(0, 16) + '...' }, 'YooKassa webhook: invalid signature');
        return reply.success({ ok: true }); // 200 чтобы не ретраила
      }
    } else {
      log.warn('YOOKASSA_WEBHOOK_SECRET not set — signature verification skipped (NOT safe for production)');
    }

    // ── 3. Parse payload ─────────────────────────────────────────────────────
    const payload = request.body as YooKassaWebhookPayload;
    const { event, object: paymentObj } = payload;

    log.info({ event, objectId: paymentObj?.id }, 'YooKassa webhook received');

    try {
      // ── 4. Handle events ─────────────────────────────────────────────────
      if (event === 'payment.succeeded') {
        const payment = paymentObj as YooKassaPaymentObject;
        const purchaseId = payment.metadata?.purchaseId;

        if (!purchaseId) {
          log.warn({ paymentId: payment.id }, 'payment.succeeded: no purchaseId in metadata');
          return reply.success({ ok: true });
        }

        const result = await processSuccessfulPayment(purchaseId, payment.id, log);

        // Уведомляем пользователя в боте (если не дубликат)
        if (!result.alreadyProcessed && result.userId && result.entitlementCode) {
          await notifyUserAfterPayment(result.userId, result.entitlementCode, log);
        }

      } else if (event === 'payment.canceled') {
        const payment = paymentObj as YooKassaPaymentObject;
        const purchaseId = payment.metadata?.purchaseId;

        if (purchaseId) {
          await processFailedPayment(purchaseId, log);
        } else {
          log.warn({ paymentId: payment.id }, 'payment.canceled: no purchaseId in metadata');
        }

      } else if (event === 'refund.succeeded') {
        const refund = paymentObj as YooKassaRefundObject;
        await processRefund(refund.payment_id, log);

      } else if (event === 'payment.waiting_for_capture') {
        // Платёж ожидает подтверждения (для двухэтапных платежей) — пока не используем
        log.info({ objectId: paymentObj?.id }, 'payment.waiting_for_capture: ignored (auto-capture enabled)');

      } else {
        log.info({ event }, 'YooKassa webhook: unknown event, ignoring');
      }
    } catch (error) {
      // Логируем ошибку, но возвращаем 200 чтобы ЮKassa не ретраила бесконечно
      log.error({ error, event }, 'YooKassa webhook processing error');
    }

    // Всегда 200 OK
    return reply.success({ ok: true });
  });
};

// ============================================================================
// Экспорт утилит для тестирования
// ============================================================================
export { processSuccessfulPayment, processFailedPayment, processRefund, isYooKassaIP };
