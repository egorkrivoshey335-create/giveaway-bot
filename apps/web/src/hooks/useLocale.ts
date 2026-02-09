'use client';

import { useEffect } from 'react';
import { Locale, defaultLocale, locales, telegramLangMap } from '@/i18n/config';
// Типы загружаются из @/types/telegram.d.ts

/**
 * Маппинг языка из БД (RU/EN/KK) на нашу локаль
 */
const dbLangMap: Record<string, Locale> = {
  RU: 'ru',
  EN: 'en',
  KK: 'kk',
};

/**
 * Хук для определения и установки локали из Telegram WebApp
 * Устанавливает cookie 'locale' для серверных компонентов.
 * Использует только Telegram language_code как fallback для первого визита,
 * если cookie ещё не установлена. Основной источник — язык из БД (syncLocaleFromDb).
 */
export function useTelegramLocale(): void {
  useEffect(() => {
    // Проверяем, есть ли уже cookie — если да, значит язык уже синхронизирован из БД
    const currentCookie = document.cookie
      .split('; ')
      .find(row => row.startsWith('locale='))
      ?.split('=')[1];

    if (currentCookie && locales.includes(currentCookie as Locale)) {
      // Cookie уже есть — не перезаписываем Telegram'ом
      return;
    }

    // Cookie нет — ставим из Telegram language_code как начальное значение
    const tg = window.Telegram?.WebApp;
    const userLang = tg?.initDataUnsafe?.user?.language_code;

    if (userLang) {
      const mappedLocale = telegramLangMap[userLang.toLowerCase()];
      const locale: Locale = mappedLocale && locales.includes(mappedLocale) 
        ? mappedLocale 
        : defaultLocale;

      document.cookie = `locale=${locale}; path=/; max-age=${60 * 60 * 24 * 365}`;
      window.location.reload();
    }
  }, []);
}

/**
 * Синхронизирует locale cookie на основе языка пользователя из БД.
 * Вызывать после успешной авторизации, когда известен user.language.
 */
export function syncLocaleFromDb(dbLanguage: string): void {
  const mapped = dbLangMap[dbLanguage];
  const locale: Locale = mapped && locales.includes(mapped) ? mapped : defaultLocale;

  // Проверяем текущую cookie
  const currentCookie = document.cookie
    .split('; ')
    .find(row => row.startsWith('locale='))
    ?.split('=')[1];

  // Обновляем cookie и перезагружаем только если язык изменился
  if (currentCookie !== locale) {
    document.cookie = `locale=${locale}; path=/; max-age=${60 * 60 * 24 * 365}`;
    window.location.reload();
  }
}

/**
 * Установить локаль вручную (для настроек)
 */
export function setLocale(locale: Locale): void {
  if (locales.includes(locale)) {
    document.cookie = `locale=${locale}; path=/; max-age=${60 * 60 * 24 * 365}`;
    window.location.reload();
  }
}

/**
 * Получить текущую локаль из cookie (клиентская сторона)
 */
export function getCurrentLocale(): Locale {
  if (typeof document === 'undefined') return defaultLocale;
  
  const cookie = document.cookie
    .split('; ')
    .find(row => row.startsWith('locale='))
    ?.split('=')[1] as Locale | undefined;

  return cookie && locales.includes(cookie) ? cookie : defaultLocale;
}
