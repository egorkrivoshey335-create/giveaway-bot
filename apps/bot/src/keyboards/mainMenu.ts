import { Keyboard, InlineKeyboard } from 'grammy';
import { config } from '../config.js';
import { t, Locale } from '../i18n/index.js';

/**
 * Menu button labels (для matching в bot.hears)
 * Содержит все варианты на всех языках
 */
export const MENU: Record<string, string[]> = {
  OPEN_APP: ['📱 Открыть приложение', '📱 Open App', '📱 Қолданбаны ашу'],
  CREATE_GIVEAWAY: ['🎁 Создать розыгрыш', '🎁 Create Giveaway', '🎁 Ұтыс ойынын құру'],
  MY_CHANNELS: ['📣 Мои каналы', '📣 My Channels', '📣 Менің арналарым'],
  MY_POSTS: ['📝 Посты', '📝 Posts', '📝 Жазбалар'],
  SETTINGS: ['⚙️ Настройки', '⚙️ Settings', '⚙️ Баптаулар'],
  SUPPORT: ['🆘 Поддержка', '🆘 Support', '🆘 Қолдау'],
  BACK: ['◀️ Назад', '◀️ Back', '◀️ Артқа'],
  TO_MENU: ['🏠 В меню', '🏠 Menu', '🏠 Мәзір'],
};

/**
 * Creates the main reply keyboard menu
 */
export function createMainMenuKeyboard(locale: Locale = 'ru'): Keyboard {
  return new Keyboard()
    .text(t(locale, 'menu.openApp')).text(t(locale, 'menu.createGiveaway')).row()
    .text(t(locale, 'menu.myChannels')).text(t(locale, 'menu.posts')).row()
    .text(t(locale, 'menu.settings')).text(t(locale, 'menu.support'))
    .resized()
    .persistent();
}

/**
 * Creates a submenu keyboard with Back and To Menu buttons
 */
export function createSubMenuKeyboard(locale: Locale = 'ru'): Keyboard {
  return new Keyboard()
    .text(t(locale, 'menu.back')).text(t(locale, 'menu.toMenu'))
    .resized();
}

/**
 * Creates inline keyboard for WebApp button
 */
export function createWebAppInlineKeyboard(locale: Locale = 'ru'): InlineKeyboard {
  return new InlineKeyboard().webApp(t(locale, 'buttons.openApp'), config.webappUrl);
}

/**
 * Creates inline keyboard for creating giveaway
 */
export function createGiveawayMethodKeyboard(locale: Locale = 'ru'): InlineKeyboard {
  const inAppText = locale === 'ru' ? '📱 В приложении' : locale === 'en' ? '📱 In App' : '📱 Қолданбада';
  const inBotText = locale === 'ru' ? '🤖 В боте (скоро)' : locale === 'en' ? '🤖 In Bot (soon)' : '🤖 Ботта (жақында)';
  
  return new InlineKeyboard()
    .webApp(inAppText, config.webappUrl).row()
    .text(inBotText, 'create_in_bot');
}

/**
 * Creates inline keyboard for continuing draft
 */
export function createContinueDraftKeyboard(draftId: string, locale: Locale = 'ru'): InlineKeyboard {
  const webappUrlWithDraft = `${config.webappUrl}?startapp=draft_${draftId}`;
  const text = locale === 'ru' ? '📱 Продолжить создание' : locale === 'en' ? '📱 Continue creation' : '📱 Құруды жалғастыру';
  return new InlineKeyboard()
    .webApp(text, webappUrlWithDraft);
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
export function getWelcomeMessage(firstName: string, locale: Locale = 'ru'): string {
  return t(locale, 'welcome', { firstName });
}

/**
 * Message for "Open app" menu item
 */
export function getOpenAppMessage(locale: Locale = 'ru'): string {
  return t(locale, 'screens.openApp', { webappUrl: config.webappUrl });
}

/**
 * Message for "Create giveaway" menu item
 */
export function getCreateGiveawayMessage(locale: Locale = 'ru'): string {
  return t(locale, 'screens.createGiveaway');
}

/**
 * Message for "Settings" menu item
 */
export function getSettingsMessage(locale: Locale = 'ru'): string {
  return t(locale, 'settings.title') + '\n\n' + (
    locale === 'ru' ? 'Выберите язык интерфейса:' :
    locale === 'en' ? 'Select interface language:' :
    'Интерфейс тілін таңдаңыз:'
  );
}

/**
 * Message for "Support" menu item
 */
export function getSupportMessage(locale: Locale = 'ru'): string {
  return t(locale, 'screens.support', { supportBot: config.supportBot });
}

/**
 * Main menu message
 */
export function getMainMenuMessage(locale: Locale = 'ru'): string {
  return t(locale, 'mainMenu');
}

/**
 * Back to menu message
 */
export function getBackToMenuMessage(locale: Locale = 'ru'): string {
  return t(locale, 'backToMenu');
}

/**
 * Create in bot soon message
 */
export function getCreateInBotSoonMessage(locale: Locale = 'ru'): string {
  return t(locale, 'screens.createInBotSoon');
}
