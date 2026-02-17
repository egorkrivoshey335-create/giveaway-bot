'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxHeight?: string;
  showCloseButton?: boolean;
}

/**
 * BottomSheet — модальное окно снизу на половину/часть экрана
 * 
 * @example
 * ```tsx
 * const [isOpen, setIsOpen] = useState(false);
 * 
 * <BottomSheet 
 *   isOpen={isOpen} 
 *   onClose={() => setIsOpen(false)}
 *   title="Выбрать пост"
 * >
 *   <PostList />
 * </BottomSheet>
 * ```
 */
export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  maxHeight = '85vh',
  showCloseButton = true,
}: BottomSheetProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Block scroll when open
  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
    } else {
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
    }

    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
    };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            ref={contentRef}
            className="fixed bottom-0 left-0 right-0 z-50 bg-tg-bg rounded-t-3xl shadow-2xl"
            style={{ maxHeight }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-12 h-1.5 bg-tg-hint/30 rounded-full" />
            </div>

            {/* Header */}
            {(title || showCloseButton) && (
              <div className="flex items-center justify-between px-4 pb-3 border-b border-tg-secondary">
                <h2 className="text-xl font-semibold text-tg-text">
                  {title}
                </h2>
                {showCloseButton && (
                  <button
                    onClick={onClose}
                    className="p-2 -mr-2 rounded-full hover:bg-tg-secondary transition-colors"
                    aria-label="Закрыть"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-6 h-6 text-tg-hint"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}
              </div>
            )}

            {/* Content */}
            <div className="overflow-y-auto px-4 pb-4 pt-4" style={{ maxHeight: `calc(${maxHeight} - 80px)` }}>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
