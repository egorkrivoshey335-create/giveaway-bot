'use client';

import { useEffect, useState } from 'react';

export interface NetworkState {
  isOnline: boolean;
  wasOffline: boolean;
}

/**
 * Hook для отслеживания состояния сети
 * 
 * @example
 * ```tsx
 * const { isOnline, wasOffline } = useNetworkState();
 * 
 * {!isOnline && <div>Нет подключения к интернету</div>}
 * ```
 */
export function useNetworkState(): NetworkState {
  const [isOnline, setIsOnline] = useState(true);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    // Начальное состояние
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      setWasOffline(true);
      
      // Сбросить флаг через 3 секунды
      setTimeout(() => setWasOffline(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, wasOffline };
}
