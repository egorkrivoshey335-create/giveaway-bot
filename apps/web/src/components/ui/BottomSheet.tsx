'use client';

import { useEffect, useState, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppIcon } from '@/components/AppIcon';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxHeight?: string;
}

export function BottomSheet({ 
  isOpen, 
  onClose, 
  title, 
  children,
  maxHeight = '85vh'
}: BottomSheetProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      setTimeout(() => { document.body.style.overflow = ''; }, 300);
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!mounted) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Оверлей */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={onClose}
          />

          {/* Bottom Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-tg-bg rounded-t-3xl shadow-2xl max-w-xl mx-auto"
            style={{ maxHeight }}
          >
            {/* Ручка для свайпа */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-12 h-1 bg-tg-hint/30 rounded-full" />
            </div>

            {/* Заголовок */}
            {title && (
              <div className="flex items-center justify-between px-4 py-3 border-b border-tg-secondary">
                <h2 className="text-lg font-semibold">{title}</h2>
                <button
                  onClick={onClose}
                  className="text-tg-hint hover:text-tg-text transition-colors p-1"
                >
                  <AppIcon name="icon-close" size={20} />
                </button>
              </div>
            )}

            {/* Контент */}
            <div className="overflow-y-auto pb-safe" style={{ maxHeight: `calc(${maxHeight} - 100px)` }}>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
