'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import Image from 'next/image';

const MIN_DISPLAY_MS = 5000;
const MAX_DISPLAY_MS = 7000;

export function LoadingScreen() {
  const [isVisible, setIsVisible] = useState(true);
  const [shouldRender, setShouldRender] = useState(true);

  useEffect(() => {
    const startedAt = Date.now();

    const hide = () => {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);
      setTimeout(() => setIsVisible(false), remaining);
    };

    const maxTimer = setTimeout(hide, MAX_DISPLAY_MS);

    const checkReady = setInterval(() => {
      if (window.Telegram?.WebApp?.initData) {
        hide();
        clearInterval(checkReady);
      }
    }, 300);

    return () => {
      clearTimeout(maxTimer);
      clearInterval(checkReady);
    };
  }, []);

  useEffect(() => {
    if (!isVisible) {
      const timer = setTimeout(() => setShouldRender(false), 600);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  if (!shouldRender) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <div className="flex flex-col items-center gap-6">
            {/* Animated Logo */}
            <motion.div
              className="relative w-32 h-32"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
            >
              {/* Pulsing ring */}
              <motion.div
                className="absolute inset-0 rounded-full bg-brand/30"
                animate={{
                  scale: [1, 1.4, 1],
                  opacity: [0.6, 0, 0.6],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />

              {/* Main circle */}
              <motion.div
                className="absolute inset-0 rounded-full bg-brand shadow-2xl flex items-center justify-center overflow-hidden"
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                >
                  <Image
                    src="/icons/brand/icon-loading.webp"
                    alt="Loading"
                    width={80}
                    height={80}
                    className="w-20 h-20 object-contain"
                    priority
                  />
                </motion.div>
              </motion.div>
            </motion.div>

            {/* App Name */}
            <motion.div
              className="text-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.6, ease: 'easeOut' }}
            >
              <h1 className="text-2xl font-bold text-brand-900">RandomBeast</h1>
              <p className="text-sm text-brand-700 mt-1">Честные розыгрыши</p>
            </motion.div>

            {/* Loading dots */}
            <motion.div
              className="flex gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8, duration: 0.4 }}
            >
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-2.5 h-2.5 bg-brand-600 rounded-full"
                  animate={{
                    scale: [1, 1.5, 1],
                    opacity: [0.3, 1, 0.3],
                  }}
                  transition={{
                    duration: 1.2,
                    repeat: Infinity,
                    delay: i * 0.25,
                    ease: 'easeInOut',
                  }}
                />
              ))}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
