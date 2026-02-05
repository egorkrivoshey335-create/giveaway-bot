'use client';

import { useEffect } from 'react';
import { Locale, defaultLocale, locales, telegramLangMap } from '@/i18n/config';
// Типы загружаются из @/types/telegram.d.ts

/**
 * Хук для определения и установки локали из Telegram WebApp
 * Устанавливает cookie 'locale' для серверных компонентов
 */
export function useTelegramLocale(): void {
  useEffect(() => {
    // Получаем язык из Telegram WebApp
    const tg = window.Telegram?.WebApp;
    const userLang = tg?.initDataUnsafe?.user?.language_code;

    if (userLang) {
      // Маппим язык Telegram на нашу локаль
      const mappedLocale = telegramLangMap[userLang.toLowerCase()];
      const locale: Locale = mappedLocale && locales.includes(mappedLocale) 
        ? mappedLocale 
        : defaultLocale;

      // Проверяем текущую cookie
      const currentCookie = document.cookie
        .split('; ')
        .find(row => row.startsWith('locale='))
        ?.split('=')[1];

      // Устанавливаем cookie только если отличается
      if (currentCookie !== locale) {
        document.cookie = `locale=${locale}; path=/; max-age=${60 * 60 * 24 * 365}`; // 1 год
        // Перезагружаем для применения новой локали
        window.location.reload();
      }
    }
  }, []);
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
