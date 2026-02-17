'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { TelegramWebApp } from '@/types/telegram';

/**
 * Hook для работы с Telegram WebApp BackButton
 * 
 * @example
 * ```tsx
 * // Автоматический router.back()
 * useBackButton();
 * 
 * // Кастомный обработчик
 * useBackButton(() => {
 *   if (hasUnsavedChanges) {
 *     showConfirmDialog();
 *   } else {
 *     router.back();
 *   }
 * });
 * ```
 */
export function useBackButton(onBack?: () => void) {
  const router = useRouter();
  const callbackRef = useRef<(() => void) | null>(null);

  const show = useCallback(() => {
    const tg = window.Telegram?.WebApp as TelegramWebApp | undefined;
    if (!tg?.BackButton) return;
    tg.BackButton.show();
  }, []);

  const hide = useCallback(() => {
    const tg = window.Telegram?.WebApp as TelegramWebApp | undefined;
    if (!tg?.BackButton) return;
    tg.BackButton.hide();
  }, []);

  useEffect(() => {
    const tg = window.Telegram?.WebApp as TelegramWebApp | undefined;
    if (!tg?.BackButton) return;

    const handleBack = onBack || (() => router.back());
    callbackRef.current = handleBack;

    tg.BackButton.onClick(handleBack);
    tg.BackButton.show();

    return () => {
      if (callbackRef.current) {
        tg.BackButton.offClick(callbackRef.current);
      }
      tg.BackButton.hide();
    };
  }, [onBack, router]);

  return { show, hide };
}
