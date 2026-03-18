/**
 * Хелперы для локализации бота
 */

import { messages, Locale } from './messages.js';
import { config } from '../config.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('i18n');
const DEFAULT_LOCALE_UPDATE_TIMEOUT_MS = 8000;

function getLocaleUpdateTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.BOT_INTERNAL_API_TIMEOUT_MS || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LOCALE_UPDATE_TIMEOUT_MS;
}

// Доступные локали
export const locales: Locale[] = ['ru', 'en', 'kk'];
export const defaultLocale: Locale = 'ru';

// Названия языков для UI
export const localeNames: Record<Locale, string> = {
  ru: '🇷🇺 Русский',
  en: '🇬🇧 English',
  kk: '🇰🇿 Қазақша',
};

// Маппинг языков Telegram на наши локали
const telegramLangMap: Record<string, Locale> = {
  ru: 'ru',
  en: 'en',
  kk: 'kk',
  uk: 'ru', // украинский → русский
  be: 'ru', // белорусский → русский
  uz: 'ru', // узбекский → русский
  ky: 'kk', // киргизский → казахский
};

// In-memory кэш локалей пользователей (для быстрого доступа)
const userLocaleCache = new Map<number, Locale>();

/**
 * Получить локаль пользователя (из кэша или дефолтную)
 */
export function getUserLocale(telegramUserId: number): Locale {
  return userLocaleCache.get(telegramUserId) || defaultLocale;
}

/**
 * Получить локаль из языка Telegram (для новых пользователей)
 */
export function getLocaleFromTelegram(langCode: string | undefined): Locale {
  if (!langCode) return defaultLocale;
  return telegramLangMap[langCode.toLowerCase()] || defaultLocale;
}

/**
 * Установить локаль пользователя в кэш
 */
export function setUserLocale(telegramUserId: number, locale: Locale): void {
  if (locales.includes(locale)) {
    userLocaleCache.set(telegramUserId, locale);
  }
}

/**
 * Обновить язык пользователя через API
 */
export async function updateUserLocale(telegramUserId: number, locale: Locale): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutMs = getLocaleUpdateTimeoutMs();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;

    try {
      response = await fetch(`${config.apiUrl}/internal/users/language`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': config.internalApiToken,
        },
        body: JSON.stringify({
          telegramUserId: telegramUserId.toString(),
          language: locale.toUpperCase(),
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.ok) {
      // Обновляем кэш
      setUserLocale(telegramUserId, locale);
      return true;
    }
    
    log.error({ status: response.status }, 'Failed to update user locale: API returned error');
    return false;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      log.warn('updateUserLocale timed out, using local cache');
    } else {
      log.error({ err }, 'Failed to update user locale');
    }
    // Всё равно обновляем локальный кэш
    setUserLocale(telegramUserId, locale);
    return true; // Возвращаем true, т.к. локально язык установлен
  }
}

/**
 * Получить перевод по ключу
 * 
 * @param locale - Локаль пользователя
 * @param key - Ключ перевода в формате 'section.key' (например, 'menu.openApp')
 * @param params - Параметры для подстановки (например, { title: 'Test' })
 * @returns Переведённая строка
 * 
 * @example
 * t('ru', 'welcome') // "👋 Добро пожаловать в RandomBeast!"
 * t('en', 'winner.congrats', { title: 'My Giveaway', place: 1, total: 3 })
 */
export function t(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>
): string {
  const keys = key.split('.');
  
  // Пытаемся найти перевод в запрошенной локали
  let value: unknown = messages[locale];
  for (const k of keys) {
    if (value && typeof value === 'object') {
      value = (value as Record<string, unknown>)[k];
    } else {
      value = undefined;
      break;
    }
  }

  // Если не нашли — fallback на русский
  if (typeof value !== 'string') {
    value = messages[defaultLocale];
    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = (value as Record<string, unknown>)[k];
      } else {
        value = undefined;
        break;
      }
    }
  }

  // Если всё ещё не нашли — возвращаем ключ
  if (typeof value !== 'string') {
    log.warn(`Translation not found: ${key}`);
    return key;
  }

  // Подставляем параметры
  if (params) {
    return value.replace(/\{(\w+)\}/g, (_, paramKey) => {
      const paramValue = params[paramKey];
      return paramValue !== undefined ? String(paramValue) : `{${paramKey}}`;
    });
  }

  return value;
}

// Re-export types
export type { Locale } from './messages.js';
