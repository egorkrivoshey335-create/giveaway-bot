'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

// ============================================================================
// Типы
// ============================================================================

interface DateTimePickerProps {
  value: string | null; // ISO строка или null
  onChange: (isoString: string | null) => void;
  min?: Date; // Минимальная дата
  placeholder?: string;
  label?: string;
}

// Названия месяцев на русском
const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

// Дни недели
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

// ============================================================================
// Хелперы
// ============================================================================

/** Количество дней в месяце */
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** День недели (0=Пн, 6=Вс) */
function getFirstDayOfMonth(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Пн=0 ... Вс=6
}

/** Проверка — дата раньше минимальной */
function isBeforeMin(year: number, month: number, day: number, min: Date | undefined): boolean {
  if (!min) return false;
  const date = new Date(year, month, day, 23, 59);
  return date < new Date(min.getFullYear(), min.getMonth(), min.getDate());
}

/** Форматирование даты */
function formatDisplay(date: Date): string {
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ============================================================================
// Компонент
// ============================================================================

export function DateTimePicker({ value, onChange, min, placeholder = 'Выберите дату и время' }: DateTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Текущая выбранная дата или сейчас
  const selectedDate = value ? new Date(value) : null;

  // Состояние календаря
  const now = new Date();
  const [viewYear, setViewYear] = useState(selectedDate?.getFullYear() || now.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate?.getMonth() || now.getMonth());

  // Состояние выбора
  const [pickedDay, setPickedDay] = useState<number | null>(selectedDate?.getDate() || null);
  const [pickedHour, setPickedHour] = useState(selectedDate?.getHours() || now.getHours());
  const [pickedMinute, setPickedMinute] = useState(selectedDate?.getMinutes() || 0);

  // Синхронизация при изменении value извне
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

  // Закрытие при клике снаружи
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Навигация по месяцам
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

  // Подтверждение выбора
  const confirmSelection = useCallback(() => {
    if (pickedDay === null) return;
    const date = new Date(viewYear, viewMonth, pickedDay, pickedHour, pickedMinute);
    onChange(date.toISOString());
    setIsOpen(false);
  }, [viewYear, viewMonth, pickedDay, pickedHour, pickedMinute, onChange]);

  // Выбор дня
  const selectDay = useCallback((day: number) => {
    setPickedDay(day);
  }, []);

  // Генерация дней календаря
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);

  // Проверка что можно идти назад
  const canGoPrev = !min || new Date(viewYear, viewMonth, 1) > new Date(min.getFullYear(), min.getMonth(), 1);

  return (
    <div ref={containerRef} className="relative">
      {/* Кнопка-триггер */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-tg-bg rounded-lg px-4 py-3 text-left flex items-center justify-between cursor-pointer transition-colors hover:bg-tg-bg/80"
      >
        <span className={selectedDate ? 'text-tg-text' : 'text-tg-hint'}>
          {selectedDate ? formatDisplay(selectedDate) : placeholder}
        </span>
        <span className="text-tg-hint text-lg">📅</span>
      </button>

      {/* Выпадающий календарь */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-tg-section rounded-2xl shadow-2xl border border-tg-secondary/30 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Навигация по месяцам */}
          <div className="flex items-center justify-between px-4 py-3 bg-tg-bg/50">
            <button
              type="button"
              onClick={goToPrevMonth}
              disabled={!canGoPrev}
              className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-colors ${
                canGoPrev ? 'hover:bg-tg-secondary/50 text-tg-text' : 'text-tg-hint/30 cursor-not-allowed'
              }`}
            >
              ◀
            </button>
            <span className="font-semibold text-tg-text">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={goToNextMonth}
              className="w-10 h-10 rounded-full flex items-center justify-center text-lg hover:bg-tg-secondary/50 text-tg-text transition-colors"
            >
              ▶
            </button>
          </div>

          {/* Дни недели */}
          <div className="grid grid-cols-7 gap-0 px-3 pt-2">
            {WEEKDAYS.map(d => (
              <div key={d} className="text-center text-xs text-tg-hint font-medium py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Дни месяца */}
          <div className="grid grid-cols-7 gap-0 px-3 pb-3">
            {/* Пустые ячейки до первого дня */}
            {Array.from({ length: firstDay }, (_, i) => (
              <div key={`empty-${i}`} className="p-1" />
            ))}

            {/* Дни */}
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

          {/* Выбор времени */}
          <div className="border-t border-tg-secondary/30 px-4 py-3">
            <div className="flex items-center justify-center gap-3">
              <span className="text-sm text-tg-hint">⏰</span>

              {/* Часы */}
              <div className="flex items-center bg-tg-bg rounded-lg overflow-hidden">
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

              {/* Минуты */}
              <div className="flex items-center bg-tg-bg rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setPickedMinute(m => m >= 5 ? m - 5 : 55)}
                  className="w-8 h-10 flex items-center justify-center text-tg-hint hover:bg-tg-secondary/50 transition-colors"
                >
                  −
                </button>
                <span className="w-10 text-center font-mono font-bold text-tg-text text-lg">
                  {String(pickedMinute).padStart(2, '0')}
                </span>
                <button
                  type="button"
                  onClick={() => setPickedMinute(m => m <= 54 ? m + 5 : 0)}
                  className="w-8 h-10 flex items-center justify-center text-tg-hint hover:bg-tg-secondary/50 transition-colors"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Кнопка подтверждения */}
          <div className="px-4 pb-4">
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
        </div>
      )}
    </div>
  );
}
