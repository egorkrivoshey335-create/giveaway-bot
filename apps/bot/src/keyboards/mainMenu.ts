import { config } from '../config.js';
import { t, Locale } from '../i18n/index.js';
import {
  btn, webAppBtn, inlineKeyboard,
  replyBtn, replyKb,
} from '../lib/customEmoji.js';

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
 * Creates the main reply keyboard menu (styled pink / blue)
 */
export function createMainMenuKeyboard(locale: Locale = 'ru'): any {
  return replyKb([
    [replyBtn(t(locale, 'menu.openApp'), 'app', 'danger'), replyBtn(t(locale, 'menu.createGiveaway'), 'create', 'danger')],
    [replyBtn(t(locale, 'menu.myChannels'), 'channels', 'danger'), replyBtn(t(locale, 'menu.posts'), 'posts', 'danger')],
    [replyBtn(t(locale, 'menu.settings'), 'settings', 'danger'), replyBtn(t(locale, 'menu.support'), 'support', 'danger')],
  ]);
}

/**
 * Creates a submenu keyboard with Back and To Menu buttons
 */
export function createSubMenuKeyboard(locale: Locale = 'ru'): any {
  return replyKb([
    [replyBtn(t(locale, 'menu.back'), 'back', 'primary'), replyBtn(t(locale, 'menu.toMenu'), 'home', 'primary')],
  ]);
}

/**
 * Creates inline keyboard for WebApp button
 */
export function createWebAppInlineKeyboard(locale: Locale = 'ru'): any {
  return inlineKeyboard(
    [webAppBtn(t(locale, 'buttons.openApp'), config.webappUrl, 'app', 'danger')],
  );
}

/**
 * Creates inline keyboard for creating giveaway
 */
export function createGiveawayMethodKeyboard(locale: Locale = 'ru'): any {
  return inlineKeyboard(
    [webAppBtn(t(locale, 'wizard.inApp'), config.webappUrl, 'create', 'danger')],
    [btn(t(locale, 'wizard.inBotSoon'), 'create_in_bot', undefined, 'danger')],
  );
}

/**
 * Creates inline keyboard for continuing draft
 */
export function createContinueDraftKeyboard(draftId: string, locale: Locale = 'ru'): any {
  const webappUrlWithDraft = `${config.webappUrl}?startapp=draft_${draftId}`;
  return inlineKeyboard(
    [webAppBtn(t(locale, 'menu.continueDraft'), webappUrlWithDraft, 'create', 'danger')],
  );
}

/**
 * Creates inline keyboard for language selection only
 */
export function createLanguageKeyboard(): any {
  return inlineKeyboard(
    [btn('🇷🇺 Русский', 'lang_ru', 'lang_ru', 'primary'), btn('🇬🇧 English', 'lang_en', 'lang_en', 'primary'), btn('🇰🇿 Қазақша', 'lang_kk', 'lang_kk', 'primary')],
  );
}

const NOTIF_MODES: Array<{
  id: string;
  emoji: string;
  emojiName: string;
  label: Record<string, string>;
}> = [
  { id: 'MILESTONE', emoji: '🎯', emojiName: 'notif_milestone', label: { ru: 'Вехи', en: 'Milestones', kk: 'Белестер' } },
  { id: 'DAILY', emoji: '📅', emojiName: 'notif_daily', label: { ru: 'Ежедневно', en: 'Daily', kk: 'Күнделікті' } },
  { id: 'OFF', emoji: '🔕', emojiName: 'notif_off', label: { ru: 'Выкл', en: 'Off', kk: 'Өшіру' } },
];

/**
 * Full settings keyboard: languages + notification section + notification modes
 */
export function createSettingsKeyboard(locale: Locale, currentMode: string): any {
  const sectionLabel = locale === 'ru' ? '📢 Уведомления:' : locale === 'en' ? '📢 Notifications:' : '📢 Хабарландырулар:';

  const notifBtns = NOTIF_MODES.map(m => {
    const active = currentMode === m.id;
    const text = `${active ? '✅ ' : ''}${m.emoji} ${m.label[locale] || m.label.en}`;
    return btn(text, `notif_${m.id}`, m.emojiName, 'primary');
  });

  return inlineKeyboard(
    [btn('🇷🇺 Русский', 'lang_ru', 'lang_ru', 'primary'), btn('🇬🇧 English', 'lang_en', 'lang_en', 'primary'), btn('🇰🇿 Қазақша', 'lang_kk', 'lang_kk', 'primary')],
    [btn(sectionLabel, 'notif_section', 'notif', 'primary')],
    notifBtns,
  );
}

// ── Message helpers (unchanged) ─────────────────────────────────────────────

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

export function getWelcomeMessage(firstName: string, locale: Locale = 'ru'): string {
  return t(locale, 'welcome', { firstName });
}

export function getOpenAppMessage(locale: Locale = 'ru'): string {
  return t(locale, 'screens.openApp', { webappUrl: config.webappUrl });
}

export function getCreateGiveawayMessage(locale: Locale = 'ru'): string {
  return t(locale, 'screens.createGiveaway');
}

export function getSettingsMessage(locale: Locale = 'ru'): string {
  return t(locale, 'settings.title') + '\n\n' + t(locale, 'menu.selectLanguage');
}

export function getSupportMessage(locale: Locale = 'ru'): string {
  return t(locale, 'screens.support', { supportBot: config.supportBot });
}

export function getMainMenuMessage(locale: Locale = 'ru'): string {
  return t(locale, 'mainMenu');
}

export function getBackToMenuMessage(locale: Locale = 'ru'): string {
  return t(locale, 'backToMenu');
}

export function getCreateInBotSoonMessage(locale: Locale = 'ru'): string {
  return t(locale, 'screens.createInBotSoon');
}
