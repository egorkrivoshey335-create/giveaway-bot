'use client';

import { useEffect, useCallback } from 'react';

export interface UseVisibilityChangeOptions {
  /**
   * Callback при возвращении видимости страницы
   */
  onVisible?: () => void;
  
  /**
   * Callback при скрытии страницы
   */
  onHidden?: () => void;
  
  /**
   * Включить автоматическую обработку
   * @default true
   */
  enabled?: boolean;
}

/**
 * Hook для отслеживания visibility change
 * Используется для обновления данных при возврате в приложение из бота
 * 
 * @example
 * ```tsx
 * useVisibilityChange({
 *   onVisible: () => {
 *     // Обновить данные
 *     mutate('/api/init');
 *     mutate('/api/channels');
 *   },
 * });
 * ```
 */
export function useVisibilityChange({
  onVisible,
  onHidden,
  enabled = true,
}: UseVisibilityChangeOptions = {}) {
  const handleVisibilityChange = useCallback(() => {
    if (document.visibilityState === 'visible') {
      onVisible?.();
    } else if (document.visibilityState === 'hidden') {
      onHidden?.();
    }
  }, [onVisible, onHidden]);

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [handleVisibilityChange, enabled]);
}
