import type { Context } from 'grammy';
import type { Chat, ChatMember } from 'grammy/types';
import { InlineKeyboard } from 'grammy';
import { createLogger } from '../lib/logger.js';

const log = createLogger('handlers:channels');
import { config } from '../config.js';
import { apiService } from '../services/api.js';
import { createMainMenuKeyboard } from '../keyboards/mainMenu.js';
import { t, getUserLocale, Locale } from '../i18n/index.js';

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
export function createChannelManagementKeyboard(locale: Locale = 'ru'): InlineKeyboard {
  const addChannel = t(locale, 'channels.addChannelBtn');
  const addGroup = t(locale, 'channels.addGroupBtn');
  const back = t(locale, 'menu.back');
  const toMenu = t(locale, 'menu.toMenu');
  
  return new InlineKeyboard()
    .text(addChannel, 'add_channel')
    .text(addGroup, 'add_group')
    .row()
    .text(back, 'back_to_menu')
    .text(toMenu, 'go_to_menu');
}

/**
 * Message for channels section
 */
export function getChannelsMessage(locale: Locale = 'ru'): string {
  if (locale === 'en') {
    return `📣 <b>My Channels and Groups</b>

Here you can manage channels and groups where the bot will publish giveaways.

<b>How to add a channel/group:</b>
1. Make the bot an admin of the channel/group
2. Click the button below and send:
   • @username of the channel/group
   • or forward a message from the channel/group
   • or a t.me/... link

<b>Requirements:</b>
• Bot must be an administrator
• You must be an admin of the channel/group`;
  }
  
  if (locale === 'kk') {
    return `📣 <b>Менің арналарым мен топтарым</b>

Мұнда бот ұтыс ойындарын жариялайтын арналар мен топтарды басқара аласыз.

<b>Арна/топ қосу жолы:</b>
1. Ботты арна/топтың админі етіңіз
2. Төмендегі түймені басып, жіберіңіз:
   • Арна/топтың @username
   • немесе арна/топтан хабар қайта жіберіңіз
   • немесе t.me/... сілтемесі

<b>Талаптар:</b>
• Бот әкімші болуы керек
• Сіз арна/топтың админі болуыңыз керек`;
  }
  
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
export function getWaitingForChannelMessage(type: 'CHANNEL' | 'GROUP', locale: Locale = 'ru'): string {
  const entityName = type === 'CHANNEL' ? t(locale, 'channels.entityNameChannel') : t(locale, 'channels.entityNameGroup');
  
  if (locale === 'en') {
    return `📝 <b>Adding ${entityName}</b>

Send one of:
• @username of the ${entityName}
• A t.me/... link
• Forward any message from the ${entityName}

<i>Send /cancel to abort</i>`;
  }
  
  if (locale === 'kk') {
    return `📝 <b>${entityName} қосу</b>

Мыналардың бірін жіберіңіз:
• ${entityName}ның @username
• t.me/... сілтемесі
• ${entityName}дан кез келген хабарды қайта жіберіңіз

<i>Бас тарту үшін /cancel жіберіңіз</i>`;
  }
  
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
  
  const locale = getUserLocale(userId);

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
    const msg = t(locale, 'channels.recognizeError');
    await ctx.reply(msg, { parse_mode: 'HTML' });
    return;
  }

  // Clear the state
  clearUserAddingChannel(userId);

  try {
    // Get chat info
    const checkingMsg = t(locale, 'channels.checking');
    await ctx.reply(checkingMsg);

    let chat: Chat.ChannelChat | Chat.SupergroupChat | Chat.GroupChat;
    try {
      const chatInfo = await ctx.api.getChat(chatIdentifier);
      if (chatInfo.type !== 'channel' && chatInfo.type !== 'supergroup' && chatInfo.type !== 'group') {
        const msg = t(locale, 'channels.notChannelOrGroup');
        await ctx.reply(msg);
        return;
      }
      chat = chatInfo as Chat.ChannelChat | Chat.SupergroupChat | Chat.GroupChat;
    } catch {
      const msg = locale === 'ru' 
        ? '❌ Не удалось получить информацию о канале/группе.\n\nВозможные причины:\n• Неверный username\n• Канал/группа приватный и бот не добавлен\n• Канал/группа не существует'
        : locale === 'en'
        ? '❌ Could not get channel/group info.\n\nPossible reasons:\n• Invalid username\n• Channel/group is private and bot not added\n• Channel/group does not exist'
        : '❌ Арна/топ туралы ақпарат алу мүмкін болмады.\n\nМүмкін себептер:\n• Дұрыс емес username\n• Арна/топ жеке және бот қосылмаған\n• Арна/топ жоқ';
      await ctx.reply(msg, { parse_mode: 'HTML' });
      return;
    }

    const actualType = getChatType(chat);

    // Check bot membership
    let botMember: ChatMember;
    try {
      const botInfo = await ctx.api.getMe();
      botMember = await ctx.api.getChatMember(chat.id, botInfo.id);
    } catch {
      const msg = locale === 'ru' 
        ? '❌ Бот не является участником этого канала/группы.\n\nДобавьте бота как администратора и попробуйте снова.'
        : locale === 'en'
        ? '❌ Bot is not a member of this channel/group.\n\nAdd the bot as an admin and try again.'
        : '❌ Бот осы арна/топтың мүшесі емес.\n\nБотты админ ретінде қосып, қайта көріңіз.';
      await ctx.reply(msg, { parse_mode: 'HTML' });
      return;
    }

    const botIsAdmin = isAdmin(botMember);
    if (!botIsAdmin) {
      const msg = t(locale, 'channels.notAdminInstruction');
      await ctx.reply(msg, { parse_mode: 'HTML' });
      return;
    }

    // Check user membership
    let userMember: ChatMember;
    try {
      userMember = await ctx.api.getChatMember(chat.id, userId);
    } catch {
      const msg = locale === 'ru'
        ? '❌ Не удалось проверить ваши права в канале/группе.\n\nУбедитесь, что вы являетесь администратором.'
        : locale === 'en'
        ? '❌ Could not verify your permissions in channel/group.\n\nMake sure you are an admin.'
        : '❌ Арна/топтағы құқықтарыңызды тексеру мүмкін болмады.\n\nСіз админ екеніңізге көз жеткізіңіз.';
      await ctx.reply(msg, { parse_mode: 'HTML' });
      return;
    }

    const userIsAdmin = isAdmin(userMember);
    if (!userIsAdmin) {
      const msg = locale === 'ru'
        ? '❌ Вы не являетесь администратором этого канала/группы.\n\nТолько администраторы могут добавлять каналы/группы.'
        : locale === 'en'
        ? '❌ You are not an admin of this channel/group.\n\nOnly admins can add channels/groups.'
        : '❌ Сіз осы арна/топтың админі емессіз.\n\nТек админдер арна/топтарды қоса алады.';
      await ctx.reply(msg, { parse_mode: 'HTML' });
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
      const errorPrefix = t(locale, 'channels.saveError');
      await ctx.reply(`${errorPrefix} ${result.error}`, { parse_mode: 'HTML' });
      return;
    }

    // Success message
    const typeLabel = actualType === 'CHANNEL' ? t(locale, 'channels.typeChannel') : t(locale, 'channels.typeGroup');
    const username = 'username' in chat && chat.username ? `@${chat.username}` : '';
    const subscribersLabel = t(locale, 'channels.subscribersLabel');
    const memberInfo = memberCount ? `\n👥 ${subscribersLabel}: ${memberCount.toLocaleString(locale === 'kk' ? 'kk-KZ' : locale === 'en' ? 'en-US' : 'ru-RU')}` : '';
    
    const addedMsg = t(locale, 'channels.addedVerb');
    const useMsg = t(locale, 'channels.useInGiveaways', { type: typeLabel.toLowerCase() });
    const openApp = t(locale, 'channels.openAppBtn');
    const addMore = t(locale, 'channels.addMoreBtn');

    await ctx.reply(
      `✅ <b>${typeLabel} ${addedMsg}!</b>\n\n` +
        `📝 ${chat.title} ${username}${memberInfo}\n\n` +
        useMsg,
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard()
          .webApp(openApp, config.webappUrl)
          .row()
          .text(addMore, actualType === 'CHANNEL' ? 'add_channel' : 'add_group'),
      }
    );
  } catch (error) {
    log.error({ error }, 'Channel addition error');
    const msg = locale === 'ru' 
      ? '❌ Произошла ошибка при добавлении канала/группы.\n\nПопробуйте позже.'
      : locale === 'en'
      ? '❌ An error occurred while adding channel/group.\n\nTry again later.'
      : '❌ Арна/топ қосу кезінде қате пайда болды.\n\nКейінірек көріңіз.';
    await ctx.reply(msg, { parse_mode: 'HTML' });
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
    
    const locale = getUserLocale(userId);

    setUserAddingChannel(userId, 'CHANNEL');
    await ctx.answerCallbackQuery();
    await ctx.reply(getWaitingForChannelMessage('CHANNEL', locale), {
      parse_mode: 'HTML',
    });
  });

  // Handle "Add group" button
  bot.callbackQuery('add_group', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    
    const locale = getUserLocale(userId);

    setUserAddingChannel(userId, 'GROUP');
    await ctx.answerCallbackQuery();
    await ctx.reply(getWaitingForChannelMessage('GROUP', locale), {
      parse_mode: 'HTML',
    });
  });

  // Handle "Back to menu" button
  bot.callbackQuery('back_to_menu', async (ctx) => {
    const userId = ctx.from?.id;
    const locale = userId ? getUserLocale(userId) : 'ru';
    
    await ctx.answerCallbackQuery();
    const menuMsg = t(locale, 'channels.mainMenuBtn');
    await ctx.reply(menuMsg, {
      reply_markup: createMainMenuKeyboard(locale),
    });
  });

  // Handle "Go to menu" button
  bot.callbackQuery('go_to_menu', async (ctx) => {
    const userId = ctx.from?.id;
    const locale = userId ? getUserLocale(userId) : 'ru';
    
    await ctx.answerCallbackQuery();
    const menuMsg = t(locale, 'channels.mainMenuBtn');
    await ctx.reply(menuMsg, {
      reply_markup: createMainMenuKeyboard(locale),
    });
  });

  // Handle /cancel command during channel addition
  // Note: This is handled by the main /cancel handler in bot.ts
}
