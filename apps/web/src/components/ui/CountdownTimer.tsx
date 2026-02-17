'use client';

import { useEffect, useState } from 'react';

export interface CountdownTimerProps {
  endDate: string | Date;
  prefix?: string;
  onComplete?: () => void;
  className?: string;
  showDays?: boolean;
  showHours?: boolean;
  showMinutes?: boolean;
  showSeconds?: boolean;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
}

/**
 * CountdownTimer — обратный отсчёт с анимацией
 * 
 * @example
 * ```tsx
 * <CountdownTimer 
 *   endDate={giveaway.endAt}
 *   prefix="Итоги через"
 *   onComplete={() => refetch()}
 * />
 * ```
 */
export function CountdownTimer({
  endDate,
  prefix = 'Осталось',
  onComplete,
  className = '',
  showDays = true,
  showHours = true,
  showMinutes = true,
  showSeconds = true,
}: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    total: 0,
  });

  useEffect(() => {
    const calculateTimeLeft = (): TimeLeft => {
      const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
      const now = new Date();
      const difference = end.getTime() - now.getTime();

      if (difference <= 0) {
        onComplete?.();
        return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };
      }

      return {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60),
        total: difference,
      };
    };

    setTimeLeft(calculateTimeLeft());

    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [endDate, onComplete]);

  if (timeLeft.total <= 0) {
    return (
      <div className={`text-center ${className}`}>
        <span className="text-tg-hint font-medium">Подводим итоги...</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center gap-2 ${className}`}>
      {prefix && <span className="text-tg-hint text-sm">{prefix}</span>}
      
      <div className="flex items-center gap-1 font-mono font-semibold text-brand">
        {showDays && timeLeft.days > 0 && (
          <>
            <TimeUnit value={timeLeft.days} label="д" />
            <span className="text-tg-hint">:</span>
          </>
        )}
        
        {showHours && (
          <>
            <TimeUnit value={timeLeft.hours} label="ч" />
            <span className="text-tg-hint">:</span>
          </>
        )}
        
        {showMinutes && (
          <>
            <TimeUnit value={timeLeft.minutes} label="м" />
            {showSeconds && <span className="text-tg-hint">:</span>}
          </>
        )}
        
        {showSeconds && <TimeUnit value={timeLeft.seconds} label="с" />}
      </div>
    </div>
  );
}

function TimeUnit({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-0.5">
      <span className="text-lg">{value.toString().padStart(2, '0')}</span>
      <span className="text-xs text-tg-hint">{label}</span>
    </span>
  );
}
