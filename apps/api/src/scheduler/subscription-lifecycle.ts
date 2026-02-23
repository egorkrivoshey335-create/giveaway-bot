/**
 * Планировщик жизненного цикла подписок
 *
 * - За 3 дня до истечения: уведомление пользователю в боте
 * - После истечения: автодеактивация (revokedAt) Entitlement → тариф → FREE
 *
 * Вызывается из server.ts каждые 60 минут (или можно подключить к giveaway lifecycle)
 */

import { prisma } from '@randombeast/database';
import { config } from '../config.js';

// Сколько дней до истечения слать предупреждение
const WARNING_DAYS_BEFORE = 3;

/** Локализованные тексты уведомлений */
const EXPIRY_WARNING: Record<string, Record<string, string>> = {
  ru: {
    title: '⚠️ <b>Подписка истекает через 3 дня</b>',
    body: 'Ваша подписка <b>{tier}</b> истекает <b>{date}</b>.\n\nПродлите её, чтобы сохранить все возможности.',
    button: '🔄 Продлить подписку',
  },
  en: {
    title: '⚠️ <b>Subscription expires in 3 days</b>',
    body: 'Your <b>{tier}</b> subscription expires on <b>{date}</b>.\n\nRenew to keep all features.',
    button: '🔄 Renew subscription',
  },
  kk: {
    title: '⚠️ <b>Жазылым 3 күннен кейін аяқталады</b>',
    body: '<b>{tier}</b> жазылымыңыз <b>{date}</b> аяқталады.\n\nБарлық мүмкіндіктерді сақтау үшін жаңартыңыз.',
    button: '🔄 Жазылымды жаңарту',
  },
};

const EXPIRED_NOTICE: Record<string, string> = {
  ru: '📭 <b>Подписка истекла</b>\n\nВаша подписка закончилась. Бесплатные возможности сохранены.\n\nОформите подписку снова, чтобы получить полный доступ.',
  en: '📭 <b>Subscription expired</b>\n\nYour subscription has ended. Free features remain.\n\nSubscribe again for full access.',
  kk: '📭 <b>Жазылым аяқталды</b>\n\nЖазылымыңыз аяқталды. Тегін мүмкіндіктер сақталады.\n\nТолық қол жетімділік үшін қайта жазылыңыз.',
};

const TIER_NAMES: Record<string, Record<string, string>> = {
  'tier.plus': { ru: 'PLUS', en: 'PLUS', kk: 'PLUS' },
  'tier.pro': { ru: 'PRO', en: 'PRO', kk: 'PRO' },
  'tier.business': { ru: 'BUSINESS', en: 'BUSINESS', kk: 'BUSINESS' },
  'catalog.access': { ru: 'Каталог', en: 'Catalog', kk: 'Каталог' },
};

/** Отправить сообщение пользователю через Telegram Bot API */
async function sendTelegramMessage(
  telegramUserId: bigint,
  text: string,
  inlineButton?: { text: string; url: string }
): Promise<void> {
  if (!config.botToken) return;

  const body: Record<string, unknown> = {
    chat_id: Number(telegramUserId),
    text,
    parse_mode: 'HTML',
  };

  if (inlineButton) {
    body.reply_markup = {
      inline_keyboard: [[{ text: inlineButton.text, url: inlineButton.url }]],
    };
  }

  await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Обработка истекающих подписок
 * Запускать каждые 60 минут
 */
export async function processSubscriptionLifecycle(): Promise<void> {
  const now = new Date();

  // ── 1. Уведомление за WARNING_DAYS_BEFORE дней ─────────────────────────────
  const warningThreshold = new Date(now.getTime() + WARNING_DAYS_BEFORE * 24 * 60 * 60 * 1000);
  const warningMin = new Date(now.getTime() + (WARNING_DAYS_BEFORE - 0.05) * 24 * 60 * 60 * 1000);

  const expiringSoon = await prisma.entitlement.findMany({
    where: {
      revokedAt: null,
      cancelledAt: null,
      warningSentAt: null, // ещё не отправляли предупреждение
      expiresAt: {
        gt: warningMin,
        lte: warningThreshold,
      },
    },
    include: {
      user: { select: { telegramUserId: true, language: true } },
    },
  });

  for (const entitlement of expiringSoon) {
    try {
      const lang = ((entitlement.user.language || 'ru').toLowerCase()) as 'ru' | 'en' | 'kk';
      const texts = EXPIRY_WARNING[lang] || EXPIRY_WARNING['ru'];
      const tierName = TIER_NAMES[entitlement.code]?.[lang] || entitlement.code;

      const expiryDate = entitlement.expiresAt!.toLocaleDateString(
        lang === 'ru' ? 'ru-RU' : lang === 'kk' ? 'kk-KZ' : 'en-US',
        { day: 'numeric', month: 'long' }
      );

      const text = `${texts.title}\n\n${texts.body
        .replace('{tier}', tierName)
        .replace('{date}', expiryDate)}`;

      const subscriptionUrl = `${config.webappUrl}/creator/subscription`;

      await sendTelegramMessage(
        entitlement.user.telegramUserId,
        text,
        { text: texts.button, url: subscriptionUrl }
      );

      // Помечаем что уведомление отправлено
      await prisma.entitlement.update({
        where: { id: entitlement.id },
        data: { warningSentAt: now },
      });

      console.log(`[SubscriptionScheduler] Warning sent for entitlement ${entitlement.id}`);
    } catch (error) {
      console.error(`[SubscriptionScheduler] Failed to send warning for ${entitlement.id}:`, error);
    }
  }

  // ── 2. Деактивация истёкших entitlements ────────────────────────────────────
  const expired = await prisma.entitlement.findMany({
    where: {
      revokedAt: null,
      expiresAt: { lte: now },
    },
    include: {
      user: { select: { telegramUserId: true, language: true } },
    },
  });

  for (const entitlement of expired) {
    try {
      // Помечаем как отозванный
      await prisma.entitlement.update({
        where: { id: entitlement.id },
        data: { revokedAt: now },
      });

      // Уведомляем пользователя
      const lang = ((entitlement.user.language || 'ru').toLowerCase()) as 'ru' | 'en' | 'kk';
      const text = EXPIRED_NOTICE[lang] || EXPIRED_NOTICE['ru'];

      const subscriptionUrl = `${config.webappUrl}/creator/subscription`;

      await sendTelegramMessage(
        entitlement.user.telegramUserId,
        text,
        {
          text: lang === 'ru' ? '⭐ Оформить подписку' : lang === 'en' ? '⭐ Subscribe' : '⭐ Жазылу',
          url: subscriptionUrl,
        }
      );

      console.log(`[SubscriptionScheduler] Entitlement ${entitlement.id} deactivated (expired)`);
    } catch (error) {
      console.error(`[SubscriptionScheduler] Failed to deactivate ${entitlement.id}:`, error);
    }
  }

  if (expiringSoon.length > 0 || expired.length > 0) {
    console.log(`[SubscriptionScheduler] Processed: ${expiringSoon.length} warnings, ${expired.length} expirations`);
  }
}
