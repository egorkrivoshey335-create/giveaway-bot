'use client';

import { useEffect, useState } from 'react';

interface ConfettiParticle {
  id: number;
  emoji: string;
  left: number;
  delay: number;
  duration: number;
  size: number;
}

interface ConfettiProps {
  active: boolean;
  duration?: number; // мс
}

/**
 * Компонент конфетти для празднования победителей
 */
export function Confetti({ active, duration = 5000 }: ConfettiProps) {
  const [particles, setParticles] = useState<ConfettiParticle[]>([]);

  useEffect(() => {
    if (!active) {
      setParticles([]);
      return;
    }

    const emojis = ['🎉', '🎊', '🏆', '⭐', '✨', '🥇', '💫', '🎁', '🎈', '🥳'];
    const newParticles: ConfettiParticle[] = [];

    // Создаём 60 частиц
    for (let i = 0; i < 60; i++) {
      newParticles.push({
        id: i,
        emoji: emojis[Math.floor(Math.random() * emojis.length)],
        left: Math.random() * 100, // позиция по горизонтали (%)
        delay: Math.random() * 2, // задержка старта (секунды)
        duration: 3 + Math.random() * 3, // длительность падения (секунды)
        size: 16 + Math.random() * 24, // размер (пиксели)
      });
    }

    setParticles(newParticles);

    // Очищаем частицы после завершения анимации
    const timer = setTimeout(() => setParticles([]), duration);
    return () => clearTimeout(timer);
  }, [active, duration]);

  if (particles.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {particles.map(p => (
        <span
          key={p.id}
          className="absolute animate-confetti-fall"
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            fontSize: `${p.size}px`,
            top: '-50px',
          }}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
}

/**
 * Хук для управления конфетти
 */
export function useConfetti() {
  const [isActive, setIsActive] = useState(false);

  const trigger = (durationMs: number = 5000) => {
    setIsActive(true);
    setTimeout(() => setIsActive(false), durationMs);
  };

  return { isActive, trigger };
}
