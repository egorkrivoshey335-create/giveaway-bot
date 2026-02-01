import type { Context } from 'grammy';
import type { Chat, ChatMember } from 'grammy/types';
import { InlineKeyboard } from 'grammy';
import { config } from '../config.js';
import { apiService } from '../services/api.js';
import { createMainMenuKeyboard } from '../keyboards/mainMenu.js';

// Simple in-memory state for channel addition flow
// In production, use conversations plugin or persistent sessions
interface ChannelAddState {
  type: 'CHANNEL' | 'GROUP';
  expiresAt: number;
}

const userChannelAddState = new Map<number, ChannelAddState>();

const STATE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Set user state for adding a channel/group
 */
export function setUserAddingChannel(userId: number, type: 'CHANNEL' | 'GROUP') {
  userChannelAddState.set(userId, {
    type,
    expiresAt: Date.now() + STATE_TIMEOUT_MS,
  });
}

/**
 * Get and clear user state
 */
export function getUserAddingChannel(userId: number): ChannelAddState | null {
  const state = userChannelAddState.get(userId);
  if (!state || state.expiresAt < Date.now()) {
    userChannelAddState.delete(userId);
    return null;
  }
  return state;
}

/**
 * Clear user state
 */
export function clearUserAddingChannel(userId: number) {
  userChannelAddState.delete(userId);
}

/**
 * Create inline keyboard for channel management
 */
export function createChannelManagementKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('➕ Добавить канал', 'add_channel')
    .text('➕ Добавить группу', 'add_group')
    .row()
    .text('⬅️ Назад', 'back_to_menu')
    .text('🏠 В меню', 'go_to_menu');
}

/**
 * Message for channels section
 */
export function getChannelsMessage(): string {
  return `📣 <b>Мои каналы и группы</b>

Здесь вы можете управлять каналами и группами, в которых бот будет публиковать розыгрыши.

<b>Как добавить канал/группу:</b>
1. Сделайте бота администратором канала/группы
2. Нажмите кнопку ниже и отправьте:
   • @username канала/группы
   • или перешлите сообщение из канала/группы
   • или ссылку t.me/...

<b>Требования:</b>
• Бот должен быть администратором
• Вы должны быть администратором канала/группы`;
}

/**
 * Message when waiting for channel input
 */
export function getWaitingForChannelMessage(type: 'CHANNEL' | 'GROUP'): string {
  const entityName = type === 'CHANNEL' ? 'канала' : 'группы';
  return `📝 <b>Добавление ${entityName}</b>

Отправьте одно из:
• @username ${entityName}
• Ссылку t.me/...
• Перешлите любое сообщение из ${entityName}

<i>Отправьте /cancel для отмены</i>`;
}

/**
 * Parse channel identifier from user input
 */
export function parseChannelInput(text: string): string | null {
  // Clean up the text
  const cleaned = text.trim();

  // @username format
  if (cleaned.startsWith('@')) {
    return cleaned;
  }

  // t.me link format
  const tmeMatch = cleaned.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]+)/);
  if (tmeMatch) {
    return `@${tmeMatch[1]}`;
  }

  // Just username without @
  if (/^[a-zA-Z][a-zA-Z0-9_]{3,30}$/.test(cleaned)) {
    return `@${cleaned}`;
  }

  return null;
}

/**
 * Check if user is admin in a chat
 */
function isAdmin(member: ChatMember): boolean {
  return member.status === 'creator' || member.status === 'administrator';
}

/**
 * Check if bot has required permissions for posting
 */
function hasBotPostPermissions(member: ChatMember): boolean {
  if (member.status !== 'administrator') return false;

  // For channels, check can_post_messages
  // For groups, being admin is usually enough
  return true;
}

/**
 * Determine chat type
 */
function getChatType(chat: Chat.ChannelChat | Chat.SupergroupChat | Chat.GroupChat): 'CHANNEL' | 'GROUP' {
  return chat.type === 'channel' ? 'CHANNEL' : 'GROUP';
}

/**
 * Handle channel/group addition
 */
export async function handleChannelAddition(ctx: Context, targetType: 'CHANNEL' | 'GROUP') {
  const userId = ctx.from?.id;
  if (!userId) return;

  // Get chat identifier
  let chatIdentifier: string | number | null = null;

  // Check if it's a forwarded message
  const forwardOrigin = ctx.message?.forward_origin;
  if (forwardOrigin && forwardOrigin.type === 'channel') {
    chatIdentifier = forwardOrigin.chat.id;
  } else if (ctx.message?.text) {
    chatIdentifier = parseChannelInput(ctx.message.text);
  }

  if (!chatIdentifier) {
    await ctx.reply(
      '❌ Не удалось распознать канал/группу.\n\nОтправьте @username, ссылку t.me/... или перешлите сообщение.',
      { parse_mode: 'HTML' }
    );
    return;
  }

  // Clear the state
  clearUserAddingChannel(userId);

  try {
    // Get chat info
    await ctx.reply('⏳ Проверяю канал/группу...');

    let chat: Chat.ChannelChat | Chat.SupergroupChat | Chat.GroupChat;
    try {
      const chatInfo = await ctx.api.getChat(chatIdentifier);
      if (chatInfo.type !== 'channel' && chatInfo.type !== 'supergroup' && chatInfo.type !== 'group') {
        await ctx.reply('❌ Это не канал и не группа. Пожалуйста, отправьте канал или группу.');
        return;
      }
      chat = chatInfo as Chat.ChannelChat | Chat.SupergroupChat | Chat.GroupChat;
    } catch {
      await ctx.reply(
        '❌ Не удалось получить информацию о канале/группе.\n\n' +
          'Возможные причины:\n' +
          '• Неверный username\n' +
          '• Канал/группа приватный и бот не добавлен\n' +
          '• Канал/группа не существует',
        { parse_mode: 'HTML' }
      );
      return;
    }

    const actualType = getChatType(chat);

    // Check bot membership
    let botMember: ChatMember;
    try {
      const botInfo = await ctx.api.getMe();
      botMember = await ctx.api.getChatMember(chat.id, botInfo.id);
    } catch {
      await ctx.reply(
        '❌ Бот не является участником этого канала/группы.\n\n' +
          'Добавьте бота как администратора и попробуйте снова.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    const botIsAdmin = isAdmin(botMember);
    if (!botIsAdmin) {
      await ctx.reply(
        '❌ Бот не является администратором.\n\n' +
          '<b>Как исправить:</b>\n' +
          '1. Откройте настройки канала/группы\n' +
          '2. Перейдите в "Администраторы"\n' +
          '3. Добавьте бота как администратора\n' +
          '4. Попробуйте снова',
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Check user membership
    let userMember: ChatMember;
    try {
      userMember = await ctx.api.getChatMember(chat.id, userId);
    } catch {
      await ctx.reply(
        '❌ Не удалось проверить ваши права в канале/группе.\n\n' +
          'Убедитесь, что вы являетесь администратором.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    const userIsAdmin = isAdmin(userMember);
    if (!userIsAdmin) {
      await ctx.reply(
        '❌ Вы не являетесь администратором этого канала/группы.\n\n' +
          'Только администраторы могут добавлять каналы/группы.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Get member count if available
    let memberCount: number | undefined;
    try {
      memberCount = await ctx.api.getChatMemberCount(chat.id);
    } catch {
      // Ignore - member count is optional
    }

    // Save to database via API
    const result = await apiService.upsertChannel({
      telegramUserId: userId,
      telegramChatId: chat.id,
      username: 'username' in chat ? chat.username || null : null,
      title: chat.title,
      type: actualType,
      botIsAdmin,
      creatorIsAdmin: userIsAdmin,
      permissionsSnapshot: {
        bot: botMember,
        user: userMember,
      },
      memberCount,
    });

    if (!result.ok) {
      await ctx.reply(`❌ Ошибка сохранения: ${result.error}`, { parse_mode: 'HTML' });
      return;
    }

    // Success message
    const typeLabel = actualType === 'CHANNEL' ? 'Канал' : 'Группа';
    const username = 'username' in chat && chat.username ? `@${chat.username}` : '';
    const memberInfo = memberCount ? `\n👥 Подписчиков: ${memberCount.toLocaleString('ru-RU')}` : '';

    await ctx.reply(
      `✅ <b>${typeLabel} добавлен!</b>\n\n` +
        `📝 ${chat.title} ${username}${memberInfo}\n\n` +
        `Теперь вы можете использовать этот ${typeLabel.toLowerCase()} в розыгрышах.`,
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard()
          .webApp('📱 Открыть приложение', config.webappUrl)
          .row()
          .text('➕ Добавить ещё', actualType === 'CHANNEL' ? 'add_channel' : 'add_group'),
      }
    );
  } catch (error) {
    console.error('Channel addition error:', error);
    await ctx.reply(
      '❌ Произошла ошибка при добавлении канала/группы.\n\nПопробуйте позже.',
      { parse_mode: 'HTML' }
    );
  }
}

/**
 * Register channel-related handlers
 */
export function registerChannelHandlers(bot: import('grammy').Bot) {
  // Handle "Add channel" button
  bot.callbackQuery('add_channel', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    setUserAddingChannel(userId, 'CHANNEL');
    await ctx.answerCallbackQuery();
    await ctx.reply(getWaitingForChannelMessage('CHANNEL'), {
      parse_mode: 'HTML',
    });
  });

  // Handle "Add group" button
  bot.callbackQuery('add_group', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    setUserAddingChannel(userId, 'GROUP');
    await ctx.answerCallbackQuery();
    await ctx.reply(getWaitingForChannelMessage('GROUP'), {
      parse_mode: 'HTML',
    });
  });

  // Handle "Back to menu" button
  bot.callbackQuery('back_to_menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply('🏠 Главное меню', {
      reply_markup: createMainMenuKeyboard(),
    });
  });

  // Handle "Go to menu" button
  bot.callbackQuery('go_to_menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply('🏠 Главное меню', {
      reply_markup: createMainMenuKeyboard(),
    });
  });

  // Handle /cancel command during channel addition
  bot.command('cancel', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    if (getUserAddingChannel(userId)) {
      clearUserAddingChannel(userId);
      await ctx.reply('❌ Добавление отменено.', {
        reply_markup: createMainMenuKeyboard(),
      });
    }
  });
}
