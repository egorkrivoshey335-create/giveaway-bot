/**
 * Конфигурация локализации
 */

export const locales = ['ru', 'en', 'kk'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'ru';

export const localeNames: Record<Locale, string> = {
  ru: '🇷🇺 Русский',
  en: '🇬🇧 English',
  kk: '🇰🇿 Қазақша',
};

/**
 * Маппинг языков Telegram на наши локали
 */
export const telegramLangMap: Record<string, Locale> = {
  ru: 'ru',
  en: 'en',
  kk: 'kk',
  uk: 'ru', // украинский → русский
  be: 'ru', // белорусский → русский
  uz: 'ru', // узбекский → русский
  ky: 'kk', // киргизский → казахский
};

/**
 * Получить локаль из языка Telegram
 */
export function getLocaleFromTelegram(langCode: string | undefined): Locale {
  if (!langCode) return defaultLocale;
  return telegramLangMap[langCode.toLowerCase()] || defaultLocale;
}
