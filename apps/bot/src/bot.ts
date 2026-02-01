import { Bot, InlineKeyboard } from 'grammy';
import { config } from './config.js';
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

// This module should only be imported when BOT_TOKEN is available
if (!config.botToken) {
  throw new Error('bot.ts should only be imported when BOT_TOKEN is set');
}

// Create bot instance
export const bot = new Bot(config.botToken);

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
  const firstName = ctx.from?.first_name || 'друг';

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
      
      const keyboard = new InlineKeyboard()
        .webApp('🎁 Участвовать в розыгрыше', webAppUrl);
      
      await ctx.reply(
        '🎉 <b>Отлично!</b>\n\nНажмите кнопку ниже, чтобы принять участие в розыгрыше:',
        {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        }
      );
      return;
    }

    // Handle add_channel - открыть меню добавления канала
    if (startParam === 'add_channel') {
      const keyboard = new InlineKeyboard()
        .text('➕ Добавить канал', 'menu_add_channel')
        .row()
        .text('➕ Добавить группу', 'menu_add_group')
        .row()
        .webApp('📱 Открыть приложение', config.webappUrl + '/creator/channels');
      
      await ctx.reply(
        '📣 <b>Добавление канала</b>\n\n' +
        'Выберите тип:\n' +
        '• <b>Канал</b> — для публикации розыгрышей и проверки подписки\n' +
        '• <b>Группа</b> — для проверки подписки участников\n\n' +
        '⚠️ Бот должен быть админом канала/группы с правами на публикацию.',
        {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        }
      );
      return;
    }
  }

  // Default welcome message
  const keyboard = createMainMenuKeyboard();

  if (ctx.from) {
    clearMenuStack(ctx.from.id);
    pushMenu(ctx.from.id, 'main');
    clearAllUserStates(ctx.from.id);
  }

  await ctx.reply(getWelcomeMessage(firstName), {
    reply_markup: keyboard,
    parse_mode: 'HTML',
  });
});

// Handle /help command
bot.command('help', async (ctx) => {
  await ctx.reply(
    `❓ <b>Помощь</b>

Команды:
/start — Начать работу с ботом
/help — Показать эту справку
/cancel — Отменить текущую операцию

Используйте меню для навигации 👇`,
    {
      reply_markup: createMainMenuKeyboard(),
      parse_mode: 'HTML',
    }
  );
});

// Handle /cancel command
bot.command('cancel', async (ctx) => {
  const userId = ctx.from?.id;
  if (userId) {
    clearAllUserStates(userId);
  }
  await ctx.reply('❌ Операция отменена.', {
    reply_markup: createMainMenuKeyboard(),
  });
});

// Handle "Open app" button
bot.hears(MENU.OPEN_APP, async (ctx) => {
  if (ctx.from) {
    pushMenu(ctx.from.id, 'open_app');
    clearAllUserStates(ctx.from.id);
  }

  await ctx.reply(getOpenAppMessage(), {
    reply_markup: createWebAppInlineKeyboard(),
    parse_mode: 'HTML',
  });
});

// Handle "Create giveaway" button
bot.hears(MENU.CREATE_GIVEAWAY, async (ctx) => {
  if (ctx.from) {
    pushMenu(ctx.from.id, 'create_giveaway');
    clearAllUserStates(ctx.from.id);
  }

  await ctx.reply(getCreateGiveawayMessage(), {
    reply_markup: createGiveawayMethodKeyboard(),
    parse_mode: 'HTML',
  });
});

// Handle "My channels" button
bot.hears(MENU.MY_CHANNELS, async (ctx) => {
  if (ctx.from) {
    pushMenu(ctx.from.id, 'my_channels');
    clearAllUserStates(ctx.from.id);
  }

  await ctx.reply(getChannelsMessage(), {
    reply_markup: createChannelManagementKeyboard(),
    parse_mode: 'HTML',
  });
});

// Handle "My posts" button
bot.hears(MENU.MY_POSTS, async (ctx) => {
  if (ctx.from) {
    pushMenu(ctx.from.id, 'my_posts');
    clearAllUserStates(ctx.from.id);
  }

  await ctx.reply(getPostsMessage(), {
    reply_markup: createPostsKeyboard(),
    parse_mode: 'HTML',
  });
});

// Handle "Settings" button
bot.hears(MENU.SETTINGS, async (ctx) => {
  if (ctx.from) {
    pushMenu(ctx.from.id, 'settings');
    clearAllUserStates(ctx.from.id);
  }

  await ctx.reply(getSettingsMessage(), {
    reply_markup: createLanguageKeyboard(),
    parse_mode: 'HTML',
  });
});

// Handle "Support" button
bot.hears(MENU.SUPPORT, async (ctx) => {
  if (ctx.from) {
    pushMenu(ctx.from.id, 'support');
    clearAllUserStates(ctx.from.id);
  }

  await ctx.reply(getSupportMessage(), {
    reply_markup: createSubMenuKeyboard(),
    parse_mode: 'HTML',
  });
});

// Handle "Back" button
bot.hears(MENU.BACK, async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  popMenu(userId);
  clearAllUserStates(userId);

  // Go back to main menu for simplicity
  await ctx.reply('⬅️ Главное меню', {
    reply_markup: createMainMenuKeyboard(),
    parse_mode: 'HTML',
  });
});

// Handle "To menu" button
bot.hears(MENU.TO_MENU, async (ctx) => {
  if (ctx.from) {
    clearMenuStack(ctx.from.id);
    pushMenu(ctx.from.id, 'main');
    clearAllUserStates(ctx.from.id);
  }

  await ctx.reply('🏠 Главное меню\n\nВыберите нужный пункт 👇', {
    reply_markup: createMainMenuKeyboard(),
    parse_mode: 'HTML',
  });
});

// Handle inline button "Create in bot" (stub)
bot.callbackQuery('create_in_bot', async (ctx) => {
  await ctx.answerCallbackQuery({
    text: '🔜 Создание в боте скоро будет доступно!',
    show_alert: true,
  });
});

// Handle language selection callbacks
bot.callbackQuery(/^lang_/, async (ctx) => {
  const lang = ctx.callbackQuery.data.replace('lang_', '');
  const langNames: Record<string, string> = {
    ru: '🇷🇺 Русский',
    en: '🇬🇧 English',
    kk: '🇰🇿 Қазақша',
  };

  await ctx.answerCallbackQuery({
    text: `Язык выбран: ${langNames[lang] || lang}\n(Сохранение в разработке)`,
    show_alert: true,
  });
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
  console.log('Received web_app_data:', ctx.message.web_app_data);
  await ctx.reply('Данные получены!', {
    reply_markup: createMainMenuKeyboard(),
  });
});

// Error handler
bot.catch((err) => {
  console.error('Bot error:', err);
});
