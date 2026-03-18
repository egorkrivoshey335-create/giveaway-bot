import { Bot, InlineKeyboard } from 'grammy';
import { config, isUserAllowed } from './config.js';
import { createLogger } from './lib/logger.js';
import {
  MENU,
  createMainMenuKeyboard,
  createSubMenuKeyboard,
  createWebAppInlineKeyboard,
  createGiveawayMethodKeyboard,
  createLanguageKeyboard,
  createNotificationKeyboard,
  getSettingsWithNotificationsMessage,
  getWelcomeMessage,
  getOpenAppMessage,
  getCreateGiveawayMessage,
  getSettingsMessage,
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
} from './handlers/admin.js';
import { handleInlineQuery } from './handlers/inline.js';
import { registerPaymentHandlers } from './handlers/payments.js';
import { NAV_CALLBACKS } from './lib/navigation.js';

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
  
  // Если нет userId — пропускаем (callback queries и т.д.)
  if (!userId) {
    return next();
  }
  
  // Проверяем whitelist
  if (!isUserAllowed(userId)) {
    // Отправляем сообщение о режиме разработки
    const locale = getUserLocale(userId);
    const maintenanceMessage = t(locale, 'maintenance.message', { supportBot: config.supportBot });
    
    await ctx.reply(maintenanceMessage, { parse_mode: 'HTML' });
    return; // Не продолжаем обработку
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
  stack.pop(); // Remove current
  return stack.pop() || 'main'; // Return previous or main
}

function clearMenuStack(userId: number) {
  userMenuStack.delete(userId);
}

function clearAllUserStates(userId: number) {
  clearUserAddingChannel(userId);
  clearUserPostState(userId);
}

// Handle /start command
bot.command('start', async (ctx) => {
  const userId = ctx.from?.id;
  const locale = userId ? getUserLocale(userId) : 'ru';
  const firstName = ctx.from?.first_name || t(locale, 'bot.friendFallback');

  // Check for deep link parameters
  const startParam = ctx.match;
  
  if (startParam && typeof startParam === 'string') {
    // Handle confirm_<giveawayId>
    if (startParam.startsWith('confirm_')) {
      const giveawayId = startParam.replace('confirm_', '');
      await handleConfirmStart(ctx, giveawayId);
      return;
    }
    
    // Handle join_<giveawayId> - show webApp button for participation
    if (startParam.startsWith('join_')) {
      const giveawayId = startParam.replace('join_', '');
      const webAppUrl = `${config.webappUrl}?startapp=join_${giveawayId}`;
      
      const buttonText = t(locale, 'bot.joinGiveawayBtn');
      const messageText = t(locale, 'bot.joinGiveawayMsg');
      
      const keyboard = new InlineKeyboard()
        .webApp(buttonText, webAppUrl);
      
      await ctx.reply(messageText, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
      return;
    }

    // Handle add_channel - открыть меню добавления канала
    if (startParam === 'add_channel') {
      const addChannel = t(locale, 'bot.addChannel');
      const addGroup = t(locale, 'bot.addGroup');
      const openApp = t(locale, 'bot.openAppBtn');
      
      const keyboard = new InlineKeyboard()
        .text(addChannel, 'menu_add_channel')
        .row()
        .text(addGroup, 'menu_add_group')
        .row()
        .webApp(openApp, config.webappUrl + '/creator/channels');
      
      const message = locale === 'ru' 
        ? '📣 <b>Добавление канала</b>\n\nВыберите тип:\n• <b>Канал</b> — для публикации розыгрышей и проверки подписки\n• <b>Группа</b> — для проверки подписки участников\n\n⚠️ Бот должен быть админом канала/группы с правами на публикацию.'
        : locale === 'en'
        ? '📣 <b>Add Channel</b>\n\nChoose type:\n• <b>Channel</b> — for publishing giveaways and checking subscriptions\n• <b>Group</b> — for checking participant subscriptions\n\n⚠️ Bot must be an admin with posting permissions.'
        : '📣 <b>Арна қосу</b>\n\nТүрін таңдаңыз:\n• <b>Арна</b> — ұтыс ойындарын жариялау және жазылымды тексеру үшін\n• <b>Топ</b> — қатысушылардың жазылымын тексеру үшін\n\n⚠️ Бот жариялау құқықтары бар админ болуы керек.';
      
      await ctx.reply(message, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
      return;
    }
  }

  // Default welcome message
  const keyboard = createMainMenuKeyboard(locale);

  if (ctx.from) {
    clearMenuStack(ctx.from.id);
    pushMenu(ctx.from.id, 'main');
    clearAllUserStates(ctx.from.id);
  }

  // Устанавливаем Menu Button на языке пользователя (не блокируем ответ)
  void ctx.api
    .setChatMenuButton({
      chat_id: userId,
      menu_button: {
        type: 'web_app',
        text: t(locale, 'buttons.menuButton'),
        web_app: { url: config.webappUrl },
      },
    })
    .catch(() => {
      // Не критично
    });

  await ctx.reply(getWelcomeMessage(firstName, locale), {
    reply_markup: keyboard,
    parse_mode: 'HTML',
  });
});

// Handle /help command
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

// Handle /cancel command
bot.command('cancel', async (ctx) => {
  const userId = ctx.from?.id;
  const locale = userId ? getUserLocale(userId) : 'ru';
  
  if (userId) {
    clearAllUserStates(userId);
  }
  
  const cancelText = t(locale, 'bot.operationCancelled');
  
  await ctx.reply(cancelText, {
    reply_markup: createMainMenuKeyboard(locale),
  });
});

// Handle "Open app" button
bot.hears(MENU.OPEN_APP, async (ctx) => {
  const userId = ctx.from?.id;
  const locale = userId ? getUserLocale(userId) : 'ru';
  
  if (ctx.from) {
    pushMenu(ctx.from.id, 'open_app');
    clearAllUserStates(ctx.from.id);
  }

  await ctx.reply(getOpenAppMessage(locale), {
    reply_markup: createWebAppInlineKeyboard(locale),
    parse_mode: 'HTML',
  });
});

// Handle "Create giveaway" button
bot.hears(MENU.CREATE_GIVEAWAY, async (ctx) => {
  const userId = ctx.from?.id;
  const locale = userId ? getUserLocale(userId) : 'ru';
  
  if (ctx.from) {
    pushMenu(ctx.from.id, 'create_giveaway');
    clearAllUserStates(ctx.from.id);
  }

  await ctx.reply(getCreateGiveawayMessage(locale), {
    reply_markup: createGiveawayMethodKeyboard(locale),
    parse_mode: 'HTML',
  });
});

// Handle "My channels" button
bot.hears(MENU.MY_CHANNELS, async (ctx) => {
  const userId = ctx.from?.id;
  const locale = userId ? getUserLocale(userId) : 'ru';
  
  if (ctx.from) {
    pushMenu(ctx.from.id, 'my_channels');
    clearAllUserStates(ctx.from.id);
  }

  await ctx.reply(getChannelsMessage(locale), {
    reply_markup: createChannelManagementKeyboard(locale),
    parse_mode: 'HTML',
  });
});

// Handle "My posts" button
bot.hears(MENU.MY_POSTS, async (ctx) => {
  const userId = ctx.from?.id;
  const locale = userId ? getUserLocale(userId) : 'ru';
  
  if (ctx.from) {
    pushMenu(ctx.from.id, 'my_posts');
    clearAllUserStates(ctx.from.id);
  }

  await ctx.reply(getPostsMessage(locale), {
    reply_markup: createPostsKeyboard(locale),
    parse_mode: 'HTML',
  });
});

// Handle "Settings" button
bot.hears(MENU.SETTINGS, async (ctx) => {
  if (ctx.from) {
    pushMenu(ctx.from.id, 'settings');
    clearAllUserStates(ctx.from.id);
  }

  const locale = ctx.from?.id ? getUserLocale(ctx.from.id) : 'ru';

  // Получаем текущий режим уведомлений из API
  let notificationMode = 'MILESTONE';
  try {
    const userId = ctx.from?.id;
    if (userId) {
      const res = await fetchWithTimeout(`${config.apiUrl}/internal/users/${userId}/notification-mode`, {
        headers: { 'X-Internal-Token': config.internalApiToken },
      });
      if (res.ok) {
        const data = await res.json() as { notificationMode?: string };
        notificationMode = data.notificationMode || 'MILESTONE';
      }
    }
  } catch {
    // Не критично — используем дефолт
  }

  const settingsMessage = getSettingsWithNotificationsMessage(locale, notificationMode);

  // Объединяем клавиатуру: язык + уведомления
  const kb = new InlineKeyboard()
    // Языки
    .text('🇷🇺 Русский', 'lang_ru')
    .text('🇬🇧 English', 'lang_en')
    .text('🇰🇿 Қазақша', 'lang_kk')
    .row()
    // Разделитель + уведомления
    .text(locale === 'ru' ? '📢 Уведомления:' : locale === 'en' ? '📢 Notifications:' : '📢 Хабарландырулар:', 'notif_section')
    .row()
    .text(`${notificationMode === 'MILESTONE' ? '✅ ' : ''}🎯 Milestone`, 'notif_MILESTONE')
    .text(`${notificationMode === 'DAILY' ? '✅ ' : ''}📅 Daily`, 'notif_DAILY')
    .text(`${notificationMode === 'OFF' ? '✅ ' : ''}🔕 Off`, 'notif_OFF');

  await ctx.reply(settingsMessage, {
    reply_markup: kb,
    parse_mode: 'HTML',
  });
});

// Handle "Support" button
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

// Handle "Back" button
bot.hears(MENU.BACK, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  
  const locale = getUserLocale(userId);

  popMenu(userId);
  clearAllUserStates(userId);

  // Go back to main menu for simplicity
  await ctx.reply(getBackToMenuMessage(locale), {
    reply_markup: createMainMenuKeyboard(locale),
    parse_mode: 'HTML',
  });
});

// Handle "To menu" button
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

// Handle navigation: Back button (nav_back) → go to main menu
bot.callbackQuery(NAV_CALLBACKS.BACK, async (ctx) => {
  const userId = ctx.from?.id;
  const locale = userId ? getUserLocale(userId) : 'ru';
  await ctx.answerCallbackQuery();
  await ctx.reply(getMainMenuMessage(locale), {
    reply_markup: createMainMenuKeyboard(locale),
    parse_mode: 'HTML',
  });
});

// Handle navigation: Main Menu (nav_main_menu)
bot.callbackQuery(NAV_CALLBACKS.MAIN_MENU, async (ctx) => {
  const userId = ctx.from?.id;
  const locale = userId ? getUserLocale(userId) : 'ru';
  await ctx.answerCallbackQuery();
  await ctx.reply(getMainMenuMessage(locale), {
    reply_markup: createMainMenuKeyboard(locale),
    parse_mode: 'HTML',
  });
});

// Handle notification section button (no-op)
bot.callbackQuery('notif_section', async (ctx) => {
  await ctx.answerCallbackQuery();
});

// Handle notification mode selection
bot.callbackQuery(/^notif_(MILESTONE|DAILY|OFF)$/, async (ctx) => {
  const mode = ctx.callbackQuery.data.replace('notif_', '') as 'MILESTONE' | 'DAILY' | 'OFF';
  const userId = ctx.from?.id;
  const locale = userId ? getUserLocale(userId) : 'ru';

  if (!userId) {
    await ctx.answerCallbackQuery({ text: '❌ Error' });
    return;
  }

  try {
    // Обновляем режим уведомлений через API
    const res = await fetchWithTimeout(`${config.apiUrl}/internal/users/${userId}/notification-mode`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': config.internalApiToken,
      },
      body: JSON.stringify({ notificationMode: mode }),
    });

    if (!res.ok) throw new Error(`API returned ${res.status}`);

    const modeLabels: Record<string, Record<string, string>> = {
      MILESTONE: { ru: 'Milestone', en: 'Milestone', kk: 'Milestone' },
      DAILY: { ru: 'Ежедневная сводка', en: 'Daily summary', kk: 'Күнделікті жиынтық' },
      OFF: { ru: 'Выключены', en: 'Disabled', kk: 'Өшірілді' },
    };

    const label = modeLabels[mode]?.[locale] || mode;
    const confirmText = locale === 'ru'
      ? `✅ Уведомления: ${label}`
      : locale === 'en'
      ? `✅ Notifications: ${label}`
      : `✅ Хабарландырулар: ${label}`;

    await ctx.answerCallbackQuery({ text: confirmText });

    // Обновляем сообщение с новым состоянием
    const settingsMessage = getSettingsWithNotificationsMessage(locale, mode);
    const kb = new InlineKeyboard()
      .text('🇷🇺 Русский', 'lang_ru')
      .text('🇬🇧 English', 'lang_en')
      .text('🇰🇿 Қазақша', 'lang_kk')
      .row()
      .text(locale === 'ru' ? '📢 Уведомления:' : locale === 'en' ? '📢 Notifications:' : '📢 Хабарландырулар:', 'notif_section')
      .row()
      .text(`${mode === 'MILESTONE' ? '✅ ' : ''}🎯 Milestone`, 'notif_MILESTONE')
      .text(`${mode === 'DAILY' ? '✅ ' : ''}📅 Daily`, 'notif_DAILY')
      .text(`${mode === 'OFF' ? '✅ ' : ''}🔕 Off`, 'notif_OFF');

    try {
      await ctx.editMessageText(settingsMessage, {
        reply_markup: kb,
        parse_mode: 'HTML',
      });
    } catch {
      // Игнорируем если сообщение не изменилось
    }
  } catch (error) {
    log.error({ error, userId, mode }, 'Failed to update notification mode');
    await ctx.answerCallbackQuery({
      text: locale === 'ru' ? '❌ Ошибка при сохранении' : '❌ Save error',
      show_alert: true,
    });
  }
});

// Handle inline button "Create in bot" (stub)
bot.callbackQuery('create_in_bot', async (ctx) => {
  const userId = ctx.from?.id;
  const locale = userId ? getUserLocale(userId) : 'ru';
  
  await ctx.answerCallbackQuery({
    text: getCreateInBotSoonMessage(locale),
    show_alert: true,
  });
});

// Handle language selection callbacks
bot.callbackQuery(/^lang_/, async (ctx) => {
  const lang = ctx.callbackQuery.data.replace('lang_', '') as Locale;
  const userId = ctx.from?.id;
  
  if (!userId) {
    await ctx.answerCallbackQuery({ text: '❌ Error' });
    return;
  }

  // Сохраняем язык в БД
  const success = await updateUserLocale(userId, lang);
  
  if (success) {
    // Показываем уведомление на выбранном языке
    const message = t(lang, 'settings.languageChanged', { language: localeNames[lang] });
    await ctx.answerCallbackQuery({
      text: message,
      show_alert: false,
    });

    // Обновляем сообщение с настройками на новом языке
    try {
      await ctx.editMessageText(getSettingsMessage(lang), {
        reply_markup: createLanguageKeyboard(),
        parse_mode: 'HTML',
      });
    } catch {
      // Игнорируем ошибку если сообщение не изменилось
    }

    // Обновляем Menu Button (синяя кнопка «Открыть» / «Open» / «Ашу»)
    void ctx.api
      .setChatMenuButton({
        chat_id: userId,
        menu_button: {
          type: 'web_app',
          text: t(lang, 'buttons.menuButton'),
          web_app: { url: config.webappUrl },
        },
      })
      .catch(() => {
        // Игнорируем — не критично
      });

    // Отправляем новое сообщение с обновлённой клавиатурой главного меню
    await ctx.reply(getMainMenuMessage(lang), {
      reply_markup: createMainMenuKeyboard(lang),
      parse_mode: 'HTML',
    });
  } else {
    await ctx.answerCallbackQuery({
      text: t(lang, 'errors.generic'),
      show_alert: true,
    });
  }
});

// Register handlers
registerChannelHandlers(bot);
registerPostHandlers(bot);
registerGiveawayHandlers(bot);

// Handle text messages that might be for channel or post input
bot.on('message:text', async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();

  // Check if user is adding a channel
  const channelState = getUserAddingChannel(userId);
  if (channelState) {
    await handleChannelAddition(ctx, channelState.type);
    return;
  }

  // Check if user is creating a post
  if (isUserAwaitingPost(userId)) {
    await handlePostCreation(ctx);
    return;
  }

  return next();
});

// Handle photo messages for post creation
bot.on('message:photo', async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();

  if (isUserAwaitingPost(userId)) {
    await handlePostCreation(ctx);
    return;
  }

  return next();
});

// Handle video messages for post creation
bot.on('message:video', async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();

  if (isUserAwaitingPost(userId)) {
    await handlePostCreation(ctx);
    return;
  }

  return next();
});

// Handle forwarded messages for channel addition
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

// Handle WebApp data (when user comes from mini app)
bot.on('message:web_app_data', async (ctx) => {
  const userId = ctx.from?.id;
  const locale = userId ? getUserLocale(userId) : 'ru';
  
  const receivedText = t(locale, 'bot.dataReceived');
  
  await ctx.reply(receivedText, {
    reply_markup: createMainMenuKeyboard(locale),
  });
});

// 🔒 ЗАДАЧА: Chat member events
bot.on('my_chat_member', handleMyChatMember);
bot.on('chat_member', handleChatMember);

// 🔒 ЗАДАЧА 1.13: /repost command — отправить розыгрыш по shortCode
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
    // Получаем данные розыгрыша по shortCode через API
    const res = await fetchWithTimeout(`${config.apiUrl}/internal/giveaways/by-code/${shortCode}`, {
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

    await ctx.reply(postText, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          {
            text: buttonLabel,
            web_app: { url: `${config.webappUrl}?startapp=g_${data.shortCode}` },
          },
        ]],
      },
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

// 🔒 ЗАДАЧА 1.19: Admin commands
bot.command('admin_ban', handleAdminBan);
bot.command('admin_unban', handleAdminUnban);
bot.command('admin_stats', handleAdminStats);
bot.command('admin_giveaway', handleAdminGiveaway);
bot.command('admin_broadcast', handleAdminBroadcast);
bot.command('admin_approve', handleAdminApprove);
bot.command('admin_reject', handleAdminReject);

// 🔒 ЗАДАЧА: Inline mode
bot.on('inline_query', handleInlineQuery);

// 🔒 ЗАДАЧА 6.4: Telegram Stars payments
registerPaymentHandlers(bot);

// Error handler
bot.catch((err) => {
  log.error({ err }, 'Bot error');
});
