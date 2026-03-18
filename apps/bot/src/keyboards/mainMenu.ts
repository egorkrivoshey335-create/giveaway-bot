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
  const inAppText = t(locale, 'wizard.inApp');
  const inBotText = t(locale, 'wizard.inBotSoon');
  
  return new InlineKeyboard()
    .webApp(inAppText, config.webappUrl).row()
    .text(inBotText, 'create_in_bot');
}

/**
 * Creates inline keyboard for continuing draft
 */
export function createContinueDraftKeyboard(draftId: string, locale: Locale = 'ru'): InlineKeyboard {
  const webappUrlWithDraft = `${config.webappUrl}?startapp=draft_${draftId}`;
  const text = t(locale, 'menu.continueDraft');
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
 * Creates inline keyboard for notification mode selection
 */
export function createNotificationKeyboard(currentMode: string, locale: Locale = 'ru'): InlineKeyboard {
  const modes = [
    { id: 'MILESTONE', label: '🎯 Milestone', desc: { ru: 'Вехи (10/50/100/500)', en: 'Milestones (10/50/100/500)', kk: 'Белестер (10/50/100/500)' } },
    { id: 'DAILY', label: '📅 Daily', desc: { ru: 'Ежедневная сводка', en: 'Daily summary', kk: 'Күнделікті жиынтық' } },
    { id: 'OFF', label: '🔕 Off', desc: { ru: 'Выключить', en: 'Disabled', kk: 'Өшіру' } },
  ];

  const kb = new InlineKeyboard();
  for (const mode of modes) {
    const isActive = currentMode === mode.id;
    const label = `${isActive ? '✅ ' : ''}${mode.label} — ${mode.desc[locale]}`;
    kb.text(label, `notif_${mode.id}`).row();
  }
  return kb;
}

/**
 * Settings message with notification mode section
 */
export function getSettingsWithNotificationsMessage(locale: Locale, notificationMode: string): string {
  const modeLabels: Record<string, Record<string, string>> = {
    MILESTONE: { ru: 'Вехи (10/50/100/500)', en: 'Milestones (10/50/100/500)', kk: 'Белестер (10/50/100/500)' },
    DAILY: { ru: 'Ежедневная сводка', en: 'Daily summary', kk: 'Күнделікті жиынтық' },
    OFF: { ru: 'Выключены', en: 'Disabled', kk: 'Өшірулі' },
  };

  const currentModeLabel = modeLabels[notificationMode]?.[locale] || notificationMode;

  if (locale === 'ru') {
    return `⚙️ <b>Настройки</b>\n\n🌐 <b>Язык интерфейса:</b>\n\n📢 <b>Уведомления создателя:</b>\nТекущий режим: <b>${currentModeLabel}</b>`;
  } else if (locale === 'en') {
    return `⚙️ <b>Settings</b>\n\n🌐 <b>Interface language:</b>\n\n📢 <b>Creator notifications:</b>\nCurrent mode: <b>${currentModeLabel}</b>`;
  } else {
    return `⚙️ <b>Баптаулар</b>\n\n🌐 <b>Интерфейс тілі:</b>\n\n📢 <b>Автор хабарландырулары:</b>\nАғымдағы режим: <b>${currentModeLabel}</b>`;
  }
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
  return t(locale, 'settings.title') + '\n\n' + t(locale, 'menu.selectLanguage');
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
