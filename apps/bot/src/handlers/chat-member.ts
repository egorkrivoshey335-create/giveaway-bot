/**
 * RandomBeast Bot — Chat Member Events Handler
 *
 * Обработка событий изменения прав в каналах/группах
 * - my_chat_member: когда меняются права бота
 * - chat_member: когда участник добавлен/удален из канала
 */

import type { Context } from 'grammy';
import { config } from '../config.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('chat-member-events');

/**
 * Обработка события my_chat_member
 * Вызывается когда права бота изменяются в канале/группе
 */
export async function handleMyChatMember(ctx: Context) {
  try {
    const update = ctx.update.my_chat_member;
    if (!update) return;

    const chat = update.chat;
    const newStatus = update.new_chat_member.status;
    const oldStatus = update.old_chat_member.status;

    log.info({
      chatId: chat.id,
      chatType: chat.type,
      oldStatus,
      newStatus,
    }, 'Bot status changed');

    // Бот стал админом или потерял права
    const wasAdmin = oldStatus === 'administrator' || oldStatus === 'creator';
    const isAdmin = newStatus === 'administrator' || newStatus === 'creator';
    const wasKicked = newStatus === 'kicked' || newStatus === 'left';

    // Проверка прав на постинг (только для каналов)
    let canPostMessages = false;
    if (isAdmin && chat.type === 'channel' && 'can_post_messages' in update.new_chat_member) {
      canPostMessages = update.new_chat_member.can_post_messages || false;
    }

    // Обновляем через API
    await fetch(`${config.apiUrl}/internal/channels/telegram/${chat.id}/rights`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': config.internalApiToken,
      },
      body: JSON.stringify({
        botIsAdmin: isAdmin,
        canPostMessages,
        wasKicked,
      }),
    });

    log.info({
      chatId: chat.id,
      isAdmin,
      canPostMessages,
      wasKicked,
    }, 'Bot rights updated in database');

  } catch (error) {
    log.error({ error }, 'Failed to handle my_chat_member event');
  }
}

/**
 * Обработка события chat_member
 * Вызывается когда участник добавлен/удален из канала (если бот админ)
 */
export async function handleChatMember(ctx: Context) {
  try {
    const update = ctx.update.chat_member;
    if (!update) return;

    const chat = update.chat;
    const user = update.new_chat_member.user;
    const newStatus = update.new_chat_member.status;
    const oldStatus = update.old_chat_member.status;

    // Интересуют только изменения: вступил/вышел
    const joined = (oldStatus === 'left' || oldStatus === 'kicked') && 
                  (newStatus === 'member' || newStatus === 'administrator' || newStatus === 'creator');
    const left = (oldStatus === 'member' || oldStatus === 'administrator' || oldStatus === 'creator') &&
                 (newStatus === 'left' || newStatus === 'kicked');

    if (!joined && !left) return;

    log.info({
      chatId: chat.id,
      userId: user.id,
      action: joined ? 'joined' : 'left',
    }, 'Member status changed');

    // Можно использовать для трекинга активности подписчиков
    // Например, обновить subscriberCount или создать job для проверки

  } catch (error) {
    log.error({ error }, 'Failed to handle chat_member event');
  }
}
