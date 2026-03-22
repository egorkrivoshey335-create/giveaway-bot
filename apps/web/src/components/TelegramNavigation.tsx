'use client';

import { useEffect, useRef, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { mutate } from 'swr';

/**
 * Глобальный обработчик Telegram навигации:
 * - BackButton: показывается на всех страницах кроме главной (/), вызывает router.back()
 * - visibilitychange: при возврате в приложение обновляет все SWR-кеши
 *
 * Размещается в корневом layout, поэтому работает для всех страниц автоматически.
 */
export function TelegramNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const isHome = pathname === '/';
  const callbackRef = useRef<(() => void) | null>(null);

  // ── BackButton ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg?.BackButton) return;

    if (isHome) {
      // На главной странице скрываем BackButton
      if (callbackRef.current) {
        tg.BackButton.offClick(callbackRef.current);
        callbackRef.current = null;
      }
      tg.BackButton.hide();
    } else {
      const handleBack = () => router.push('/');
      callbackRef.current = handleBack;
      tg.BackButton.onClick(handleBack);
      tg.BackButton.show();

      return () => {
        tg.BackButton.offClick(handleBack);
        tg.BackButton.hide();
      };
    }
  }, [isHome, router, pathname]);

  // ── visibilitychange: обновить данные при возврате в приложение ────────────

  const handleVisible = useCallback(() => {
    // Revalidate all SWR caches when user returns to the app (e.g. from Telegram bot)
    mutate(
      // Revalidate all keys that start with /api/ — lightweight revalidation
      (key) => typeof key === 'string' && key.startsWith('/api/'),
      undefined,
      { revalidate: true }
    );
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleVisible();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [handleVisible]);

  return null;
}
