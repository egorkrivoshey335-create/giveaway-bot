'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useNetworkState } from '@/hooks/useNetworkState';

export interface NetworkErrorHandlerProps {
  children: React.ReactNode;
}

/**
 * NetworkErrorHandler - глобальный обработчик сетевых ошибок
 * Показывает toast при offline/online состояниях
 * 
 * @example
 * ```tsx
 * <NetworkErrorHandler>
 *   <YourApp />
 * </NetworkErrorHandler>
 * ```
 */
export function NetworkErrorHandler({ children }: NetworkErrorHandlerProps) {
  const t = useTranslations('errors');
  const { isOnline, wasOffline } = useNetworkState();
  const [showOnlineToast, setShowOnlineToast] = useState(false);

  useEffect(() => {
    if (wasOffline) {
      setShowOnlineToast(true);
      const timer = setTimeout(() => setShowOnlineToast(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [wasOffline]);

  return (
    <>
      {children}
      
      {/* Offline Toast */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl bg-red-500 text-white shadow-lg max-w-sm"
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
          >
            <div className="flex items-center gap-2">
              <span className="text-xl">📡</span>
              <div>
                <p className="font-semibold text-sm">{t('noInternet')}</p>
                <p className="text-xs opacity-90">{t('checkConnection')}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Online Toast */}
      <AnimatePresence>
        {showOnlineToast && (
          <motion.div
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl bg-green-500 text-white shadow-lg"
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
          >
            <div className="flex items-center gap-2">
              <span className="text-xl">✓</span>
              <p className="font-semibold text-sm">{t('connectionRestored')}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
