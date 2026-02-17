'use client';

import { useEffect, useState } from 'react';
import { AppIcon } from './AppIcon';

export interface FloatingIcon {
  id: number;
  name: string;
  x: number; // % from left
  y: number; // % from top
  size: number; // px
  duration: number; // seconds
  delay: number; // seconds
  rotation: number; // degrees
}

export interface FloatingIconsProps {
  /**
   * Количество иконок (по умолчанию 12)
   */
  count?: number;
  /**
   * Включены ли парящие иконки (по умолчанию true)
   */
  enabled?: boolean;
  /**
   * Прозрачность иконок (0-1, по умолчанию 0.07)
   */
  opacity?: number;
}

/**
 * Список иконок для рандомного выбора
 */
const ICON_POOL = [
  'icon-giveaway',
  'icon-gift',
  'icon-trophy',
  'icon-star',
  'icon-ticket',
  'icon-boost',
  'icon-crown',
  'icon-diamond',
  'icon-calendar',
  'icon-winner',
];

/**
 * Генерация рандомной иконки с параметрами
 */
function generateRandomIcon(id: number): FloatingIcon {
  return {
    id,
    name: ICON_POOL[Math.floor(Math.random() * ICON_POOL.length)],
    x: Math.random() * 100, // 0-100%
    y: Math.random() * 100, // 0-100%
    size: 40 + Math.random() * 40, // 40-80px
    duration: 20 + Math.random() * 20, // 20-40s
    delay: Math.random() * 10, // 0-10s
    rotation: Math.random() * 360, // 0-360deg
  };
}

/**
 * FloatingIcons — декоративные парящие иконки на фоне
 * 
 * Использует CSS animations для плавного движения вверх-вниз и вращения.
 * GPU-ускорение через transform и opacity.
 * Можно выключить через пропс enabled.
 * 
 * @example
 * ```tsx
 * // В layout.tsx
 * <FloatingIcons count={12} enabled={!reducedMotion} opacity={0.07} />
 * ```
 */
export function FloatingIcons({
  count = 12,
  enabled = true,
  opacity = 0.07,
}: FloatingIconsProps) {
  const [icons, setIcons] = useState<FloatingIcon[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Генерируем иконки только один раз при монтировании
    const generatedIcons = Array.from({ length: count }, (_, i) => generateRandomIcon(i));
    setIcons(generatedIcons);
  }, [count]);

  // Проверяем prefers-reduced-motion
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    
    const handleChange = () => {
      if (mediaQuery.matches) {
        // Пользователь предпочитает меньше анимаций - скрываем иконки
        setIcons([]);
      }
    };

    handleChange(); // Проверяем сразу
    mediaQuery.addEventListener('change', handleChange);
    
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  if (!enabled || !mounted || icons.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden z-0"
      aria-hidden="true"
      style={{
        // Используем CSS variables для анимаций
        // @ts-ignore
        '--float-duration': '30s',
        '--rotate-duration': '45s',
      }}
    >
      {icons.map((icon) => (
        <div
          key={icon.id}
          className="absolute floating-icon"
          style={{
            left: `${icon.x}%`,
            top: `${icon.y}%`,
            opacity,
            animationDelay: `${icon.delay}s`,
            // @ts-ignore
            '--float-duration': `${icon.duration}s`,
            '--rotate-duration': `${icon.duration * 1.5}s`,
          }}
        >
          <AppIcon
            name={icon.name}
            variant="lucide"
            size={icon.size}
            color="currentColor"
            className="text-brand-300 dark:text-brand-400"
          />
        </div>
      ))}
    </div>
  );
}

/**
 * useFloatingIconsPreference — хук для управления настройкой парящих иконок
 * Сохраняет предпочтение пользователя в localStorage
 */
export function useFloatingIconsPreference() {
  const [enabled, setEnabled] = useState<boolean>(true);

  useEffect(() => {
    const stored = localStorage.getItem('floatingIcons');
    if (stored !== null) {
      setEnabled(stored === 'true');
    }
  }, []);

  const toggle = (value: boolean) => {
    setEnabled(value);
    localStorage.setItem('floatingIcons', String(value));
  };

  return { enabled, toggle };
}
