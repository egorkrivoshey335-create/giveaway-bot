'use client';

import { useEffect } from 'react';

// Типы для Telegram WebApp API
interface SafeAreaInset {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface TelegramWebApp {
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  isFullscreen?: boolean;
  expand?: () => void;
  ready?: () => void;
  colorScheme?: 'light' | 'dark';
  themeParams?: {
    bg_color?: string;
    text_color?: string;
    hint_color?: string;
    link_color?: string;
    button_color?: string;
    button_text_color?: string;
    secondary_bg_color?: string;
    header_bg_color?: string;
    section_bg_color?: string;
  };
  safeAreaInset?: SafeAreaInset;
  contentSafeAreaInset?: SafeAreaInset;
  onEvent?: (event: string, callback: () => void) => void;
  offEvent?: (event: string, callback: () => void) => void;
  headerColor?: string;
  backgroundColor?: string;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
}

/**
 * Компонент для автоматического включения fullscreen режима в Telegram Mini App
 * и установки CSS переменных для Safe Area отступов
 */
export function FullscreenInit() {
  useEffect(() => {
    // Проверяем наличие Telegram WebApp API
    const tg = (window as unknown as { 
      Telegram?: { 
        WebApp?: TelegramWebApp;
      } 
    }).Telegram?.WebApp;

    if (!tg) return;

    // Функция для установки темы (dark/light)
    const updateTheme = () => {
      const root = document.documentElement;
      const isDark = tg.colorScheme === 'dark';
      
      // Установить data-theme для CSS
      root.setAttribute('data-theme', isDark ? 'dark' : 'light');
      
      // Установить класс dark для Tailwind
      if (isDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
      
      // Принудительно задаём брендовые цвета, перебивая любой кэш Telegram
      if (isDark) {
        root.style.setProperty('--tg-theme-bg-color', '#1a1216');
        root.style.setProperty('--tg-theme-text-color', '#f5e6e9');
        root.style.setProperty('--tg-theme-hint-color', '#9e7a82');
        root.style.setProperty('--tg-theme-link-color', '#f2b6b6');
        root.style.setProperty('--tg-theme-button-color', '#e89999');
        root.style.setProperty('--tg-theme-button-text-color', '#1a1216');
        root.style.setProperty('--tg-theme-secondary-bg-color', '#241a1e');
        root.style.setProperty('--tg-theme-header-bg-color', '#2a1d21');
        root.style.setProperty('--tg-theme-section-bg-color', '#201619');
      } else {
        root.style.setProperty('--tg-theme-bg-color', '#ffffff');
        root.style.setProperty('--tg-theme-text-color', '#000000');
        root.style.setProperty('--tg-theme-hint-color', '#999999');
        root.style.setProperty('--tg-theme-link-color', '#f2b6b6');
        root.style.setProperty('--tg-theme-button-color', '#f2b6b6');
        root.style.setProperty('--tg-theme-button-text-color', '#ffffff');
        root.style.setProperty('--tg-theme-secondary-bg-color', '#f7f7f7');
        root.style.setProperty('--tg-theme-header-bg-color', '#f2b6b6');
        root.style.setProperty('--tg-theme-section-bg-color', '#ffffff');
      }

      const headerColor = isDark ? '#2a1d21' : '#f2b6b6';
      const bgColor = isDark ? '#1a1216' : '#ffffff';
      
      try {
        if (tg.setHeaderColor) {
          tg.setHeaderColor(headerColor);
        } else if (tg.headerColor !== undefined) {
          tg.headerColor = headerColor;
        }

        if (tg.setBackgroundColor) {
          tg.setBackgroundColor(bgColor);
        } else if (tg.backgroundColor !== undefined) {
          tg.backgroundColor = bgColor;
        }
      } catch (err) {
        console.debug('Color setting not supported:', err);
      }
    };

    // Функция для обновления CSS переменных Safe Area
    const updateSafeAreaVariables = () => {
      const root = document.documentElement;
      
      // Safe Area Inset (отступы от краёв экрана устройства)
      const safeArea = tg.safeAreaInset || { top: 0, bottom: 0, left: 0, right: 0 };
      root.style.setProperty('--tg-safe-area-top', `${safeArea.top}px`);
      root.style.setProperty('--tg-safe-area-bottom', `${safeArea.bottom}px`);
      root.style.setProperty('--tg-safe-area-left', `${safeArea.left}px`);
      root.style.setProperty('--tg-safe-area-right', `${safeArea.right}px`);
      
      // Content Safe Area Inset (отступы от UI Telegram)
      const contentSafeArea = tg.contentSafeAreaInset || { top: 0, bottom: 0, left: 0, right: 0 };
      root.style.setProperty('--tg-content-safe-area-top', `${contentSafeArea.top}px`);
      root.style.setProperty('--tg-content-safe-area-bottom', `${contentSafeArea.bottom}px`);
      
      // Общий отступ сверху (сумма safe area + content safe area)
      const totalTop = safeArea.top + contentSafeArea.top;
      const totalBottom = safeArea.bottom + contentSafeArea.bottom;
      root.style.setProperty('--tg-header-height', `${Math.max(totalTop, 16)}px`);
      root.style.setProperty('--tg-footer-height', `${Math.max(totalBottom, 16)}px`);
    };

    // Сначала expand (для совместимости со старыми версиями)
    if (tg.expand) {
      tg.expand();
    }

    // Затем requestFullscreen (Bot API 8.0+)
    if (tg.requestFullscreen && !tg.isFullscreen) {
      try {
        tg.requestFullscreen();
      } catch (err) {
        console.warn('Fullscreen not supported:', err);
      }
    }

    // Установить тему на основе Telegram colorScheme
    updateTheme();

    // Сигнал готовности
    if (tg.ready) {
      tg.ready();
    }

    // Установить начальные значения Safe Area
    updateSafeAreaVariables();

    // Подписаться на события изменения Safe Area и темы
    if (tg.onEvent) {
      tg.onEvent('safeAreaChanged', updateSafeAreaVariables);
      tg.onEvent('contentSafeAreaChanged', updateSafeAreaVariables);
      tg.onEvent('fullscreenChanged', updateSafeAreaVariables);
      tg.onEvent('themeChanged', updateTheme);
    }

    // Отписаться при размонтировании
    return () => {
      if (tg.offEvent) {
        tg.offEvent('safeAreaChanged', updateSafeAreaVariables);
        tg.offEvent('contentSafeAreaChanged', updateSafeAreaVariables);
        tg.offEvent('fullscreenChanged', updateSafeAreaVariables);
        tg.offEvent('themeChanged', updateTheme);
      }
    };
  }, []);

  return null;
}
