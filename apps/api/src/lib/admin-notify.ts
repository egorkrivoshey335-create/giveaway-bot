/**
 * RandomBeast — Admin Notifications
 *
 * Утилита для отправки проактивных уведомлений администраторам
 * через Telegram Bot API в ADMIN_CHAT_ID.
 *
 * Все функции fire-and-forget: ошибки логируются, но не пробрасываются.
 */

import { config } from '../config.js';

/**
 * Отправить HTML-сообщение в ADMIN_CHAT_ID через Telegram Bot API.
 * Если ADMIN_CHAT_ID или BOT_TOKEN не настроены — тихо игнорирует.
 */
export async function sendAdminNotification(html: string): Promise<void> {
  if (!config.adminChatId || !config.botToken) {
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.adminChatId,
        text: html,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const data = await res.json() as { description?: string };
      console.error('[AdminNotify] Ошибка отправки:', data.description);
    }
  } catch (err) {
    console.error('[AdminNotify] Сетевая ошибка:', err);
  }
}

/**
 * Уведомление о новой регистрации N-го пользователя (каждый значимый рубеж)
 */
export function notifyNewUserMilestone(totalUsers: number, username: string | null): void {
  const MILESTONES = [100, 500, 1000, 2000, 5000, 10000, 25000, 50000, 100000];
  if (!MILESTONES.includes(totalUsers)) return;

  const userStr = username ? `@${username}` : `(без username)`;
  sendAdminNotification(
    `🎉 <b>Рубеж: ${totalUsers.toLocaleString('ru')} пользователей!</b>\n\n` +
    `Последний зарегистрировавшийся: ${userStr}`
  ).catch(() => {});
}

/**
 * Уведомление о новой покупке/подписке
 */
export function notifyNewPurchase(opts: {
  username: string | null;
  productTitle: string;
  amount: number;
  currency: string;
}): void {
  const userStr = opts.username ? `@${opts.username}` : '(без username)';
  sendAdminNotification(
    `💳 <b>Новая покупка!</b>\n\n` +
    `👤 Покупатель: ${userStr}\n` +
    `📦 Продукт: ${opts.productTitle}\n` +
    `💰 Сумма: ${opts.amount} ${opts.currency}`
  ).catch(() => {});
}

/**
 * Уведомление о розыгрыше, достигшем 100 участников (кандидат в каталог)
 */
export function notifyCatalogCandidate(opts: {
  giveawayId: string;
  title: string;
  creatorUsername: string | null;
  participantCount: number;
}): void {
  const creatorStr = opts.creatorUsername ? `@${opts.creatorUsername}` : '(без username)';
  sendAdminNotification(
    `📣 <b>Кандидат в каталог!</b>\n\n` +
    `🎁 Розыгрыш: <b>${escapeHtml(opts.title)}</b>\n` +
    `🆔 ID: <code>${opts.giveawayId}</code>\n` +
    `👤 Создатель: ${creatorStr}\n` +
    `👥 Участников: ${opts.participantCount}\n\n` +
    `Розыгрыш прошёл порог 100 участников и ожидает модерации каталога.`
  ).catch(() => {});
}

/**
 * Уведомление о новой жалобе
 */
export function notifyNewReport(opts: {
  giveawayTitle: string;
  giveawayId: string;
  reason: string;
  reporterUsername: string | null;
  totalReports: number;
}): void {
  const userStr = opts.reporterUsername ? `@${opts.reporterUsername}` : '(аноним)';
  const reasonLabels: Record<string, string> = {
    SPAM: 'Спам/реклама',
    FRAUD: 'Мошенничество',
    INAPPROPRIATE_CONTENT: 'Неприемлемый контент',
    FAKE_GIVEAWAY: 'Не выдали приз',
    OTHER: 'Другое',
  };
  const reasonLabel = reasonLabels[opts.reason] || opts.reason;

  sendAdminNotification(
    `⚠️ <b>Новая жалоба!</b>\n\n` +
    `🎁 Розыгрыш: <b>${escapeHtml(opts.giveawayTitle)}</b>\n` +
    `🆔 ID: <code>${opts.giveawayId}</code>\n` +
    `📋 Причина: ${reasonLabel}\n` +
    `👤 От: ${userStr}\n` +
    `📊 Всего жалоб на этот розыгрыш: ${opts.totalReports}`
  ).catch(() => {});
}

/**
 * Уведомление о том, что розыгрыш автоматически снят с каталога из-за жалоб
 */
export function notifyCatalogRemoved(opts: {
  giveawayTitle: string;
  giveawayId: string;
  reportCount: number;
}): void {
  sendAdminNotification(
    `🚫 <b>Розыгрыш снят с каталога автоматически</b>\n\n` +
    `🎁 Розыгрыш: <b>${escapeHtml(opts.giveawayTitle)}</b>\n` +
    `🆔 ID: <code>${opts.giveawayId}</code>\n` +
    `📊 Жалоб: ${opts.reportCount} (порог > 5)\n\n` +
    `Розыгрыш помечен для ручной модерации.`
  ).catch(() => {});
}

/**
 * Уведомление об одобрении розыгрыша в каталог
 */
export function notifyCatalogApproved(opts: {
  giveawayTitle: string;
  giveawayId: string;
  participantCount: number;
}): void {
  sendAdminNotification(
    `✅ <b>Розыгрыш одобрен в каталог</b>\n\n` +
    `🎁 <b>${escapeHtml(opts.giveawayTitle)}</b>\n` +
    `🆔 ID: <code>${opts.giveawayId}</code>\n` +
    `👥 Участников: ${opts.participantCount}`
  ).catch(() => {});
}

/**
 * Экранирует HTML-спецсимволы для безопасного использования в Telegram HTML-разметке
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
