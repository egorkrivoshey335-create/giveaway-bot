import { Keyboard, InlineKeyboard } from 'grammy';
import { config } from '../config.js';

/**
 * Menu button labels
 */
export const MENU = {
  OPEN_APP: '📱 Открыть приложение',
  CREATE_GIVEAWAY: '🎁 Создать розыгрыш',
  MY_CHANNELS: '📣 Мои каналы',
  MY_POSTS: '📝 Посты',
  SETTINGS: '⚙️ Настройки',
  SUPPORT: '🆘 Поддержка',
  BACK: '◀️ Назад',
  TO_MENU: '🏠 В меню',
} as const;

/**
 * Creates the main reply keyboard menu
 */
export function createMainMenuKeyboard(): Keyboard {
  return new Keyboard()
    .text(MENU.OPEN_APP).text(MENU.CREATE_GIVEAWAY).row()
    .text(MENU.MY_CHANNELS).text(MENU.MY_POSTS).row()
    .text(MENU.SETTINGS).text(MENU.SUPPORT)
    .resized()
    .persistent();
}

/**
 * Creates a submenu keyboard with Back and To Menu buttons
 */
export function createSubMenuKeyboard(): Keyboard {
  return new Keyboard()
    .text(MENU.BACK).text(MENU.TO_MENU)
    .resized();
}

/**
 * Creates inline keyboard for WebApp button
 */
export function createWebAppInlineKeyboard(text: string = '📱 Открыть приложение'): InlineKeyboard {
  return new InlineKeyboard().webApp(text, config.webappUrl);
}

/**
 * Creates inline keyboard for creating giveaway
 */
export function createGiveawayMethodKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .webApp('📱 В приложении', config.webappUrl).row()
    .text('🤖 В боте (скоро)', 'create_in_bot');
}

/**
 * Creates inline keyboard for continuing draft
 */
export function createContinueDraftKeyboard(draftId: string): InlineKeyboard {
  // Use startapp parameter for deep linking
  const webappUrlWithDraft = `${config.webappUrl}?startapp=draft_${draftId}`;
  return new InlineKeyboard()
    .webApp('📱 Продолжить создание', webappUrlWithDraft);
}

/**
 * Creates inline keyboard for language selection
 */
export function createLanguageKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🇷🇺 Русский', 'lang_ru')
    .text('🇬🇧 English', 'lang_en')
    .text('🇰🇿 Қазақша', 'lang_kk');
}

/**
 * Welcome message for /start command
 */
export function getWelcomeMessage(firstName: string): string {
  return `👋 Привет, <b>${firstName}</b>!

Я — <b>RandomBeast</b>, бот для проведения честных розыгрышей в Telegram.

🎁 С моей помощью ты можешь:
• Создавать розыгрыши с гибкими условиями
• Проверять подписку участников
• Выбирать победителей честным рандомом

Выбери нужный пункт в меню 👇`;
}

/**
 * Message for "Open app" menu item
 */
export function getOpenAppMessage(): string {
  return `📱 <b>Приложение RandomBeast</b>

Нажмите кнопку ниже, чтобы открыть Mini App.

Вы также можете перейти по ссылке:
${config.webappUrl}`;
}

/**
 * Message for "Create giveaway" menu item
 */
export function getCreateGiveawayMessage(): string {
  return `🎁 <b>Создание розыгрыша</b>

Выберите способ создания:

📱 <b>В приложении</b> — удобный визуальный мастер с превью
🤖 <b>В боте</b> — пошаговое создание в чате (скоро)`;
}

/**
 * Message for "My channels" menu item
 */
export function getMyChannelsMessage(): string {
  return `📣 <b>Мои каналы</b>

Здесь будет список подключённых каналов.

Чтобы добавить канал:
1. Сделайте бота @${config.botToken ? 'BeastRandomBot' : 'вашего_бота'} администратором канала
2. Перешлите сюда любое сообщение из канала или пришлите @username канала

<i>Функционал в разработке</i>`;
}

/**
 * Message for "Settings" menu item
 */
export function getSettingsMessage(): string {
  return `⚙️ <b>Настройки</b>

Выберите язык интерфейса:`;
}

/**
 * Message for "Support" menu item
 */
export function getSupportMessage(): string {
  return `🆘 <b>Поддержка</b>

Если у вас возникли вопросы или проблемы, напишите в поддержку:

👤 ${config.supportBot}

Мы обычно отвечаем в течение 24 часов.

📚 Также вы можете ознакомиться с FAQ в нашем приложении.`;
}
