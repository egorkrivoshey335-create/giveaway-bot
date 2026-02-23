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
} from './handlers/admin.js';
import { handleInlineQuery } from './handlers/inline.js';
import { registerPaymentHandlers } from './handlers/payments.js';

const log = createLogger('bot');

// This module should only be imported when BOT_TOKEN is available
if (!config.botToken) {
  throw new Error('bot.ts should only be imported when BOT_TOKEN is set');
}

// Create bot instance
export const bot = new Bot(config.botToken);

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

  // Устанавливаем Menu Button на языке пользователя
  try {
    await ctx.api.setChatMenuButton({
      chat_id: userId,
      menu_button: {
        type: 'web_app',
        text: t(locale, 'buttons.menuButton'),
        web_app: { url: config.webappUrl },
      },
    });
  } catch {
    // Не критично
  }

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

  // Получаем текущий язык пользователя
  const locale = ctx.from?.id ? getUserLocale(ctx.from.id) : 'ru';

  await ctx.reply(getSettingsMessage(locale), {
    reply_markup: createLanguageKeyboard(),
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
    try {
      await ctx.api.setChatMenuButton({
        chat_id: userId,
        menu_button: {
          type: 'web_app',
          text: t(lang, 'buttons.menuButton'),
          web_app: { url: config.webappUrl },
        },
      });
    } catch {
      // Игнорируем — не критично
    }

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

// 🔒 ЗАДАЧА: Admin commands
bot.command('admin_ban', handleAdminBan);
bot.command('admin_unban', handleAdminUnban);
bot.command('admin_stats', handleAdminStats);
bot.command('admin_giveaway', handleAdminGiveaway);
bot.command('admin_broadcast', handleAdminBroadcast);

// 🔒 ЗАДАЧА: Inline mode
bot.on('inline_query', handleInlineQuery);

// 🔒 ЗАДАЧА 6.4: Telegram Stars payments
registerPaymentHandlers(bot);

// Error handler
bot.catch((err) => {
  log.error({ err }, 'Bot error');
});
