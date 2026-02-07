'use client';

import { useEffect } from 'react';

/**
 * Компонент для автоматического включения fullscreen режима в Telegram Mini App
 * Вызывает requestFullscreen() при загрузке приложения
 */
export function FullscreenInit() {
  useEffect(() => {
    // Проверяем наличие Telegram WebApp API
    const tg = (window as unknown as { 
      Telegram?: { 
        WebApp?: { 
          requestFullscreen?: () => void;
          isFullscreen?: boolean;
          expand?: () => void;
        } 
      } 
    }).Telegram?.WebApp;

    if (tg) {
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
    }
  }, []);

  return null;
}
