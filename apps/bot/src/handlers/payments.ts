/**
 * Обработчики платежей Telegram Stars в боте
 *
 * Telegram Stars — нативная оплата внутри Telegram без редиректа.
 * Используется валюта XTR (Telegram Stars).
 *
 * Поток:
 * 1. Пользователь нажимает кнопку "Оплатить Stars" в боте
 * 2. Бот вызывает sendInvoice() с XTR валютой
 * 3. Telegram показывает нативный checkout
 * 4. Бот получает pre_checkout_query → отвечает answerPreCheckoutQuery
 * 5. После оплаты бот получает message:successful_payment
 * 6. Бот сообщает API через internal endpoint → API создаёт Purchase+Entitlement
 */

import type { Bot, Context } from 'grammy';
import { config } from '../config.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('payments');

// ============================================================================
// Product catalog (должен совпадать с БД)
// ============================================================================

interface StarProduct {
  productCode: string;
  title: string;
  description: string;
  starsPrice: number; // Цена в Stars (XTR)
  emoji: string;
}

const STAR_PRODUCTS: Record<string, StarProduct> = {
  SUBSCRIPTION_PLUS: {
    productCode: 'SUBSCRIPTION_PLUS',
    title: 'RandomBeast PLUS',
    description: 'Расширенные возможности: аналитика, выбор маскота, CSV экспорт на 30 дней',
    starsPrice: 200,
    emoji: '⭐',
  },
  SUBSCRIPTION_PRO: {
    productCode: 'SUBSCRIPTION_PRO',
    title: 'RandomBeast PRO',
    description: 'Профессиональные инструменты: liveness check, до 100 победителей, кастомные задания на 30 дней',
    starsPrice: 500,
    emoji: '🚀',
  },
  SUBSCRIPTION_BUSINESS: {
    productCode: 'SUBSCRIPTION_BUSINESS',
    title: 'RandomBeast BUSINESS',
    description: 'Максимум: белый лейбл, webhook API, до 200 победителей, выделенная поддержка на 30 дней',
    starsPrice: 1500,
    emoji: '💼',
  },
  CATALOG_MONTHLY_1000: {
    productCode: 'CATALOG_MONTHLY_1000',
    title: 'Доступ к каталогу розыгрышей',
    description: 'Полный доступ к каталогу активных розыгрышей на 30 дней',
    starsPrice: 100,
    emoji: '🎁',
  },
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Уведомить API об успешной Stars оплате
 * API создаёт Purchase (COMPLETED) + Entitlement
 */
async function notifyApiStarsPayment(params: {
  telegramUserId: number;
  productCode: string;
  starsAmount: number;
  telegramPaymentChargeId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const url = `${config.apiUrl}/api/v1/internal/stars-payment`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': config.internalApiToken,
      },
      body: JSON.stringify(params),
    });

    return response.json() as Promise<{ ok: boolean; error?: string }>;
  } catch (error) {
    log.error({ error, params }, 'Failed to notify API about Stars payment');
    return { ok: false, error: 'Network error' };
  }
}

// ============================================================================
// Send invoice
// ============================================================================

/**
 * Отправить инвойс Telegram Stars пользователю
 */
export async function sendStarsInvoice(
  ctx: Context,
  productCode: string
): Promise<void> {
  const product = STAR_PRODUCTS[productCode];

  if (!product) {
    await ctx.reply('❌ Продукт не найден');
    return;
  }

  try {
    // Для Telegram Stars: currency='XTR', provider_token='', amount=stars (целые числа)
    await ctx.api.sendInvoice(
      ctx.chat!.id,
      `${product.emoji} ${product.title}`,
      product.description,
      JSON.stringify({ productCode: product.productCode }),
      'XTR',
      [{ label: product.title, amount: product.starsPrice }],
      { provider_token: '' }
    );
  } catch (error) {
    log.error({ error, productCode }, 'Failed to send Stars invoice');
    await ctx.reply('❌ Не удалось создать счёт. Попробуйте позже.');
  }
}

// ============================================================================
// Register handlers
// ============================================================================

export function registerPaymentHandlers(bot: Bot): void {
  /**
   * pre_checkout_query — Telegram спрашивает бот "одобрить ли платёж?"
   * Бот ОБЯЗАН ответить в течение 10 секунд.
   * Здесь можно проверить наличие товара, не заблокирован ли пользователь и т.д.
   */
  bot.on('pre_checkout_query', async (ctx) => {
    const query = ctx.preCheckoutQuery;
    const userId = query.from.id;

    log.info(
      { userId, amount: query.total_amount, currency: query.currency, payload: query.invoice_payload },
      'pre_checkout_query received'
    );

    try {
      // Парсим payload для валидации
      const payload = JSON.parse(query.invoice_payload) as { productCode?: string };

      if (!payload.productCode || !STAR_PRODUCTS[payload.productCode]) {
        await ctx.answerPreCheckoutQuery(false, {
          error_message: 'Продукт не найден. Попробуйте ещё раз.',
        });
        return;
      }

      // Одобряем платёж
      await ctx.answerPreCheckoutQuery(true);

      log.info({ userId, productCode: payload.productCode }, 'pre_checkout_query approved');
    } catch (error) {
      log.error({ error, userId }, 'Failed to process pre_checkout_query');
      // Если что-то пошло не так — отклоняем с понятным сообщением
      await ctx.answerPreCheckoutQuery(false, {
        error_message: 'Произошла ошибка. Попробуйте позже.',
      });
    }
  });

  /**
   * successful_payment — Telegram подтверждает успешную оплату Stars
   * Здесь мы уведомляем API и активируем entitlement
   */
  bot.on('message:successful_payment', async (ctx) => {
    const payment = ctx.message.successful_payment;
    const userId = ctx.from!.id;

    log.info(
      {
        userId,
        amount: payment.total_amount,
        currency: payment.currency,
        chargeId: payment.telegram_payment_charge_id,
        payload: payment.invoice_payload,
      },
      'successful_payment received'
    );

    try {
      const payload = JSON.parse(payment.invoice_payload) as { productCode?: string };

      if (!payload.productCode) {
        log.error({ userId, payload: payment.invoice_payload }, 'No productCode in Stars payment payload');
        await ctx.reply('⚠️ Ошибка обработки платежа. Обратитесь в поддержку с ID: ' + payment.telegram_payment_charge_id);
        return;
      }

      // Уведомляем API
      const result = await notifyApiStarsPayment({
        telegramUserId: userId,
        productCode: payload.productCode,
        starsAmount: payment.total_amount,
        telegramPaymentChargeId: payment.telegram_payment_charge_id,
      });

      if (result.ok) {
        const product = STAR_PRODUCTS[payload.productCode];
        const productName = product?.title || payload.productCode;

        await ctx.reply(
          `🎉 <b>Оплата Stars прошла успешно!</b>\n\n` +
          `${product?.emoji || '⭐'} <b>${productName}</b> активирована.\n\n` +
          `💫 Списано: ${payment.total_amount} Stars\n\n` +
          `Откройте приложение, чтобы воспользоваться всеми возможностями.`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[
                { text: '📱 Открыть приложение', web_app: { url: config.webappUrl } },
              ]],
            },
          }
        );

        log.info({ userId, productCode: payload.productCode }, 'Stars payment processed successfully');
      } else {
        log.error({ userId, result }, 'API failed to process Stars payment');
        await ctx.reply(
          `⚠️ <b>Платёж получен</b>, но произошла ошибка при активации.\n\n` +
          `ID транзакции: <code>${payment.telegram_payment_charge_id}</code>\n\n` +
          `Пожалуйста, обратитесь в поддержку с этим ID.`,
          { parse_mode: 'HTML' }
        );
      }
    } catch (error) {
      log.error({ error, userId }, 'Failed to process successful_payment');
      await ctx.reply(
        `⚠️ Произошла ошибка при обработке платежа.\n` +
        `ID: <code>${payment.telegram_payment_charge_id}</code>\n\n` +
        `Обратитесь в поддержку.`,
        { parse_mode: 'HTML' }
      );
    }
  });

  // ── Команда /buy для покупки через Stars ──────────────────────────────────
  bot.command('buy', async (ctx) => {
    const args = ctx.match?.trim();

    if (!args) {
      // Показываем меню выбора продукта
      await ctx.reply(
        '⭐ <b>Оплата через Telegram Stars</b>\n\n' +
        'Выберите подписку:',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '⭐ PLUS — 200 Stars/мес', callback_data: 'stars_buy:SUBSCRIPTION_PLUS' }],
              [{ text: '🚀 PRO — 500 Stars/мес', callback_data: 'stars_buy:SUBSCRIPTION_PRO' }],
              [{ text: '💼 BUSINESS — 1500 Stars/мес', callback_data: 'stars_buy:SUBSCRIPTION_BUSINESS' }],
              [{ text: '🎁 Каталог — 100 Stars/мес', callback_data: 'stars_buy:CATALOG_MONTHLY_1000' }],
            ],
          },
        }
      );
      return;
    }

    // /buy SUBSCRIPTION_PLUS — прямая оплата
    const productCode = args.toUpperCase();
    if (STAR_PRODUCTS[productCode]) {
      await sendStarsInvoice(ctx, productCode);
    } else {
      await ctx.reply('❌ Продукт не найден. Используйте /buy без аргументов для выбора.');
    }
  });

  // ── Callback для кнопок выбора Stars продукта ─────────────────────────────
  bot.callbackQuery(/^stars_buy:(.+)$/, async (ctx) => {
    const productCode = ctx.match![1];

    await ctx.answerCallbackQuery();
    await sendStarsInvoice(ctx, productCode);
  });

  log.info('Payment handlers registered (pre_checkout_query, successful_payment, /buy, stars_buy)');
}
