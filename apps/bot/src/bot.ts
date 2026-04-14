import { Bot } from 'grammy';
import { config, isUserAllowed } from './config.js';
import { createLogger } from './lib/logger.js';
import {
  MENU,
  createMainMenuKeyboard,
  createSubMenuKeyboard,
  createWebAppInlineKeyboard,
  createGiveawayMethodKeyboard,
  createLanguageKeyboard,
  createSettingsMainKeyboard,
  createNotificationsKeyboard,
  getSettingsMainMessage,
  getLanguageSettingsMessage,
  getNotificationSettingsMessage,
  getWelcomeMessage,
  getOpenAppMessage,
  getCreateGiveawayMessage,
  getSupportMessage,
  getMainMenuMessage,
  getBackToMenuMessage,
  getCreateInBotSoonMessage,
} from './keyboards/mainMenu.js';
import {
  registerChannelHandlers,
  getChannelsMessage,
  createChannelManagementKeyboard,
  getUserAddingChannel,
  handleChannelAddition,
  clearUserAddingChannel,
} from './handlers/channels.js';
import {
  registerPostHandlers,
  getPostsMessage,
  createPostsKeyboard,
  isUserAwaitingPost,
  handlePostCreation,
  clearUserPostState,
} from './handlers/posts.js';
import {
  registerGiveawayHandlers,
  handleConfirmStart,
} from './handlers/giveaways.js';
import { t, updateUserLocale, getUserLocale, localeNames, Locale } from './i18n/index.js';
import { handleMyChatMember, handleChatMember } from './handlers/chat-member.js';
import {
  handleAdminBan,
  handleAdminUnban,
  handleAdminStats,
  handleAdminGiveaway,
  handleAdminBroadcast,
  handleAdminApprove,
  handleAdminReject,
  isAdminUser,
} from './handlers/admin.js';
import { handleInlineQuery } from './handlers/inline.js';
import { registerPaymentHandlers } from './handlers/payments.js';
import { NAV_CALLBACKS } from './lib/navigation.js';
import {
  btn, webAppBtn, inlineKeyboard, safeReply,
  EMOJI_MAP, isEnabled as isEmojiEnabled, enable as enableEmoji, disable as disableEmoji,
} from './lib/customEmoji.js';

const log = createLogger('bot');
const DEFAULT_INTERNAL_REQUEST_TIMEOUT_MS = 8000;

function getInternalRequestTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.BOT_INTERNAL_API_TIMEOUT_MS || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERNAL_REQUEST_TIMEOUT_MS;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = getInternalRequestTimeoutMs()
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// This module should only be imported when BOT_TOKEN is available
if (!config.botToken) {
  throw new Error('bot.ts should only be imported when BOT_TOKEN is set');
}

// Create bot instance with optional Telegram API proxy
export const bot = new Bot(config.botToken, {
  client: {
    apiRoot: config.telegramApiRoot,
  },
});

// Middleware: проверка whitelist (режим разработки)
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  
  if (!userId) {
    return next();
  }
  
  if (!isUserAllowed(userId)) {
    const locale = getUserLocale(userId);
    const maintenanceMessage = t(locale, 'maintenance.message', { supportBot: config.supportBot });
    
    await ctx.reply(maintenanceMessage, { parse_mode: 'HTML' });
    return;
  }
  
  return next();
});

// Track last menu state per user for "Back" button
const userMenuStack = new Map<number, string[]>();

function pushMenu(userId: number, menu: string) {
  const stack = userMenuStack.get(userId) || [];
  stack.push(menu);
  userMenuStack.set(userId, stack);
}

function popMenu(userId: number): string {
  const stack = userMenuStack.get(userId) || [];
  stack.pop();
  return stack.pop() || 'main';
}

function clearMenuStack(userId: number) {
  userMenuStack.delete(userId);
}

function clearAllUserStates(userId: number) {
  clearUserAddingChannel(userId);
  clearUserPostState(userId);
}

// ── /start command ──────────────────────────────────────────────────────────

bot.command('start', async (ctx) => {
  const userId = ctx.from?.id;
  const locale = userId ? getUserLocale(userId) : 'ru';
  const firstName = ctx.from?.first_name || t(locale, 'bot.friendFallback');

  const startParam = ctx.match;
  
  if (startParam && typeof startParam === 'string') {
    if (startParam.startsWith('confirm_')) {
      const giveawayId = startParam.replace('confirm_', '');
      await handleConfirmStart(ctx, giveawayId);
      return;
    }
    
    if (startParam.startsWith('join_')) {
      const giveawayId = startParam.replace('join_', '');
      const webAppUrl = `${config.webappUrl}?startapp=join_${giveawayId}`;
      
      const buttonText = t(locale, 'bot.joinGiveawayBtn');
      const messageText = t(locale, 'bot.joinGiveawayMsg');

      await safeReply(ctx, messageText, {
        parse_mode: 'HTML',
        reply_markup: inlineKeyboard(
          [webAppBtn(buttonText, webAppUrl, 'join', 'danger')],
        ),
      });
      return;
    }

    if (startParam === 'add_channel') {
      const addChannel = t(locale, 'bot.addChannel');
      const addGroup = t(locale, 'bot.addGroup');
      const openApp = t(locale, 'bot.openAppBtn');
      
      const message = locale === 'ru' 
        ? '📣 <b>Добавление канала</b>\n\nВыберите тип:\n• <b>Канал</b> — для публикации розыгрышей и проверки подписки\n• <b>Группа</b> — для проверки подписки участников\n\n⚠️ Бот должен быть админом канала/группы с правами на публикацию.'
        : locale === 'en'
        ? '📣 <b>Add Channel</b>\n\nChoose type:\n• <b>Channel</b> — for publishing giveaways and checking subscriptions\n• <b>Group</b> — for checking participant subscriptions\n\n⚠️ Bot must be an admin with posting permissions.'
        : '📣 <b>Арна қосу</b>\n\nТүрін таңдаңыз:\n• <b>Арна</b> — ұтыс ойындарын жариялау және жазылымды тексеру үшін\n• <b>Топ</b> — қатысушылардың жазылымын тексеру үшін\n\n⚠️ Бот жариялау құқықтары бар админ болуы керек.';
      
      await safeReply(ctx, message, {
        parse_mode: 'HTML',
        reply_markup: inlineKeyboard(
          [btn(addChannel, 'menu_add_channel', 'add', 'danger')],
          [btn(addGroup, 'menu_add_group', 'add', 'danger')],
          [webAppBtn(openApp, config.webappUrl + '/creator/channels', 'app', 'danger')],
        ),
      });
      return;
    }
  }

  const keyboard = createMainMenuKeyboard(locale);

  if (ctx.from) {
    clearMenuStack(ctx.from.id);
    pushMenu(ctx.from.id, 'main');
    clearAllUserStates(ctx.from.id);
  }

  void ctx.api
    .setChatMenuButton({
      chat_id: userId,
      menu_button: {
        type: 'web_app',
        text: t(locale, 'buttons.menuButton'),
        web_app: { url: config.webappUrl },
      },
    })
    .catch(() => {});

  await ctx.reply(getWelcomeMessage(firstName, locale), {
    reply_markup: keyboard,
    parse_mode: 'HTML',
  });
});

// ── /help command ───────────────────────────────────────────────────────────

bot.command('help', async (ctx) => {
  const userId = ctx.from?.id;
  const locale = userId ? getUserLocale(userId) : 'ru';
  
  const helpText = locale === 'ru' 
    ? `❓ <b>Помощь</b>\n\nКоманды:\n/start — Начать работу с ботом\n/help — Показать эту справку\n/cancel — Отменить текущую операцию\n\nИспользуйте меню для навигации 👇`
    : locale === 'en'
    ? `❓ <b>Help</b>\n\nCommands:\n/start — Start the bot\n/help — Show this help\n/cancel — Cancel current operation\n\nUse the menu to navigate 👇`
    : `❓ <b>Көмек</b>\n\nКомандалар:\n/start — Ботты бастау\n/help — Осы көмекті көрсету\n/cancel — Ағымдағы операцияны болдырмау\n\nШарлау үшін мәзірді пайдаланыңыз 👇`;
  
  await ctx.reply(helpText, {
    reply_markup: createMainMenuKeyboard(locale),
    parse_mode: 'HTML',
  });
});

// ── /cancel command ─────────────────────────────────────────────────────────

bot.command('cancel', async (ctx) => {
  const userId = ctx.from?.id;
  const locale = userId ? getUserLocale(userId) : 'ru';
  
  if (userId) {
    clearAllUserStates(userId);
  }
  
  await ctx.reply(t(locale, 'bot.operationCancelled'), {
    reply_markup: createMainMenuKeyboard(locale),
  });
});

// ── Custom emoji admin commands ─────────────────────────────────────────────

bot.command('emoji_id', async (ctx) => {
  if (!ctx.from?.id || !isAdminUser(ctx.from.id)) return;
  await ctx.reply(
    '🎨 <b>Извлечение ID кастомных эмодзи</b>\n\n' +
    'Отправьте мне сообщение с кастомным эмодзи,\n' +
    'и я покажу его <code>custom_emoji_id</code>.\n\n' +
    'Потом вставьте его в <code>.env</code>:\n' +
    '<code>EMOJI_JOIN=полученный_id</code>\n\n' +
    '💎 Кастомные эмодзи есть в панели эмодзи (раздел Premium).',
    { parse_mode: 'HTML' },
  );
});

bot.command('emoji_status', async (ctx) => {
  if (!ctx.from?.id || !isAdminUser(ctx.from.id)) return;
  const status = isEmojiEnabled() ? '✅ Включены' : '🔴 Отключены';
  const configured = Object.entries(EMOJI_MAP)
    .filter(([, v]) => v)
    .map(([k, v]) => `  <code>${k}</code>: <code>${v}</code>`)
    .join('\n');

  await ctx.reply(
    `🎨 <b>Статус кастомных эмодзи:</b> ${status}\n\n` +
    (configured ? `<b>Настроенные:</b>\n${configured}` : '<i>Нет настроенных эмодзи</i>') +
    '\n\n<b>Доступные ключи:</b>\n' +
    Object.keys(EMOJI_MAP).map(k => `<code>EMOJI_${k.toUpperCase()}</code>`).join(', '),
    { parse_mode: 'HTML' },
  );
});

bot.command('emoji_enable', async (ctx) => {
  if (!ctx.from?.id || !isAdminUser(ctx.from.id)) return;
  enableEmoji();
  await ctx.reply('✅ Кастомные эмодзи включены.');
});

bot.command('emoji_disable', async (ctx) => {
  if (!ctx.from?.id || !isAdminUser(ctx.from.id)) return;
  disableEmoji('Admin command');
  await ctx.reply('🔴 Кастомные эмодзи отключены.');
});

// ── Menu button handlers ────────────────────────────────────────────────────

bot.hears(MENU.OPEN_APP, async (ctx) => {
  const userId = ctx.from?.id;
  const locale = userId ? getUserLocale(userId) : 'ru';
  
  if (ctx.from) {
    pushMenu(ctx.from.id, 'open_app');
    clearAllUserStates(ctx.from.id);
  }

  await safeReply(ctx, getOpenAppMessage(locale), {
    reply_markup: createWebAppInlineKeyboard(locale),
    parse_mode: 'HTML',
  });
});

bot.hears(MENU.CREATE_GIVEAWAY, async (ctx) => {
  const userId = ctx.from?.id;
  const locale = userId ? getUserLocale(userId) : 'ru';
  
  if (ctx.from) {
    pushMenu(ctx.from.id, 'create_giveaway');
    clearAllUserStates(ctx.from.id);
  }

  await safeReply(ctx, getCreateGiveawayMessage(locale), {
    reply_markup: createGiveawayMethodKeyboard(locale),
    parse_mode: 'HTML',
  });
});

bot.hears(MENU.MY_CHANNELS, async (ctx) => {
  const userId = ctx.from?.id;
  const locale = userId ? getUserLocale(userId) : 'ru';
  
  if (ctx.from) {
    pushMenu(ctx.from.id, 'my_channels');
    clearAllUserStates(ctx.from.id);
  }

  await safeReply(ctx, getChannelsMessage(locale), {
    reply_markup: createChannelManagementKeyboard(locale),
    parse_mode: 'HTML',
  });
});

bot.hears(MENU.MY_POSTS, async (ctx) => {
  const userId = ctx.from?.id;
  const locale = userId ? getUserLocale(userId) : 'ru';
  
  if (ctx.from) {
    pushMenu(ctx.from.id, 'my_posts');
    clearAllUserStates(ctx.from.id);
  }

  await safeReply(ctx, getPostsMessage(locale), {
    reply_markup: createPostsKeyboard(locale),
    parse_mode: 'HTML',
  });
});

bot.hears(MENU.SETTINGS, async (ctx) => {
  if (ctx.from) {
    pushMenu(ctx.from.id, 'settings');
    clearAllUserStates(ctx.from.id);
  }

  const locale = ctx.from?.id ? getUserLocale(ctx.from.id) : 'ru';

  await ctx.reply(getSettingsMainMessage(locale), {
    reply_markup: createSettingsMainKeyboard(locale),
    parse_mode: 'HTML',
  });
});

bot.hears(MENU.SUPPORT, async (ctx) => {
  const userId = ctx.from?.id;
  const locale = userId ? getUserLocale(userId) : 'ru';
  
  if (ctx.from) {
    pushMenu(ctx.from.id, 'support');
    clearAllUserStates(ctx.from.id);
  }

  await ctx.reply(getSupportMessage(locale), {
    reply_markup: createSubMenuKeyboard(locale),
    parse_mode: 'HTML',
  });
});

bot.hears(MENU.BACK, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  
  const locale = getUserLocale(userId);
  popMenu(userId);
  clearAllUserStates(userId);

  await ctx.reply(getBackToMenuMessage(locale), {
    reply_markup: createMainMenuKeyboard(locale),
    parse_mode: 'HTML',
  });
});

bot.hears(MENU.TO_MENU, async (ctx) => {
  const userId = ctx.from?.id;
  const locale = userId ? getUserLocale(userId) : 'ru';
  
  if (ctx.from) {
    clearMenuStack(ctx.from.id);
    pushMenu(ctx.from.id, 'main');
    clearAllUserStates(ctx.from.id);
  }

  await ctx.reply(getMainMenuMessage(locale), {
    reply_markup: createMainMenuKeyboard(locale),
    parse_mode: 'HTML',
  });
});

// ── Inline callback handlers ────────────────────────────────────────────────

bot.callbackQuery(NAV_CALLBACKS.BACK, async (ctx) => {
  const userId = ctx.from?.id;
  const locale = userId ? getUserLocale(userId) : 'ru';
  await ctx.answerCallbackQuery();
  await ctx.reply(getMainMenuMessage(locale), {
    reply_markup: createMainMenuKeyboard(locale),
    parse_mode: 'HTML',
  });
});

bot.callbackQuery(NAV_CALLBACKS.MAIN_MENU, async (ctx) => {
  const userId = ctx.from?.id;
  const locale = userId ? getUserLocale(userId) : 'ru';
  await ctx.answerCallbackQuery();
  await ctx.reply(getMainMenuMessage(locale), {
    reply_markup: createMainMenuKeyboard(locale),
    parse_mode: 'HTML',
  });
});

bot.callbackQuery('settings_language', async (ctx) => {
  const userId = ctx.from?.id;
  const locale = userId ? getUserLocale(userId) : 'ru';
  await ctx.answerCallbackQuery();

  try {
    await ctx.editMessageText(getLanguageSettingsMessage(locale), {
      reply_markup: createLanguageKeyboard(locale),
      parse_mode: 'HTML',
    });
  } catch {
    // message not changed
  }
});

bot.callbackQuery('settings_notifications', async (ctx) => {
  const userId = ctx.from?.id;
  const locale = userId ? getUserLocale(userId) : 'ru';
  await ctx.answerCallbackQuery();

  let notificationMode = 'MILESTONE';
  try {
    if (userId) {
      const res = await fetchWithTimeout(`${config.internalApiUrl}/internal/users/${userId}/notification-mode`, {
        headers: { 'X-Internal-Token': config.internalApiToken },
      });
      if (res.ok) {
        const data = await res.json() as { notificationMode?: string };
        notificationMode = data.notificationMode || 'MILESTONE';
      }
    }
  } catch {
    // fallback to default
  }

  try {
    await ctx.editMessageText(getNotificationSettingsMessage(locale, notificationMode), {
      reply_markup: createNotificationsKeyboard(locale, notificationMode),
      parse_mode: 'HTML',
    });
  } catch {
    // message not changed
  }
});

bot.callbackQuery('settings_back', async (ctx) => {
  const userId = ctx.from?.id;
  const locale = userId ? getUserLocale(userId) : 'ru';
  await ctx.answerCallbackQuery();

  try {
    await ctx.editMessageText(getSettingsMainMessage(locale), {
      reply_markup: createSettingsMainKeyboard(locale),
      parse_mode: 'HTML',
    });
  } catch {
    // message not changed
  }
});

bot.callbackQuery('notif_section', async (ctx) => {
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^notif_(MILESTONE|DAILY|OFF)$/, async (ctx) => {
  const mode = ctx.callbackQuery.data.replace('notif_', '') as 'MILESTONE' | 'DAILY' | 'OFF';
  const userId = ctx.from?.id;
  const locale = userId ? getUserLocale(userId) : 'ru';

  if (!userId) {
    await ctx.answerCallbackQuery({ text: '❌ Error' });
    return;
  }

  try {
    await fetchWithTimeout(`${config.internalApiUrl}/internal/users/${userId}/notification-mode`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': config.internalApiToken,
      },
      body: JSON.stringify({ notificationMode: mode }),
    });

    const modeLabels: Record<string, Record<string, string>> = {
      MILESTONE: { ru: 'Вехи', en: 'Milestones', kk: 'Белестер' },
      DAILY: { ru: 'Ежедневно', en: 'Daily', kk: 'Күнделікті' },
      OFF: { ru: 'Выключены', en: 'Disabled', kk: 'Өшірілді' },
    };

    const label = modeLabels[mode]?.[locale] || mode;
    const confirmText = locale === 'ru'
      ? `✅ Уведомления: ${label}`
      : locale === 'en'
      ? `✅ Notifications: ${label}`
      : `✅ Хабарландырулар: ${label}`;

    await ctx.answerCallbackQuery({ text: confirmText });

    try {
      await ctx.editMessageText(getNotificationSettingsMessage(locale, mode), {
        reply_markup: createNotificationsKeyboard(locale, mode),
        parse_mode: 'HTML',
      });
    } catch {
      // message not changed
    }
  } catch (error) {
    log.error({ error, userId, mode }, 'Failed to update notification mode');
    await ctx.answerCallbackQuery({
      text: locale === 'ru' ? '❌ Ошибка при сохранении' : '❌ Save error',
      show_alert: true,
    });
  }
});

bot.callbackQuery('create_in_bot', async (ctx) => {
  const userId = ctx.from?.id;
  const locale = userId ? getUserLocale(userId) : 'ru';
  
  await ctx.answerCallbackQuery({
    text: getCreateInBotSoonMessage(locale),
    show_alert: true,
  });
});

bot.callbackQuery(/^lang_/, async (ctx) => {
  const lang = ctx.callbackQuery.data.replace('lang_', '') as Locale;
  const userId = ctx.from?.id;
  
  if (!userId) {
    await ctx.answerCallbackQuery({ text: '❌ Error' });
    return;
  }

  await updateUserLocale(userId, lang);
  
  const message = t(lang, 'settings.languageChanged', { language: localeNames[lang] });
  await ctx.answerCallbackQuery({ text: message, show_alert: false });

  try {
    await ctx.editMessageText(getLanguageSettingsMessage(lang), {
      reply_markup: createLanguageKeyboard(lang),
      parse_mode: 'HTML',
    });
  } catch {
    // message not changed
  }

  void ctx.api
    .setChatMenuButton({
      chat_id: userId,
      menu_button: {
        type: 'web_app',
        text: t(lang, 'buttons.menuButton'),
        web_app: { url: config.webappUrl },
      },
    })
    .catch(() => {});

  await ctx.reply(getMainMenuMessage(lang), {
    reply_markup: createMainMenuKeyboard(lang),
    parse_mode: 'HTML',
  });
});

// ── Register handlers ───────────────────────────────────────────────────────

registerChannelHandlers(bot);
registerPostHandlers(bot);
registerGiveawayHandlers(bot);

// ── Text message handler (channels, posts, emoji ID extraction) ─────────────

bot.on('message:text', async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();

  // Check if user is adding a channel (priority over emoji detection)
  const channelState = getUserAddingChannel(userId);
  if (channelState) {
    await handleChannelAddition(ctx, channelState.type);
    return;
  }

  // Check if user is creating a post (priority over emoji detection)
  if (isUserAwaitingPost(userId)) {
    await handlePostCreation(ctx);
    return;
  }

  // Admin: auto-detect custom emoji IDs (only when not in a flow)
  if (isAdminUser(userId) && !ctx.message.text.startsWith('/')) {
    const entities = ctx.message.entities;
    const hasCustomEmoji = entities?.some(e => e.type === 'custom_emoji');
    if (hasCustomEmoji) {
      const emojiEntities = entities!.filter(e => e.type === 'custom_emoji');
      let reply = '🎨 <b>Найденные кастомные эмодзи:</b>\n\n';
      emojiEntities.forEach((e, i) => {
        const emojiChar = ctx.message!.text!.substring(e.offset, e.offset + e.length);
        reply += `${i + 1}. ${emojiChar} → <code>${(e as any).custom_emoji_id}</code>\n`;
      });
      reply += '\nСкопируйте ID и добавьте в <code>.env</code>';
      await ctx.reply(reply, { parse_mode: 'HTML' });
      return;
    }
  }

  return next();
});

bot.on('message:photo', async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();

  if (isUserAwaitingPost(userId)) {
    await handlePostCreation(ctx);
    return;
  }

  return next();
});

bot.on('message:video', async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();

  if (isUserAwaitingPost(userId)) {
    await handlePostCreation(ctx);
    return;
  }

  return next();
});

bot.on('message:forward_origin', async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();

  const state = getUserAddingChannel(userId);
  if (state) {
    await handleChannelAddition(ctx, state.type);
    return;
  }

  return next();
});

bot.on('message:web_app_data', async (ctx) => {
  const userId = ctx.from?.id;
  const locale = userId ? getUserLocale(userId) : 'ru';
  
  await ctx.reply(t(locale, 'bot.dataReceived'), {
    reply_markup: createMainMenuKeyboard(locale),
  });
});

bot.on('my_chat_member', handleMyChatMember);
bot.on('chat_member', handleChatMember);

// ── /repost command ─────────────────────────────────────────────────────────

bot.hears(/^\/repost:?(.+)$/, async (ctx) => {
  const userId = ctx.from?.id;
  const locale = userId ? getUserLocale(userId) : 'ru';
  const shortCode = ctx.match?.[1]?.trim();

  if (!shortCode) {
    await ctx.reply(locale === 'ru'
      ? '❌ Укажите shortCode розыгрыша. Пример: /repost:abc12345'
      : locale === 'en'
      ? '❌ Please specify a giveaway shortCode. Example: /repost:abc12345'
      : '❌ Ұтыс ойынының shortCode-ін көрсетіңіз. Мысал: /repost:abc12345'
    );
    return;
  }

  try {
    const res = await fetchWithTimeout(`${config.internalApiUrl}/internal/giveaways/by-code/${shortCode}`, {
      headers: { 'X-Internal-Token': config.internalApiToken },
    });

    if (!res.ok) {
      const notFoundMsg = locale === 'ru'
        ? `❌ Розыгрыш с кодом <code>${shortCode}</code> не найден`
        : locale === 'en'
        ? `❌ Giveaway with code <code>${shortCode}</code> not found`
        : `❌ <code>${shortCode}</code> кодымен ұтыс ойыны табылмады`;

      await ctx.reply(notFoundMsg, { parse_mode: 'HTML' });
      return;
    }

    const data = await res.json() as {
      id: string;
      title: string;
      shortCode: string;
      status: string;
      postTemplate?: { text?: string };
    };

    if (data.status !== 'ACTIVE') {
      const statusMsg = locale === 'ru'
        ? `⚠️ Розыгрыш "${data.title}" не активен (статус: ${data.status})`
        : locale === 'en'
        ? `⚠️ Giveaway "${data.title}" is not active (status: ${data.status})`
        : `⚠️ "${data.title}" ұтыс ойыны белсенді емес (күйі: ${data.status})`;

      await ctx.reply(statusMsg, { parse_mode: 'HTML' });
      return;
    }

    const postText = data.postTemplate?.text || data.title;
    const buttonLabel = locale === 'ru' ? '🎁 Участвовать' : locale === 'en' ? '🎁 Participate' : '🎁 Қатысу';

    await safeReply(ctx, postText, {
      parse_mode: 'HTML',
      reply_markup: inlineKeyboard(
        [webAppBtn(buttonLabel, `${config.webappUrl}?startapp=g_${data.shortCode}`, 'join', 'danger')],
      ),
    });

    log.info({ userId, shortCode, giveawayId: data.id }, 'Repost sent');
  } catch (error) {
    log.error({ error, shortCode }, 'Failed to repost giveaway');
    const errMsg = locale === 'ru'
      ? '❌ Ошибка при получении данных розыгрыша'
      : locale === 'en'
      ? '❌ Failed to fetch giveaway data'
      : '❌ Ұтыс ойыны деректерін алу кезінде қате';

    await ctx.reply(errMsg);
  }
});

// ── Admin commands ──────────────────────────────────────────────────────────

bot.command('admin_ban', handleAdminBan);
bot.command('admin_unban', handleAdminUnban);
bot.command('admin_stats', handleAdminStats);
bot.command('admin_giveaway', handleAdminGiveaway);
bot.command('admin_broadcast', handleAdminBroadcast);
bot.command('admin_approve', handleAdminApprove);
bot.command('admin_reject', handleAdminReject);

bot.on('inline_query', handleInlineQuery);

registerPaymentHandlers(bot);

bot.catch((err) => {
  log.error({ err }, 'Bot error');
});
