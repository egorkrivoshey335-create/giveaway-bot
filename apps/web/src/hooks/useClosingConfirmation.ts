'use client';

import { useEffect, useRef } from 'react';
import type { TelegramWebApp } from '@/types/telegram';
import { useDraftStore } from '@/stores/useDraftStore';

/**
 * Hook для автоматического включения confirmClosing при наличии несохранённых данных
 * 
 * @example
 * ```tsx
 * // В wizard компоненте
 * useClosingConfirmation(isDirty);
 * ```
 */
export function useClosingConfirmation(hasUnsavedChanges: boolean) {
  const previousStateRef = useRef(false);

  useEffect(() => {
    const tg = window.Telegram?.WebApp as TelegramWebApp | undefined;
    if (!tg) return;

    // Включаем/выключаем подтверждение закрытия
    if (hasUnsavedChanges && !previousStateRef.current) {
      if (tg.enableClosingConfirmation) {
        tg.enableClosingConfirmation();
      }
      previousStateRef.current = true;
    } else if (!hasUnsavedChanges && previousStateRef.current) {
      if (tg.disableClosingConfirmation) {
        tg.disableClosingConfirmation();
      }
      previousStateRef.current = false;
    }

    // Cleanup при размонтировании
    return () => {
      if (previousStateRef.current && tg.disableClosingConfirmation) {
        tg.disableClosingConfirmation();
      }
    };
  }, [hasUnsavedChanges]);
}

/**
 * Hook для автоматического управления closing confirmation на основе draft store
 * Использовать в wizard страницах
 */
export function useAutoClosingConfirmation() {
  const isDirty = useDraftStore((state) => state.isDirty);
  useClosingConfirmation(isDirty);
}
