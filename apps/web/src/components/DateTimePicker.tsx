'use client';

import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AppIcon } from '@/components/AppIcon';

interface DateTimePickerProps {
  value: string | null;
  onChange: (isoString: string | null) => void;
  min?: Date;
  placeholder?: string;
  label?: string;
}

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function isBeforeMin(year: number, month: number, day: number, min: Date | undefined): boolean {
  if (!min) return false;
  const date = new Date(year, month, day, 23, 59);
  return date < new Date(min.getFullYear(), min.getMonth(), min.getDate());
}

function formatDisplay(date: Date): string {
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DateTimePicker({ value, onChange, min, placeholder = 'Выберите дату и время' }: DateTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedDate = value ? new Date(value) : null;

  const now = new Date();
  const [viewYear, setViewYear] = useState(selectedDate?.getFullYear() || now.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate?.getMonth() || now.getMonth());

  const [pickedDay, setPickedDay] = useState<number | null>(selectedDate?.getDate() || now.getDate());
  const [pickedHour, setPickedHour] = useState(selectedDate?.getHours() ?? now.getHours());
  const [pickedMinute, setPickedMinute] = useState(selectedDate?.getMinutes() ?? now.getMinutes());

  useEffect(() => {
    if (value) {
      const d = new Date(value);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
      setPickedDay(d.getDate());
      setPickedHour(d.getHours());
      setPickedMinute(d.getMinutes());
    }
  }, [value]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        setTimeout(() => { document.body.style.overflow = ''; }, 350);
      };
    }
  }, [isOpen]);

  const goToPrevMonth = useCallback(() => {
    setViewMonth(prev => {
      if (prev === 0) {
        setViewYear(y => y - 1);
        return 11;
      }
      return prev - 1;
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    setViewMonth(prev => {
      if (prev === 11) {
        setViewYear(y => y + 1);
        return 0;
      }
      return prev + 1;
    });
  }, []);

  const confirmSelection = useCallback(() => {
    if (pickedDay === null) return;
    const date = new Date(viewYear, viewMonth, pickedDay, pickedHour, pickedMinute);
    onChange(date.toISOString());
    setIsOpen(false);
  }, [viewYear, viewMonth, pickedDay, pickedHour, pickedMinute, onChange]);

  const selectDay = useCallback((day: number) => {
    setPickedDay(day);
  }, []);

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const canGoPrev = !min || new Date(viewYear, viewMonth, 1) > new Date(min.getFullYear(), min.getMonth(), 1);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          if (!isOpen && !value) {
            const current = new Date();
            setViewYear(current.getFullYear());
            setViewMonth(current.getMonth());
            setPickedDay(current.getDate());
            setPickedHour(current.getHours());
            setPickedMinute(current.getMinutes());
          }
          setIsOpen(!isOpen);
        }}
        className="w-full bg-tg-bg rounded-lg px-4 py-3 text-left flex items-center justify-between cursor-pointer transition-colors hover:bg-tg-bg/80"
      >
        <span className={selectedDate ? 'text-tg-text' : 'text-tg-hint'}>
          {selectedDate ? formatDisplay(selectedDate) : placeholder}
        </span>
        <AppIcon name="icon-calendar" size={18} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setIsOpen(false)}
          >
            <div className="absolute inset-0 bg-black/40" />

            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="relative w-full max-w-sm rounded-2xl shadow-2xl border border-tg-secondary overflow-hidden"
              style={{ backgroundColor: 'var(--tg-theme-secondary-bg-color, #f0f0f0)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: 'var(--tg-theme-bg-color, #ffffff)' }}>
                <button
                  type="button"
                  onClick={goToPrevMonth}
                  disabled={!canGoPrev}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                    canGoPrev ? 'hover:bg-tg-secondary/50 text-tg-text' : 'text-tg-hint/30 cursor-not-allowed'
                  }`}
                >
                  <AppIcon name="icon-back" size={18} />
                </button>
                <span className="font-semibold text-tg-text">
                  {MONTH_NAMES[viewMonth]} {viewYear}
                </span>
                <button
                  type="button"
                  onClick={goToNextMonth}
                  className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-tg-secondary/50 text-tg-text transition-colors"
                >
                  <AppIcon name="icon-back" size={18} className="rotate-180" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-0 px-3 pt-2">
                {WEEKDAYS.map(d => (
                  <div key={d} className="text-center text-xs text-tg-hint font-medium py-1">
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-0 px-3 pb-3">
                {Array.from({ length: firstDay }, (_, i) => (
                  <div key={`empty-${i}`} className="p-1" />
                ))}

                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const isSelected = pickedDay === day;
                  const isToday = day === now.getDate() && viewMonth === now.getMonth() && viewYear === now.getFullYear();
                  const isDisabled = isBeforeMin(viewYear, viewMonth, day, min);

                  return (
                    <div key={day} className="p-0.5">
                      <button
                        type="button"
                        disabled={isDisabled}
                        onClick={() => selectDay(day)}
                        className={`w-full aspect-square rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                          isSelected
                            ? 'bg-tg-button text-tg-button-text scale-110 shadow-lg'
                            : isToday
                              ? 'bg-tg-button/20 text-tg-button'
                              : isDisabled
                                ? 'text-tg-hint/30 cursor-not-allowed'
                                : 'text-tg-text hover:bg-tg-secondary/50'
                        }`}
                      >
                        {day}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-tg-secondary px-4 py-3" style={{ backgroundColor: 'var(--tg-theme-bg-color, #ffffff)' }}>
                <div className="flex items-center justify-center gap-3">
                  <AppIcon name="icon-calendar" size={16} className="text-tg-hint" />

                  <div className="flex items-center bg-tg-secondary rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setPickedHour(h => h > 0 ? h - 1 : 23)}
                      className="w-8 h-10 flex items-center justify-center text-tg-hint hover:bg-tg-secondary/50 transition-colors"
                    >
                      −
                    </button>
                    <span className="w-10 text-center font-mono font-bold text-tg-text text-lg">
                      {String(pickedHour).padStart(2, '0')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPickedHour(h => h < 23 ? h + 1 : 0)}
                      className="w-8 h-10 flex items-center justify-center text-tg-hint hover:bg-tg-secondary/50 transition-colors"
                    >
                      +
                    </button>
                  </div>

                  <span className="text-xl font-bold text-tg-text">:</span>

                  <div className="flex items-center bg-tg-secondary rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setPickedMinute(m => m > 0 ? m - 1 : 59)}
                      className="w-8 h-10 flex items-center justify-center text-tg-hint hover:bg-tg-secondary/50 transition-colors"
                    >
                      −
                    </button>
                    <span className="w-10 text-center font-mono font-bold text-tg-text text-lg">
                      {String(pickedMinute).padStart(2, '0')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPickedMinute(m => m < 59 ? m + 1 : 0)}
                      className="w-8 h-10 flex items-center justify-center text-tg-hint hover:bg-tg-secondary/50 transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div className="px-4 pb-4" style={{ backgroundColor: 'var(--tg-theme-bg-color, #ffffff)' }}>
                <button
                  type="button"
                  onClick={confirmSelection}
                  disabled={pickedDay === null}
                  className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
                    pickedDay !== null
                      ? 'bg-tg-button text-tg-button-text hover:opacity-90 active:scale-[0.98]'
                      : 'bg-tg-secondary text-tg-hint cursor-not-allowed'
                  }`}
                >
                  {pickedDay !== null
                    ? `Выбрать ${pickedDay} ${MONTH_NAMES[viewMonth].toLowerCase()} ${viewYear}, ${String(pickedHour).padStart(2, '0')}:${String(pickedMinute).padStart(2, '0')}`
                    : 'Выберите дату'
                  }
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
