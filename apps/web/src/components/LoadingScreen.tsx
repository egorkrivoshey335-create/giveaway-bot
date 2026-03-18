'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

/**
 * Loading Screen с анимацией логотипа при запуске приложения
 * Показывается пока идёт инициализация Telegram WebApp
 */
export function LoadingScreen() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const MIN_DISPLAY_MS = 1200;
    const MAX_DISPLAY_MS = 3000;
    const startedAt = Date.now();

    const hide = () => {
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_DISPLAY_MS) {
        setTimeout(() => setIsVisible(false), MIN_DISPLAY_MS - elapsed);
      } else {
        setIsVisible(false);
      }
    };

    const maxTimer = setTimeout(hide, MAX_DISPLAY_MS);

    const checkReady = setInterval(() => {
      if (window.Telegram?.WebApp?.initData) {
        hide();
        clearInterval(checkReady);
      }
    }, 200);

    return () => {
      clearTimeout(maxTimer);
      clearInterval(checkReady);
    };
  }, []);

  if (!isVisible) return null;

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100"
      initial={{ opacity: 1 }}
      animate={{ opacity: isVisible ? 1 : 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex flex-col items-center gap-6">
        {/* Animated Logo */}
        <motion.div
          className="relative w-32 h-32"
          initial={{ scale: 0.8, rotate: 0 }}
          animate={{
            scale: [0.8, 1.1, 1],
            rotate: [0, 360, 360],
          }}
          transition={{
            duration: 1.2,
            times: [0, 0.6, 1],
            ease: 'easeInOut',
          }}
        >
          {/* Main circle */}
          <motion.div
            className="absolute inset-0 rounded-full bg-brand shadow-2xl"
            animate={{
              boxShadow: [
                '0 0 0 0 rgba(242, 182, 182, 0.7)',
                '0 0 0 20px rgba(242, 182, 182, 0)',
              ],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeOut',
            }}
          />
          
          {/* Inner content */}
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.span
              className="text-5xl"
              animate={{
                scale: [1, 1.2, 1],
              }}
              transition={{
                duration: 1,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            >
              🎁
            </motion.span>
          </div>
        </motion.div>

        {/* App Name */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <h1 className="text-2xl font-bold text-brand-900">RandomBeast</h1>
          <p className="text-sm text-brand-700 text-center mt-1">Честные розыгрыши</p>
        </motion.div>

        {/* Loading indicator */}
        <motion.div
          className="flex gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 bg-brand rounded-full"
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.3, 1, 0.3],
              }}
              transition={{
                duration: 1,
                repeat: Infinity,
                delay: i * 0.2,
                ease: 'easeInOut',
              }}
            />
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}
