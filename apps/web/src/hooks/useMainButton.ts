'use client';

import { useEffect, useCallback, useRef } from 'react';

interface MainButtonParams {
  text: string;
  color?: string;
  textColor?: string;
  isActive?: boolean;
  isVisible?: boolean;
}

/**
 * Hook для работы с Telegram WebApp MainButton
 * 
 * @example
 * ```tsx
 * const mainButton = useMainButton();
 * 
 * useEffect(() => {
 *   if (isFormValid) {
 *     mainButton.show('Создать розыгрыш', handleSubmit);
 *   } else {
 *     mainButton.hide();
 *   }
 * }, [isFormValid]);
 * ```
 */
export function useMainButton() {
  const callbackRef = useRef<(() => void) | null>(null);

  const show = useCallback((text: string, onClick: () => void, params?: Partial<MainButtonParams>) => {
    const tg = window.Telegram?.WebApp;
    if (!tg?.MainButton) return;

    callbackRef.current = onClick;

    tg.MainButton.setParams({
      text,
      color: params?.color || '#f2b6b6',
      text_color: params?.textColor || '#ffffff',
      is_active: params?.isActive !== false,
      is_visible: params?.isVisible !== false,
    });

    // Remove previous listener
    if (callbackRef.current) {
      tg.MainButton.offClick(callbackRef.current);
    }

    tg.MainButton.onClick(onClick);
    tg.MainButton.show();
  }, []);

  const hide = useCallback(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg?.MainButton) return;

    if (callbackRef.current) {
      tg.MainButton.offClick(callbackRef.current);
      callbackRef.current = null;
    }

    tg.MainButton.hide();
  }, []);

  const showProgress = useCallback((leaveActive = true) => {
    const tg = window.Telegram?.WebApp;
    if (!tg?.MainButton) return;
    tg.MainButton.showProgress(leaveActive);
  }, []);

  const hideProgress = useCallback(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg?.MainButton) return;
    tg.MainButton.hideProgress();
  }, []);

  const setText = useCallback((text: string) => {
    const tg = window.Telegram?.WebApp;
    if (!tg?.MainButton) return;
    tg.MainButton.setText(text);
  }, []);

  const enable = useCallback(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg?.MainButton) return;
    tg.MainButton.enable();
  }, []);

  const disable = useCallback(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg?.MainButton) return;
    tg.MainButton.disable();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      hide();
    };
  }, [hide]);

  return {
    show,
    hide,
    showProgress,
    hideProgress,
    setText,
    enable,
    disable,
  };
}
