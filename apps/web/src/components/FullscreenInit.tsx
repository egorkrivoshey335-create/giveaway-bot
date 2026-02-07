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
  safeAreaInset?: SafeAreaInset;
  contentSafeAreaInset?: SafeAreaInset;
  onEvent?: (event: string, callback: () => void) => void;
  offEvent?: (event: string, callback: () => void) => void;
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

    // Установить начальные значения Safe Area
    updateSafeAreaVariables();

    // Подписаться на события изменения Safe Area
    if (tg.onEvent) {
      tg.onEvent('safeAreaChanged', updateSafeAreaVariables);
      tg.onEvent('contentSafeAreaChanged', updateSafeAreaVariables);
      tg.onEvent('fullscreenChanged', updateSafeAreaVariables);
    }

    // Отписаться при размонтировании
    return () => {
      if (tg.offEvent) {
        tg.offEvent('safeAreaChanged', updateSafeAreaVariables);
        tg.offEvent('contentSafeAreaChanged', updateSafeAreaVariables);
        tg.offEvent('fullscreenChanged', updateSafeAreaVariables);
      }
    };
  }, []);

  return null;
}
