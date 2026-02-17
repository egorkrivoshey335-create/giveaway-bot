'use client';

import { useEffect, useState, useRef } from 'react';

interface AnimatedCounterProps {
  value: number;
  duration?: number; // ms
  className?: string;
}

export function AnimatedCounter({ 
  value, 
  duration = 500,
  className = '' 
}: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);
  const frameRef = useRef<number>();
  const startTimeRef = useRef<number>();
  const startValueRef = useRef(value);

  useEffect(() => {
    // Если значение изменилось, запускаем анимацию
    if (value !== displayValue) {
      setIsAnimating(true);
      startValueRef.current = displayValue;
      startTimeRef.current = Date.now();

      const animate = () => {
        const now = Date.now();
        const elapsed = now - (startTimeRef.current || now);
        const progress = Math.min(elapsed / duration, 1);

        // Easing function (easeOutCubic)
        const eased = 1 - Math.pow(1 - progress, 3);

        const current = Math.round(
          startValueRef.current + (value - startValueRef.current) * eased
        );

        setDisplayValue(current);

        if (progress < 1) {
          frameRef.current = requestAnimationFrame(animate);
        } else {
          setIsAnimating(false);
        }
      };

      frameRef.current = requestAnimationFrame(animate);

      return () => {
        if (frameRef.current) {
          cancelAnimationFrame(frameRef.current);
        }
      };
    }
  }, [value, duration, displayValue]);

  return (
    <span 
      className={`${className} ${isAnimating ? 'animate-pulse-once' : ''}`}
      style={{
        display: 'inline-block',
        transition: 'transform 0.2s ease-out',
        transform: isAnimating ? 'scale(1.1)' : 'scale(1)'
      }}
    >
      {displayValue.toLocaleString('ru-RU')}
    </span>
  );
}
