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
 * Middleware для проверки админских прав
 */
export function isAdmin(ctx: Context): boolean {
  const userId = ctx.from?.id;
  return userId ? ADMIN_USER_IDS.includes(userId) : false;
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
        'X-Internal-Secret': config.internalApiToken,
      },
      body: JSON.stringify({ banned: true }),
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
        'X-Internal-Secret': config.internalApiToken,
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
        'X-Internal-Secret': config.internalApiToken,
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
        'X-Internal-Secret': config.internalApiToken,
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
