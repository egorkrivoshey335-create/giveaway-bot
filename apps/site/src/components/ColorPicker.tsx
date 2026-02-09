'use client';

import { useState, useRef, useEffect } from 'react';
import { HexColorPicker, HexColorInput } from 'react-colorful';

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  presets?: string[];
  label?: string;
}

/**
 * Кастомный Color Picker с палитрой, HEX-вводом и пресетами.
 * Выпадающее окно стилизовано под тёмную тему.
 */
export function ColorPicker({ color, onChange, presets = [], label }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Закрытие по клику вне
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  return (
    <div className="relative" ref={popoverRef}>
      {/* Кнопка-триггер */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-8 h-8 rounded-full border-2 border-dashed transition-all hover:scale-110 flex items-center justify-center overflow-hidden ${
          isOpen ? 'border-white ring-2 ring-white/30' : 'border-white/40 hover:border-white'
        }`}
        style={{ backgroundColor: color }}
        title={label || 'Выбрать свой цвет'}
      >
        <span className="text-xs drop-shadow-lg">🎨</span>
      </button>

      {/* Выпадающее окно с палитрой */}
      {isOpen && (
        <div
          className="absolute z-50 mt-2 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-4 min-w-[240px]"
          style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
        >
          {/* Заголовок */}
          {label && (
            <div className="text-xs text-gray-400 mb-2 font-medium">{label}</div>
          )}

          {/* Палитра react-colorful */}
          <div className="color-picker-wrapper mb-3">
            <HexColorPicker color={color} onChange={onChange} />
          </div>

          {/* HEX ввод */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-gray-500 text-sm font-mono">#</span>
            <HexColorInput
              color={color}
              onChange={onChange}
              prefixed={false}
              className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="ffffff"
            />
            <div
              className="w-8 h-8 rounded-lg border border-gray-600 shrink-0"
              style={{ backgroundColor: color }}
            />
          </div>

          {/* Пресеты */}
          {presets.length > 0 && (
            <div>
              <div className="text-xs text-gray-500 mb-1.5">Быстрый выбор</div>
              <div className="flex flex-wrap gap-1.5">
                {presets.map(preset => (
                  <button
                    key={preset}
                    className={`w-6 h-6 rounded-full border transition-transform hover:scale-125 ${
                      color === preset ? 'border-white scale-110' : 'border-gray-600'
                    }`}
                    style={{ backgroundColor: preset }}
                    onClick={() => onChange(preset)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
