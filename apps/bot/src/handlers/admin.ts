/**
 * RandomBeast Bot — Admin Commands Handler
 *
 * Админские команды для управления платформой
 */

import type { Context } from 'grammy';
import { config } from '../config.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('admin-commands');

// Список админов из ENV
const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || '')
  .split(',')
  .map(id => parseInt(id.trim(), 10))
  .filter(id => !isNaN(id));

/**
 * Check if a Telegram user ID is an admin
 */
export function isAdminUser(userId: number): boolean {
  return ADMIN_USER_IDS.includes(userId);
}

/**
 * Middleware для проверки админских прав
 */
export function isAdmin(ctx: Context): boolean {
  const userId = ctx.from?.id;
  return userId ? isAdminUser(userId) : false;
}

/**
 * /admin_ban - Заблокировать пользователя
 */
export async function handleAdminBan(ctx: Context) {
  if (!isAdmin(ctx)) {
    await ctx.reply('❌ У вас нет прав для выполнения этой команды');
    return;
  }

  const args = ctx.message?.text?.split(' ').slice(1);
  if (!args || args.length === 0) {
    await ctx.reply('Использование: /admin_ban <user_id>');
    return;
  }

  const targetUserId = parseInt(args[0], 10);
  if (isNaN(targetUserId)) {
    await ctx.reply('❌ Некорректный ID пользователя');
    return;
  }

  try {
    const response = await fetch(`${config.apiUrl}/internal/users/${targetUserId}/ban`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': config.internalApiToken,
      },
      body: JSON.stringify({ banned: true, adminId: ctx.from?.id }),
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    await ctx.reply(`✅ Пользователь ${targetUserId} заблокирован`);
    log.info({ targetUserId, adminId: ctx.from?.id }, 'User banned by admin');
  } catch (error) {
    log.error({ error, targetUserId }, 'Failed to ban user');
    await ctx.reply('❌ Ошибка при блокировке пользователя');
  }
}

/**
 * /admin_unban - Разблокировать пользователя
 */
export async function handleAdminUnban(ctx: Context) {
  if (!isAdmin(ctx)) {
    await ctx.reply('❌ У вас нет прав для выполнения этой команды');
    return;
  }

  const args = ctx.message?.text?.split(' ').slice(1);
  if (!args || args.length === 0) {
    await ctx.reply('Использование: /admin_unban <user_id>');
    return;
  }

  const targetUserId = parseInt(args[0], 10);
  if (isNaN(targetUserId)) {
    await ctx.reply('❌ Некорректный ID пользователя');
    return;
  }

  try {
    const response = await fetch(`${config.apiUrl}/internal/users/${targetUserId}/ban`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': config.internalApiToken,
      },
      body: JSON.stringify({ banned: false }),
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    await ctx.reply(`✅ Пользователь ${targetUserId} разблокирован`);
    log.info({ targetUserId, adminId: ctx.from?.id }, 'User unbanned by admin');
  } catch (error) {
    log.error({ error, targetUserId }, 'Failed to unban user');
    await ctx.reply('❌ Ошибка при разблокировке пользователя');
  }
}

/**
 * /admin_stats - Общая статистика платформы
 */
export async function handleAdminStats(ctx: Context) {
  if (!isAdmin(ctx)) {
    await ctx.reply('❌ У вас нет прав для выполнения этой команды');
    return;
  }

  try {
    const response = await fetch(`${config.apiUrl}/internal/admin/stats`, {
      headers: {
        'X-Internal-Token': config.internalApiToken,
      },
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const stats = await response.json() as {
      totalUsers?: number;
      totalGiveaways?: number;
      totalChannels?: number;
      totalParticipations?: number;
      newUsersToday?: number;
      newGiveawaysToday?: number;
    };

    const message = `📊 <b>Статистика платформы</b>

👥 Пользователей: ${stats.totalUsers || 0}
🎁 Розыгрышей: ${stats.totalGiveaways || 0}
📣 Каналов: ${stats.totalChannels || 0}
🎯 Участий: ${stats.totalParticipations || 0}

За сегодня:
👤 Новых пользователей: ${stats.newUsersToday || 0}
🎁 Новых розыгрышей: ${stats.newGiveawaysToday || 0}`;

    await ctx.reply(message, { parse_mode: 'HTML' });
    log.info({ adminId: ctx.from?.id }, 'Admin viewed stats');
  } catch (error) {
    log.error({ error }, 'Failed to fetch admin stats');
    await ctx.reply('❌ Ошибка при получении статистики');
  }
}

/**
 * /admin_giveaway - Информация о розыгрыше
 */
export async function handleAdminGiveaway(ctx: Context) {
  if (!isAdmin(ctx)) {
    await ctx.reply('❌ У вас нет прав для выполнения этой команды');
    return;
  }

  const args = ctx.message?.text?.split(' ').slice(1);
  if (!args || args.length === 0) {
    await ctx.reply('Использование: /admin_giveaway <giveaway_id>');
    return;
  }

  const giveawayId = args[0];

  try {
    const response = await fetch(`${config.apiUrl}/internal/admin/giveaways/${giveawayId}`, {
      headers: {
        'X-Internal-Token': config.internalApiToken,
      },
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const giveaway = await response.json() as {
      id: string;
      title: string;
      status: string;
      creatorId: string;
      participantCount?: number;
      endsAt: string;
    };

    const message = `🎁 <b>${giveaway.title}</b>

ID: ${giveaway.id}
Статус: ${giveaway.status}
Создатель: ${giveaway.creatorId}
Участников: ${giveaway.participantCount || 0}
Завершается: ${new Date(giveaway.endsAt).toLocaleString('ru-RU')}`;

    await ctx.reply(message, { parse_mode: 'HTML' });
    log.info({ adminId: ctx.from?.id, giveawayId }, 'Admin viewed giveaway');
  } catch (error) {
    log.error({ error, giveawayId }, 'Failed to fetch giveaway info');
    await ctx.reply('❌ Розыгрыш не найден');
  }
}

/**
 * /admin_approve - Одобрить розыгрыш в каталоге
 */
export async function handleAdminApprove(ctx: Context) {
  if (!isAdmin(ctx)) {
    await ctx.reply('❌ У вас нет прав для выполнения этой команды');
    return;
  }

  const args = ctx.message?.text?.split(' ').slice(1);
  if (!args || args.length === 0) {
    await ctx.reply('Использование: /admin_approve <giveaway_id>');
    return;
  }

  const giveawayId = args[0];

  try {
    const response = await fetch(`${config.apiUrl}/internal/catalog/${giveawayId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': config.internalApiToken,
      },
      body: JSON.stringify({ adminId: ctx.from?.id }),
    });

    if (!response.ok) {
      const err = await response.json() as { error?: string };
      throw new Error(err.error || `API returned ${response.status}`);
    }

    await ctx.reply(`✅ Розыгрыш ${giveawayId} одобрен для каталога`);
    log.info({ giveawayId, adminId: ctx.from?.id }, 'Giveaway approved for catalog');
  } catch (error) {
    log.error({ error, giveawayId }, 'Failed to approve giveaway');
    await ctx.reply(`❌ Ошибка при одобрении: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`);
  }
}

/**
 * /admin_reject - Отклонить розыгрыш из каталога
 */
export async function handleAdminReject(ctx: Context) {
  if (!isAdmin(ctx)) {
    await ctx.reply('❌ У вас нет прав для выполнения этой команды');
    return;
  }

  const args = ctx.message?.text?.split(' ').slice(1);
  if (!args || args.length < 1) {
    await ctx.reply('Использование: /admin_reject <giveaway_id> [причина]');
    return;
  }

  const giveawayId = args[0];
  const reason = args.slice(1).join(' ') || 'Нарушение правил платформы';

  try {
    const response = await fetch(`${config.apiUrl}/internal/catalog/${giveawayId}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': config.internalApiToken,
      },
      body: JSON.stringify({ adminId: ctx.from?.id, reason }),
    });

    if (!response.ok) {
      const err = await response.json() as { error?: string };
      throw new Error(err.error || `API returned ${response.status}`);
    }

    await ctx.reply(`✅ Розыгрыш ${giveawayId} отклонён. Причина: ${reason}`);
    log.info({ giveawayId, reason, adminId: ctx.from?.id }, 'Giveaway rejected from catalog');
  } catch (error) {
    log.error({ error, giveawayId }, 'Failed to reject giveaway');
    await ctx.reply(`❌ Ошибка при отклонении: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`);
  }
}

/**
 * /admin_broadcast - Рассылка всем пользователям
 */
export async function handleAdminBroadcast(ctx: Context) {
  if (!isAdmin(ctx)) {
    await ctx.reply('❌ У вас нет прав для выполнения этой команды');
    return;
  }

  const args = ctx.message?.text?.split(' ').slice(1);
  if (!args || args.length === 0) {
    await ctx.reply('Использование: /admin_broadcast <сообщение>');
    return;
  }

  const message = args.join(' ');

  await ctx.reply(`⚠️ Рассылка пока не реализована.\n\nСообщение: "${message}"`);
  log.warn({ adminId: ctx.from?.id }, 'Broadcast attempted but not implemented');
}
