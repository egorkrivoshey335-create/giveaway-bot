'use client';

import { SWRConfig } from 'swr';
import { swrFetcher } from '@/lib/swrConfig';

export interface SWRProviderProps {
  children: React.ReactNode;
}

/**
 * SWR Provider с глобальной конфигурацией
 */
export function SWRProvider({ children }: SWRProviderProps) {
  return (
    <SWRConfig
      value={{
        fetcher: swrFetcher,
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        dedupingInterval: 2000,
        errorRetryCount: 3,
        errorRetryInterval: 5000,
        shouldRetryOnError: (error) => {
          // Не ретраим клиентские ошибки
          if (error?.message?.includes('401') || error?.message?.includes('403')) {
            return false;
          }
          return true;
        },
        onError: (error, key) => {
          // Логирование ошибок в dev
          if (process.env.NODE_ENV === 'development') {
            console.error('SWR Error:', key, error);
          }
        },
      }}
    >
      {children}
    </SWRConfig>
  );
}
