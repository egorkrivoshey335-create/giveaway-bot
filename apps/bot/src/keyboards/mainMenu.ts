import { config } from '../config.js';
import { t, Locale } from '../i18n/index.js';
import {
  btn, webAppBtn, inlineKeyboard,
  replyBtn, replyKb,
} from '../lib/customEmoji.js';

/**
 * Strip leading non-letter/non-digit chars (emoji + spaces).
 * Used to create bot.hears patterns that work both with and without
 * Unicode emoji prefix (when icon_custom_emoji_id replaces it).
 */
function strip(s: string): string {
  return s.replace(/^[^\p{L}\p{N}]+/u, '');
}

function withStripped(texts: string[]): string[] {
  const set = new Set<string>();
  for (const t of texts) { set.add(t); set.add(strip(t)); }
  return [...set];
}

/**
 * Menu button labels (для matching в bot.hears)
 * Содержит все варианты на всех языках (с эмодзи и без — для совместимости)
 */
export const MENU: Record<string, string[]> = {
  OPEN_APP: withStripped(['📱 Открыть приложение', '📱 Open App', '📱 Қолданбаны ашу']),
  CREATE_GIVEAWAY: withStripped(['🎁 Создать розыгрыш', '🎁 Create Giveaway', '🎁 Ұтыс ойынын құру']),
  MY_CHANNELS: withStripped(['📣 Мои каналы', '📣 My Channels', '📣 Менің арналарым']),
  MY_POSTS: withStripped(['📝 Посты', '📝 Posts', '📝 Жазбалар']),
  SETTINGS: withStripped(['⚙️ Настройки', '⚙️ Settings', '⚙️ Баптаулар']),
  SUPPORT: withStripped(['🆘 Поддержка', '🆘 Support', '🆘 Қолдау']),
  BACK: withStripped(['◀️ Назад', '◀️ Back', '◀️ Артқа']),
  TO_MENU: withStripped(['🏠 В меню', '🏠 Menu', '🏠 Мәзір']),
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
    [btn(t(locale, 'wizard.inBotSoon'), 'create_in_bot', 'create_bot', 'danger')],
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
 * Main settings keyboard: two buttons — Language and Notifications
 */
export function createSettingsMainKeyboard(locale: Locale): any {
  const langLabel = locale === 'ru' ? '🌐 Язык' : locale === 'en' ? '🌐 Language' : '🌐 Тіл';
  const notifLabel = locale === 'ru' ? '🔔 Уведомления' : locale === 'en' ? '🔔 Notifications' : '🔔 Хабарландырулар';

  return inlineKeyboard(
    [btn(langLabel, 'settings_language', 'lang', 'primary'), btn(notifLabel, 'settings_notifications', 'notif', 'primary')],
  );
}

/**
 * Creates inline keyboard for language selection with back button
 */
export function createLanguageKeyboard(locale: Locale): any {
  const backLabel = locale === 'ru' ? '◀️ Назад' : locale === 'en' ? '◀️ Back' : '◀️ Артқа';

  return inlineKeyboard(
    [btn('🇷🇺 Русский', 'lang_ru', 'lang_ru', 'primary'), btn('🇬🇧 English', 'lang_en', 'lang_en', 'primary'), btn('🇰🇿 Қазақша', 'lang_kk', 'lang_kk', 'primary')],
    [btn(backLabel, 'settings_back', 'back', 'primary')],
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
 * Notifications keyboard: mode selection + back button
 */
export function createNotificationsKeyboard(locale: Locale, currentMode: string): any {
  const backLabel = locale === 'ru' ? '◀️ Назад' : locale === 'en' ? '◀️ Back' : '◀️ Артқа';

  const notifBtns = NOTIF_MODES.map(m => {
    const active = currentMode === m.id;
    const text = `${active ? '✅ ' : ''}${m.emoji} ${m.label[locale] || m.label.en}`;
    return btn(text, `notif_${m.id}`, m.emojiName, 'primary');
  });

  return inlineKeyboard(
    notifBtns,
    [btn(backLabel, 'settings_back', 'back', 'primary')],
  );
}

// ── Message helpers ─────────────────────────────────────────────────────────

export function getSettingsMainMessage(locale: Locale): string {
  if (locale === 'ru') {
    return `⚙️ <b>Настройки</b>\n\nВыберите, что хотите настроить:`;
  } else if (locale === 'en') {
    return `⚙️ <b>Settings</b>\n\nChoose what to configure:`;
  } else {
    return `⚙️ <b>Баптаулар</b>\n\nНені баптағыңыз келеді:`;
  }
}

export function getLanguageSettingsMessage(locale: Locale): string {
  if (locale === 'ru') {
    return `🌐 <b>Язык интерфейса</b>\n\nВыберите язык:`;
  } else if (locale === 'en') {
    return `🌐 <b>Interface language</b>\n\nSelect language:`;
  } else {
    return `🌐 <b>Интерфейс тілі</b>\n\nТілді таңдаңыз:`;
  }
}

export function getNotificationSettingsMessage(locale: Locale, notificationMode: string): string {
  const modeLabels: Record<string, Record<string, string>> = {
    MILESTONE: { ru: 'Вехи (при 10, 50, 100, 500 участниках)', en: 'Milestones (at 10, 50, 100, 500 participants)', kk: 'Белестер (10, 50, 100, 500 қатысушыда)' },
    DAILY: { ru: 'Ежедневная сводка', en: 'Daily summary', kk: 'Күнделікті жиынтық' },
    OFF: { ru: 'Выключены', en: 'Disabled', kk: 'Өшірулі' },
  };

  const currentModeLabel = modeLabels[notificationMode]?.[locale] || notificationMode;

  if (locale === 'ru') {
    return `🔔 <b>Уведомления создателя</b>\n\nТекущий режим: <b>${currentModeLabel}</b>\n\nВыберите режим уведомлений:\n\n🎯 <b>Вехи</b> — уведомления при достижении отметок участников: 10, 50, 100, 500\n📅 <b>Ежедневно</b> — сводка по вашим розыгрышам каждый день\n🔕 <b>Выкл</b> — не получать уведомления о розыгрышах`;
  } else if (locale === 'en') {
    return `🔔 <b>Creator notifications</b>\n\nCurrent mode: <b>${currentModeLabel}</b>\n\nSelect notification mode:\n\n🎯 <b>Milestones</b> — get notified when participants reach milestones: 10, 50, 100, 500\n📅 <b>Daily</b> — daily summary of your giveaways\n🔕 <b>Off</b> — no giveaway notifications`;
  } else {
    return `🔔 <b>Автор хабарландырулары</b>\n\nАғымдағы режим: <b>${currentModeLabel}</b>\n\nХабарландыру режимін таңдаңыз:\n\n🎯 <b>Белестер</b> — қатысушылар белестерге жеткенде хабарландыру: 10, 50, 100, 500\n📅 <b>Күнделікті</b> — ұтыс ойындары бойынша күнделікті жиынтық\n🔕 <b>Өшіру</b> — ұтыс ойындары туралы хабарландырмау`;
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
