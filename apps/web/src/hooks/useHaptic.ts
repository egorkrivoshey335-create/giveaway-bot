'use client';

import { useCallback } from 'react';
import type { TelegramWebApp } from '@/types/telegram';

type ImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
type NotificationStyle = 'error' | 'success' | 'warning';

/**
 * Hook для Haptic Feedback в Telegram WebApp
 * 
 * @example
 * ```tsx
 * const haptic = useHaptic();
 * 
 * <button onClick={() => {
 *   haptic.impact('light');
 *   handleClick();
 * }}>
 *   Нажми меня
 * </button>
 * ```
 */
export function useHaptic() {
  const impactOccurred = useCallback((style: ImpactStyle = 'medium') => {
    const tg = window.Telegram?.WebApp as TelegramWebApp | undefined;
    if (!tg?.HapticFeedback) return;
    
    try {
      tg.HapticFeedback.impactOccurred(style);
    } catch (error) {
      // Тихо игнорируем ошибки (старые версии Telegram)
      console.debug('Haptic feedback not supported:', error);
    }
  }, []);

  const notificationOccurred = useCallback((style: NotificationStyle) => {
    const tg = window.Telegram?.WebApp as TelegramWebApp | undefined;
    if (!tg?.HapticFeedback) return;
    
    try {
      tg.HapticFeedback.notificationOccurred(style);
    } catch (error) {
      console.debug('Haptic feedback not supported:', error);
    }
  }, []);

  const selectionChanged = useCallback(() => {
    const tg = window.Telegram?.WebApp as TelegramWebApp | undefined;
    if (!tg?.HapticFeedback) return;
    
    try {
      tg.HapticFeedback.selectionChanged();
    } catch (error) {
      console.debug('Haptic feedback not supported:', error);
    }
  }, []);

  return {
    /**
     * Легкая вибрация при нажатии кнопок
     */
    impact: impactOccurred,
    
    /**
     * Вибрация успеха/ошибки/предупреждения
     */
    notification: notificationOccurred,
    
    /**
     * Вибрация при выборе (чекбокс, радио)
     */
    selection: selectionChanged,
  };
}
