'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';

export interface PageTransitionProps {
  children: ReactNode;
  direction?: 'forward' | 'back' | 'none';
}

/**
 * PageTransition — обёртка для плавных переходов между страницами
 * 
 * Direction определяет анимацию:
 * - forward: slide-in-right (переход вперёд)
 * - back: slide-in-left (переход назад)
 * - none: fade (по умолчанию)
 * 
 * @example
 * ```tsx
 * <PageTransition direction="forward">
 *   <YourPage />
 * </PageTransition>
 * ```
 */
export function PageTransition({ children, direction = 'none' }: PageTransitionProps) {
  const pathname = usePathname();

  const variants = {
    forward: {
      initial: { x: '100%', opacity: 0 },
      animate: { x: 0, opacity: 1 },
      exit: { x: '-100%', opacity: 0 },
    },
    back: {
      initial: { x: '-100%', opacity: 0 },
      animate: { x: 0, opacity: 1 },
      exit: { x: '100%', opacity: 0 },
    },
    none: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    },
  };

  const currentVariant = variants[direction];

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={currentVariant.initial}
        animate={currentVariant.animate}
        exit={currentVariant.exit}
        transition={{
          duration: 0.25,
          ease: 'easeInOut',
        }}
        className="w-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * usePageDirection — хук для определения направления перехода
 * Можно использовать с router history для автоматического определения
 */
export function usePageDirection(): 'forward' | 'back' | 'none' {
  // TODO: можно улучшить через хранение истории маршрутов в localStorage
  // и определять direction автоматически
  return 'none';
}
