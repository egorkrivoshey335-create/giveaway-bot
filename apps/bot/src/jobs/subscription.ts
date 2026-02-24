/**
 * RandomBeast Bot — Subscription Lifecycle Jobs
 *
 * 🔒 ЗАДАЧА 1.11: BullMQ workers для жизненного цикла подписок
 *
 * Очереди:
 *   - `subscription:expire`         — деактивация истёкших подписок
 *   - `subscription:expire-warning` — предупреждение за 3 дня до истечения
 *   - `subscription:auto-renew`     — попытка автоматического продления (ЮKassa)
 */

import { Worker, Job } from 'bullmq';
import { bot } from '../bot.js';
import { config } from '../config.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('job:subscription');

// ─── Типы данных ─────────────────────────────────────────────────────────────

export interface SubscriptionExpireData {
  userId: string;
  telegramUserId: string;
  previousTier: string;
  entitlementId: string;
}

export interface SubscriptionExpireWarningData {
  userId: string;
  telegramUserId: string;
  tier: string;
  expiresAt: string;
  daysLeft: number;
  autoRenew: boolean;
}

export interface SubscriptionAutoRenewData {
  userId: string;
  telegramUserId: string;
  entitlementId: string;
  tier: string;
  productId: string;
  amount: number;
  currency: string;
}

// ─── Worker: subscription:expire ─────────────────────────────────────────────

/**
 * Деактивирует истёкшую подписку и уведомляет пользователя
 */
export const subscriptionExpireWorker = new Worker<SubscriptionExpireData>(
  'subscription-expire',
  async (job: Job<SubscriptionExpireData>) => {
    const { userId, telegramUserId, previousTier } = job.data;

    log.info({ userId, previousTier }, 'Processing subscription expiry');

    try {
      // Деактивируем подписку через API
      const response = await fetch(`${config.apiUrl}/internal/subscriptions/${userId}/deactivate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': config.internalApiToken,
        },
        body: JSON.stringify({ reason: 'expired' }),
      });

      if (!response.ok) {
        const err = await response.text();
        log.error({ userId, status: response.status, err }, 'Failed to deactivate subscription via API');
      }

      // Уведомляем пользователя
      const tierNames: Record<string, string> = {
        PLUS: 'Plus',
        PRO: 'Pro',
        BUSINESS: 'Business',
      };
      const tierName = tierNames[previousTier] || previousTier;

      const message = `⚠️ <b>Подписка ${tierName} истекла</b>

Ваша подписка ${tierName} была деактивирована. Ваш аккаунт переведён на тариф <b>Free</b>.

Для продолжения работы с расширенными возможностями — обновите подписку.`;

      await bot.api.sendMessage(telegramUserId, message, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            {
              text: '💳 Обновить подписку',
              web_app: { url: `${config.webappUrl}/subscription` },
            },
          ]],
        },
      });

      log.info({ userId }, 'Subscription expired, user notified');
      return { success: true };
    } catch (error: any) {
      if (error.error_code === 403) {
        log.warn({ telegramUserId }, 'User blocked bot, skipping notification');
        return { success: true, skipped: 'user_blocked' };
      }
      log.error({ error, userId }, 'Failed to process subscription expiry');
      throw error;
    }
  },
  {
    connection: {
      host: new URL(config.redis.url).hostname,
      port: parseInt(new URL(config.redis.url).port || '6379', 10),
    },
    concurrency: 5,
  }
);

subscriptionExpireWorker.on('completed', (job) => {
  log.info({ jobId: job.id }, 'Subscription expire job completed');
});

subscriptionExpireWorker.on('failed', (job, err) => {
  log.error({ jobId: job?.id, error: err.message }, 'Subscription expire job failed');
});

// ─── Worker: subscription:expire-warning ─────────────────────────────────────

/**
 * Предупреждает пользователя за 3 дня до истечения подписки
 */
export const subscriptionExpireWarningWorker = new Worker<SubscriptionExpireWarningData>(
  'subscription-expire-warning',
  async (job: Job<SubscriptionExpireWarningData>) => {
    const { userId, telegramUserId, tier, expiresAt, daysLeft, autoRenew } = job.data;

    log.info({ userId, tier, daysLeft }, 'Sending subscription expiry warning');

    try {
      const tierNames: Record<string, string> = {
        PLUS: 'Plus',
        PRO: 'Pro',
        BUSINESS: 'Business',
      };
      const tierName = tierNames[tier] || tier;
      const expiryDate = new Date(expiresAt).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

      const autoRenewText = autoRenew
        ? '🔄 Автопродление включено — подписка будет продлена автоматически.'
        : `⚠️ Автопродление отключено — не забудьте продлить вручную до ${expiryDate}.`;

      const message = `🔔 <b>Подписка ${tierName} истекает через ${daysLeft} дня</b>

Срок действия вашей подписки <b>${tierName}</b> истекает <b>${expiryDate}</b>.

${autoRenewText}`;

      await bot.api.sendMessage(telegramUserId, message, {
        parse_mode: 'HTML',
        reply_markup: autoRenew ? undefined : {
          inline_keyboard: [[
            {
              text: '💳 Продлить подписку',
              web_app: { url: `${config.webappUrl}/subscription` },
            },
          ]],
        },
      });

      log.info({ userId }, 'Expiry warning sent');
      return { success: true };
    } catch (error: any) {
      if (error.error_code === 403) {
        log.warn({ telegramUserId }, 'User blocked bot, skipping warning');
        return { success: true, skipped: 'user_blocked' };
      }
      log.error({ error, userId }, 'Failed to send expiry warning');
      throw error;
    }
  },
  {
    connection: {
      host: new URL(config.redis.url).hostname,
      port: parseInt(new URL(config.redis.url).port || '6379', 10),
    },
    concurrency: 5,
  }
);

subscriptionExpireWarningWorker.on('completed', (job) => {
  log.info({ jobId: job.id }, 'Expire warning job completed');
});

subscriptionExpireWarningWorker.on('failed', (job, err) => {
  log.error({ jobId: job?.id, error: err.message }, 'Expire warning job failed');
});

// ─── Worker: subscription:auto-renew ─────────────────────────────────────────

/**
 * Попытка автоматического продления подписки через ЮKassa
 */
export const subscriptionAutoRenewWorker = new Worker<SubscriptionAutoRenewData>(
  'subscription-auto-renew',
  async (job: Job<SubscriptionAutoRenewData>) => {
    const { userId, telegramUserId, entitlementId, tier, productId, amount, currency } = job.data;

    log.info({ userId, tier, amount }, 'Attempting auto-renewal');

    try {
      // Инициируем рекуррентный платёж через API
      const response = await fetch(`${config.apiUrl}/internal/subscriptions/${userId}/auto-renew`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': config.internalApiToken,
        },
        body: JSON.stringify({ entitlementId, productId, amount, currency }),
      });

      const result = await response.json() as { ok: boolean; error?: string; paymentId?: string };

      if (!response.ok || !result.ok) {
        log.warn({ userId, error: result.error }, 'Auto-renewal failed via API');

        // Уведомляем о неудаче
        const tierNames: Record<string, string> = {
          PLUS: 'Plus',
          PRO: 'Pro',
          BUSINESS: 'Business',
        };
        const tierName = tierNames[tier] || tier;

        const failMessage = `❌ <b>Не удалось продлить подписку ${tierName}</b>

Автоматическое продление не удалось. Пожалуйста, продлите подписку вручную, чтобы сохранить доступ к функциям.`;

        await bot.api.sendMessage(telegramUserId, failMessage, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              {
                text: '💳 Продлить вручную',
                web_app: { url: `${config.webappUrl}/subscription` },
              },
            ]],
          },
        }).catch(() => {});

        return { success: false, reason: result.error };
      }

      log.info({ userId, paymentId: result.paymentId }, 'Auto-renewal payment initiated');
      return { success: true, paymentId: result.paymentId };
    } catch (error: any) {
      log.error({ error, userId }, 'Auto-renewal error');
      throw error;
    }
  },
  {
    connection: {
      host: new URL(config.redis.url).hostname,
      port: parseInt(new URL(config.redis.url).port || '6379', 10),
    },
    concurrency: 3,
  }
);

subscriptionAutoRenewWorker.on('completed', (job) => {
  log.info({ jobId: job.id }, 'Auto-renew job completed');
});

subscriptionAutoRenewWorker.on('failed', (job, err) => {
  log.error({ jobId: job?.id, error: err.message }, 'Auto-renew job failed');
});
