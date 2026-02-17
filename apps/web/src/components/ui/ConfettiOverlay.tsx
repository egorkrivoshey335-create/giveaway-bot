'use client';

import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';

export interface ConfettiOverlayProps {
  trigger: boolean;
  duration?: number;
  onComplete?: () => void;
}

/**
 * ConfettiOverlay — конфетти при успешных действиях
 * 
 * @example
 * ```tsx
 * const [showConfetti, setShowConfetti] = useState(false);
 * 
 * <ConfettiOverlay 
 *   trigger={showConfetti}
 *   onComplete={() => setShowConfetti(false)}
 * />
 * ```
 */
export function ConfettiOverlay({
  trigger,
  duration = 3000,
  onComplete,
}: ConfettiOverlayProps) {
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!trigger) return;

    // Brand colors
    const colors = ['#f2b6b6', '#e69999', '#ffd700', '#ffffff'];

    const fire = (particleRatio: number, opts: confetti.Options) => {
      confetti({
        ...opts,
        particleCount: Math.floor(200 * particleRatio),
        colors,
      });
    };

    // Multiple bursts
    fire(0.25, {
      spread: 26,
      startVelocity: 55,
      origin: { y: 0.6 },
    });

    fire(0.2, {
      spread: 60,
      origin: { y: 0.6 },
    });

    fire(0.35, {
      spread: 100,
      decay: 0.91,
      scalar: 0.8,
      origin: { y: 0.6 },
    });

    fire(0.1, {
      spread: 120,
      startVelocity: 25,
      decay: 0.92,
      scalar: 1.2,
      origin: { y: 0.6 },
    });

    fire(0.1, {
      spread: 120,
      startVelocity: 45,
      origin: { y: 0.6 },
    });

    // Auto cleanup
    timeoutRef.current = setTimeout(() => {
      onComplete?.();
    }, duration);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [trigger, duration, onComplete]);

  return null;
}
