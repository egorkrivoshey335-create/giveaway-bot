import type { Context } from 'grammy';
import type { Chat, ChatMember } from 'grammy/types';
import { TIER_LIMITS } from '@randombeast/shared';
import { createLogger } from '../lib/logger.js';

const log = createLogger('handlers:channels');
import { config } from '../config.js';
import { apiService } from '../services/api.js';
import { createMainMenuKeyboard } from '../keyboards/mainMenu.js';
import { t, getUserLocale, Locale } from '../i18n/index.js';
import { btn, webAppBtn, inlineKeyboard } from '../lib/customEmoji.js';

// Simple in-memory state for channel addition flow
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
 * Create inline keyboard for channel management (main screen)
 */
export function createChannelManagementKeyboard(locale: Locale = 'ru'): any {
  const addChannel = t(locale, 'channels.addChannelBtn');
  const addGroup = t(locale, 'channels.addGroupBtn');

  const myChannelsLabel = locale === 'en' ? 'My Channels' : locale === 'kk' ? 'Менің арналарым' : 'Мои каналы';
  const myGroupsLabel = locale === 'en' ? 'My Groups' : locale === 'kk' ? 'Менің топтарым' : 'Мои группы';

  return inlineKeyboard(
    [btn(addChannel, 'add_channel', 'add', 'danger'), btn(addGroup, 'add_group', 'add', 'danger')],
    [btn(myChannelsLabel, 'list_channels', 'channels', 'primary'), btn(myGroupsLabel, 'list_groups', 'channels', 'primary')],
  );
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
  const cleaned = text.trim();

  if (cleaned.startsWith('@')) {
    return cleaned;
  }

  const tmeMatch = cleaned.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]+)/);
  if (tmeMatch) {
    return `@${tmeMatch[1]}`;
  }

  if (/^[a-zA-Z][a-zA-Z0-9_]{3,30}$/.test(cleaned)) {
    return `@${cleaned}`;
  }

  return null;
}

function isAdmin(member: ChatMember): boolean {
  return member.status === 'creator' || member.status === 'administrator';
}

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

  let chatIdentifier: string | number | null = null;

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

  clearUserAddingChannel(userId);

  try {
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

    let memberCount: number | undefined;
    try {
      memberCount = await ctx.api.getChatMemberCount(chat.id);
    } catch {
      // optional
    }

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
      if (result.error?.includes('другим пользователем') || result.error?.includes('CHANNEL_OWNED_BY_OTHER')) {
        const ownedMsg = locale === 'en'
          ? '⚠️ This channel/group is already added by another user. Each channel can only be managed by one account.'
          : locale === 'kk'
          ? '⚠️ Бұл арна/топ басқа пайдаланушы қосқан. Әр арна тек бір аккаунтпен басқарылады.'
          : '⚠️ Этот канал/группа уже добавлен(а) другим пользователем. Каждый канал может управляться только одним аккаунтом.';
        await ctx.reply(ownedMsg, {
          parse_mode: 'HTML',
          reply_markup: createChannelManagementKeyboard(locale),
        });
        return;
      }
      const errorPrefix = t(locale, 'channels.saveError');
      await ctx.reply(`${errorPrefix} ${result.error}`, { parse_mode: 'HTML' });
      return;
    }

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
        reply_markup: inlineKeyboard(
          [webAppBtn(openApp, config.webappUrl, 'app', 'danger')],
          [btn(addMore, actualType === 'CHANNEL' ? 'add_channel' : 'add_group', 'add', 'danger')],
        ),
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
 * Build channel info message
 */
function getChannelInfoMessage(channel: { title: string; username?: string | null; botIsAdmin: boolean; creatorIsAdmin: boolean; memberCount?: number | null; type: string }, locale: Locale): string {
  const typeLabel = channel.type === 'CHANNEL'
    ? (locale === 'en' ? 'channel' : locale === 'kk' ? 'арна' : 'канале')
    : (locale === 'en' ? 'group' : locale === 'kk' ? 'топ' : 'группе');
  const titleLabel = locale === 'en' ? 'Info about' : locale === 'kk' ? 'туралы ақпарат' : 'Информация о';
  const botAdminLabel = locale === 'en' ? 'Bot is admin' : locale === 'kk' ? 'Бот админ' : 'Бот админ';
  const postingLabel = locale === 'en' ? 'Bot can post' : locale === 'kk' ? 'Бот жазба жаза алады' : 'Боту выданы права на постинг';
  const userAdminLabel = locale === 'en' ? 'You are admin' : locale === 'kk' ? 'Сіз админсіз' : 'Вы админ канала';
  const subscribersLabel = locale === 'en' ? 'Subscribers' : locale === 'kk' ? 'Жазылушылар' : 'Подписчиков';
  const yes = '✅';
  const no = '❌';

  let msg = `ℹ️ <b>${titleLabel} ${typeLabel} "${channel.title}"</b>`;
  if (channel.username) msg += ` (@${channel.username})`;
  msg += '\n\n';
  msg += `${botAdminLabel}: ${channel.botIsAdmin ? yes : no}\n`;
  msg += `${postingLabel}: ${channel.botIsAdmin ? yes : no}\n`;
  msg += `${userAdminLabel}: ${channel.creatorIsAdmin ? yes : no}`;
  if (channel.memberCount) {
    msg += `\n👥 ${subscribersLabel}: ${channel.memberCount.toLocaleString()}`;
  }
  return msg;
}

/**
 * Build channel info keyboard
 */
function createChannelInfoKeyboard(channelId: string, type: 'CHANNEL' | 'GROUP', locale: Locale): any {
  const refreshLabel = locale === 'en' ? 'Refresh' : locale === 'kk' ? 'Жаңарту' : 'Обновить';
  const deleteLabel = locale === 'en' ? 'Delete' : locale === 'kk' ? 'Жою' : 'Удалить';
  const backLabel = locale === 'en' ? 'Back' : locale === 'kk' ? 'Артқа' : 'Назад';

  return inlineKeyboard(
    [btn(`🔄 ${refreshLabel}`, `refresh_channel:${channelId}`, 'refresh', 'primary'), btn(`🗑 ${deleteLabel}`, `delete_channel:${channelId}`, 'delete', 'danger')],
    [btn(`◀️ ${backLabel}`, type === 'CHANNEL' ? 'list_channels' : 'list_groups', 'back', 'primary')],
  );
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
    const { tier } = await apiService.getUserTier(userId);
    const tierKey = (tier as 'FREE' | 'PLUS' | 'PRO' | 'BUSINESS') || 'FREE';
    const maxChannels = TIER_LIMITS.maxChannels[tierKey];
    const channelsRes = await apiService.getUserChannels(userId);
    const currentCount = channelsRes.ok ? channelsRes.channels.length : 0;

    if (currentCount >= maxChannels) {
      await ctx.answerCallbackQuery();
      const limitMsg = locale === 'en'
        ? `⚠️ Channel limit reached: ${maxChannels} (${tierKey}). Upgrade your subscription.`
        : locale === 'kk'
        ? `⚠️ Арна шегіне жеттіңіз: ${maxChannels} (${tierKey}). Жазылымыңызды жаңартыңыз.`
        : `⚠️ Достигнут лимит каналов: ${maxChannels} (${tierKey}). Повысьте подписку.`;
      await ctx.reply(limitMsg, { reply_markup: createChannelManagementKeyboard(locale) });
      return;
    }

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
    const { tier } = await apiService.getUserTier(userId);
    const tierKey = (tier as 'FREE' | 'PLUS' | 'PRO' | 'BUSINESS') || 'FREE';
    const maxChannels = TIER_LIMITS.maxChannels[tierKey];
    const channelsRes = await apiService.getUserChannels(userId);
    const currentCount = channelsRes.ok ? channelsRes.channels.length : 0;

    if (currentCount >= maxChannels) {
      await ctx.answerCallbackQuery();
      const limitMsg = locale === 'en'
        ? `⚠️ Channel/group limit reached: ${maxChannels} (${tierKey}). Upgrade your subscription.`
        : locale === 'kk'
        ? `⚠️ Арна/топ шегіне жеттіңіз: ${maxChannels} (${tierKey}). Жазылымыңызды жаңартыңыз.`
        : `⚠️ Достигнут лимит каналов/групп: ${maxChannels} (${tierKey}). Повысьте подписку.`;
      await ctx.reply(limitMsg, { reply_markup: createChannelManagementKeyboard(locale) });
      return;
    }

    setUserAddingChannel(userId, 'GROUP');
    await ctx.answerCallbackQuery();
    await ctx.reply(getWaitingForChannelMessage('GROUP', locale), {
      parse_mode: 'HTML',
    });
  });

  // List user's channels
  bot.callbackQuery('list_channels', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const locale = getUserLocale(userId);

    await ctx.answerCallbackQuery();

    const result = await apiService.getUserChannels(userId, 'CHANNEL');
    if (!result.ok || result.channels.length === 0) {
      const emptyMsg = locale === 'en' ? '📭 You have no channels added yet.'
        : locale === 'kk' ? '📭 Сізде әлі арналар жоқ.'
        : '📭 У вас пока нет добавленных каналов.';
      const titleMsg = locale === 'en' ? 'Your Channels' : locale === 'kk' ? 'Сіздің арналарыңыз' : 'Список ваших каналов';
      const backLabel = locale === 'en' ? 'Back' : locale === 'kk' ? 'Артқа' : 'Назад';
      try {
        await ctx.editMessageText(`📣 <b>${titleMsg}</b>\n\n${emptyMsg}`, {
          parse_mode: 'HTML',
          reply_markup: inlineKeyboard(
            [btn(`◀️ ${backLabel}`, 'back_to_channels', 'back', 'primary')],
          ),
        });
      } catch {
        await ctx.reply(`📣 <b>${titleMsg}</b>\n\n${emptyMsg}`, {
          parse_mode: 'HTML',
          reply_markup: inlineKeyboard(
            [btn(`◀️ ${backLabel}`, 'back_to_channels', 'back', 'primary')],
          ),
        });
      }
      return;
    }

    const titleMsg = locale === 'en' ? 'Your Channels' : locale === 'kk' ? 'Сіздің арналарыңыз' : 'Список ваших каналов';
    const selectMsg = locale === 'en' ? 'Select a channel for details:' : locale === 'kk' ? 'Толығырақ үшін арнаны таңдаңыз:' : 'Выберите канал для подробностей:';
    const backLabel = locale === 'en' ? 'Back' : locale === 'kk' ? 'Артқа' : 'Назад';

    const channelButtons = result.channels.map(ch => [
      btn(`📢 ${ch.title}`, `channel_info:${ch.id}`, 'channels', 'primary'),
    ]);
    channelButtons.push([btn(`◀️ ${backLabel}`, 'back_to_channels', 'back', 'primary')]);

    try {
      await ctx.editMessageText(`📣 <b>${titleMsg}</b>\n\n${selectMsg}`, {
        parse_mode: 'HTML',
        reply_markup: inlineKeyboard(...channelButtons),
      });
    } catch {
      await ctx.reply(`📣 <b>${titleMsg}</b>\n\n${selectMsg}`, {
        parse_mode: 'HTML',
        reply_markup: inlineKeyboard(...channelButtons),
      });
    }
  });

  // List user's groups
  bot.callbackQuery('list_groups', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const locale = getUserLocale(userId);

    await ctx.answerCallbackQuery();

    const result = await apiService.getUserChannels(userId, 'GROUP');
    if (!result.ok || result.channels.length === 0) {
      const emptyMsg = locale === 'en' ? '📭 You have no groups added yet.'
        : locale === 'kk' ? '📭 Сізде әлі топтар жоқ.'
        : '📭 У вас пока нет добавленных групп.';
      const titleMsg = locale === 'en' ? 'Your Groups' : locale === 'kk' ? 'Сіздің топтарыңыз' : 'Список ваших групп';
      const backLabel = locale === 'en' ? 'Back' : locale === 'kk' ? 'Артқа' : 'Назад';
      try {
        await ctx.editMessageText(`👥 <b>${titleMsg}</b>\n\n${emptyMsg}`, {
          parse_mode: 'HTML',
          reply_markup: inlineKeyboard(
            [btn(`◀️ ${backLabel}`, 'back_to_channels', 'back', 'primary')],
          ),
        });
      } catch {
        await ctx.reply(`👥 <b>${titleMsg}</b>\n\n${emptyMsg}`, {
          parse_mode: 'HTML',
          reply_markup: inlineKeyboard(
            [btn(`◀️ ${backLabel}`, 'back_to_channels', 'back', 'primary')],
          ),
        });
      }
      return;
    }

    const titleMsg = locale === 'en' ? 'Your Groups' : locale === 'kk' ? 'Сіздің топтарыңыз' : 'Список ваших групп';
    const selectMsg = locale === 'en' ? 'Select a group for details:' : locale === 'kk' ? 'Толығырақ үшін топты таңдаңыз:' : 'Выберите группу для подробностей:';
    const backLabel = locale === 'en' ? 'Back' : locale === 'kk' ? 'Артқа' : 'Назад';

    const groupButtons = result.channels.map(ch => [
      btn(`👥 ${ch.title}`, `channel_info:${ch.id}`, 'channels', 'primary'),
    ]);
    groupButtons.push([btn(`◀️ ${backLabel}`, 'back_to_channels', 'back', 'primary')]);

    try {
      await ctx.editMessageText(`👥 <b>${titleMsg}</b>\n\n${selectMsg}`, {
        parse_mode: 'HTML',
        reply_markup: inlineKeyboard(...groupButtons),
      });
    } catch {
      await ctx.reply(`👥 <b>${titleMsg}</b>\n\n${selectMsg}`, {
        parse_mode: 'HTML',
        reply_markup: inlineKeyboard(...groupButtons),
      });
    }
  });

  // Channel/group info
  bot.callbackQuery(/^channel_info:/, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const locale = getUserLocale(userId);
    const channelId = ctx.callbackQuery.data.replace('channel_info:', '');

    await ctx.answerCallbackQuery();

    // Fetch channels to find this one
    const result = await apiService.getUserChannels(userId);
    const channel = result.channels.find(ch => ch.id === channelId);
    if (!channel) {
      const notFoundMsg = locale === 'en' ? 'Channel not found' : locale === 'kk' ? 'Арна табылмады' : 'Канал не найден';
      await ctx.answerCallbackQuery({ text: notFoundMsg, show_alert: true });
      return;
    }

    const msg = getChannelInfoMessage(channel, locale);
    const type = channel.type === 'CHANNEL' ? 'CHANNEL' as const : 'GROUP' as const;

    try {
      await ctx.editMessageText(msg, {
        parse_mode: 'HTML',
        reply_markup: createChannelInfoKeyboard(channelId, type, locale),
      });
    } catch {
      await ctx.reply(msg, {
        parse_mode: 'HTML',
        reply_markup: createChannelInfoKeyboard(channelId, type, locale),
      });
    }
  });

  // Refresh channel info (re-check permissions from Telegram)
  bot.callbackQuery(/^refresh_channel:/, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const locale = getUserLocale(userId);
    const channelId = ctx.callbackQuery.data.replace('refresh_channel:', '');

    const result = await apiService.getUserChannels(userId);
    const channel = result.channels.find(ch => ch.id === channelId);
    if (!channel) {
      await ctx.answerCallbackQuery({ text: '❌', show_alert: false });
      return;
    }

    try {
      const chatId = BigInt(channel.telegramChatId);
      const botInfo = await ctx.api.getMe();
      const botMember = await ctx.api.getChatMember(Number(chatId), botInfo.id);
      const userMember = await ctx.api.getChatMember(Number(chatId), userId);
      let memberCount: number | undefined;
      try {
        memberCount = await ctx.api.getChatMemberCount(Number(chatId));
      } catch { /* optional */ }

      const chatInfo = await ctx.api.getChat(Number(chatId));
      const title = ('title' in chatInfo ? chatInfo.title : channel.title) || channel.title;

      await apiService.upsertChannel({
        telegramUserId: userId,
        telegramChatId: Number(chatId),
        username: 'username' in chatInfo ? chatInfo.username || null : null,
        title,
        type: channel.type === 'CHANNEL' ? 'CHANNEL' : 'GROUP',
        botIsAdmin: isAdmin(botMember),
        creatorIsAdmin: isAdmin(userMember),
        permissionsSnapshot: { bot: botMember, user: userMember },
        memberCount,
      });

      const updatedChannel = {
        ...channel,
        title,
        botIsAdmin: isAdmin(botMember),
        creatorIsAdmin: isAdmin(userMember),
        memberCount: memberCount ?? channel.memberCount,
      };

      const msg = getChannelInfoMessage(updatedChannel, locale);
      const type = channel.type === 'CHANNEL' ? 'CHANNEL' as const : 'GROUP' as const;
      const updatedLabel = locale === 'en' ? '✅ Updated' : locale === 'kk' ? '✅ Жаңартылды' : '✅ Обновлено';
      
      await ctx.answerCallbackQuery({ text: updatedLabel });
      try {
        await ctx.editMessageText(msg, {
          parse_mode: 'HTML',
          reply_markup: createChannelInfoKeyboard(channelId, type, locale),
        });
      } catch (editErr: any) {
        if (!editErr?.description?.includes('message is not modified')) throw editErr;
      }
    } catch (error) {
      log.error({ error, channelId }, 'Refresh channel failed');
      const errLabel = locale === 'en' ? '❌ Could not refresh' : locale === 'kk' ? '❌ Жаңарту мүмкін болмады' : '❌ Не удалось обновить';
      await ctx.answerCallbackQuery({ text: errLabel, show_alert: true });
    }
  });

  // Delete channel
  bot.callbackQuery(/^delete_channel:/, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const locale = getUserLocale(userId);
    const channelId = ctx.callbackQuery.data.replace('delete_channel:', '');

    const result = await apiService.deleteChannel(channelId);
    if (!result.ok) {
      const errMsg = locale === 'en' ? '❌ Could not delete' : locale === 'kk' ? '❌ Жою мүмкін болмады' : '❌ Не удалось удалить';
      await ctx.answerCallbackQuery({ text: errMsg, show_alert: true });
      return;
    }

    const deletedLabel = locale === 'en' ? '✅ Deleted' : locale === 'kk' ? '✅ Жойылды' : '✅ Удалено';
    await ctx.answerCallbackQuery({ text: deletedLabel });

    // Return to channels list
    await ctx.editMessageText(getChannelsMessage(locale), {
      parse_mode: 'HTML',
      reply_markup: createChannelManagementKeyboard(locale),
    });
  });

  // Back to channels main screen
  bot.callbackQuery('back_to_channels', async (ctx) => {
    const userId = ctx.from?.id;
    const locale = userId ? getUserLocale(userId) : 'ru';

    await ctx.answerCallbackQuery();
    try {
      await ctx.editMessageText(getChannelsMessage(locale), {
        parse_mode: 'HTML',
        reply_markup: createChannelManagementKeyboard(locale),
      });
    } catch {
      await ctx.reply(getChannelsMessage(locale), {
        parse_mode: 'HTML',
        reply_markup: createChannelManagementKeyboard(locale),
      });
    }
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
}
