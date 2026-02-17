/**
 * i18n configuration for site (landing + winner-show)
 */

export const locales = ['ru', 'en', 'kk'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'ru';

export const localeNames: Record<Locale, string> = {
  ru: 'Русский',
  en: 'English',
  kk: 'Қазақша',
};

/**
 * Map Telegram language codes to our locales
 */
export const telegramLangMap: Record<string, Locale> = {
  ru: 'ru',
  en: 'en',
  kk: 'kk',
  // Fallback для близких языков
  uk: 'ru', // украинский → русский
  be: 'ru', // белорусский → русский
  uz: 'ru', // узбекский → русский
  ky: 'kk', // киргизский → казахский
};
