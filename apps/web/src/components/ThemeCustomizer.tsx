'use client';

import { useState, useRef, ChangeEvent } from 'react';
import { Button } from './ui/Button';
import { Toggle } from './ui/Toggle';
import { Card } from './ui/Card';
import { AppIcon } from './AppIcon';

export interface ThemeSettings {
  // Цвета
  primaryColor: string;
  backgroundColor: string;
  backgroundType: 'solid' | 'gradient' | 'image';
  
  // Логотип
  logoUrl?: string;
  logoFile?: File;
  
  // Стиль кнопок
  buttonRadius: 8 | 12 | 16;
  buttonStyle: 'filled' | 'outline';
  
  // Иконки
  iconVariant: 'brand' | 'lucide';
  iconColor: 'auto' | 'white' | 'black' | string;
}

export interface ThemeCustomizerProps {
  /**
   * Текущие настройки темы
   */
  currentTheme?: Partial<ThemeSettings>;
  /**
   * Колбэк при изменении настроек
   */
  onChange?: (theme: ThemeSettings) => void;
  /**
   * Колбэк при сохранении
   */
  onSave?: (theme: ThemeSettings) => void;
  /**
   * Колбэк при отмене
   */
  onCancel?: () => void;
  /**
   * Доступна ли эта фича (для платной подписки)
   */
  isPremium?: boolean;
}

const DEFAULT_THEME: ThemeSettings = {
  primaryColor: '#f2b6b6',
  backgroundColor: '#ffffff',
  backgroundType: 'solid',
  buttonRadius: 12,
  buttonStyle: 'filled',
  iconVariant: 'brand',
  iconColor: 'auto',
};

const GRADIENT_PRESETS = [
  'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
  'linear-gradient(135deg, #f2b6b6 0%, #e89999 100%)',
  'linear-gradient(135deg, #fecaca 0%, #f87171 100%)',
];

/**
 * ThemeCustomizer — UI для настройки темы создателем (платная фича)
 * 
 * Позволяет настроить:
 * - Основной цвет
 * - Фон (цвет/градиент/картинка)
 * - Логотип бренда
 * - Стиль кнопок
 * - Вариант иконок (brand/lucide)
 * 
 * @example
 * ```tsx
 * <ThemeCustomizer
 *   currentTheme={giveaway.theme}
 *   onChange={handleThemeChange}
 *   onSave={handleSave}
 *   isPremium={user.subscriptionTier === 'PRO'}
 * />
 * ```
 */
export function ThemeCustomizer({
  currentTheme = {},
  onChange,
  onSave,
  onCancel,
  isPremium = false,
}: ThemeCustomizerProps) {
  const [theme, setTheme] = useState<ThemeSettings>({
    ...DEFAULT_THEME,
    ...currentTheme,
  });

  const [preview, setPreview] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (updates: Partial<ThemeSettings>) => {
    const newTheme = { ...theme, ...updates };
    setTheme(newTheme);
    onChange?.(newTheme);
  };

  const handleLogoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Проверка размера (макс 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('Размер файла не должен превышать 2MB');
      return;
    }

    // Проверка формата
    if (!file.type.startsWith('image/')) {
      alert('Пожалуйста, загрузите изображение');
      return;
    }

    // Preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setPreview(event.target?.result as string);
      handleChange({ logoFile: file, logoUrl: undefined });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setPreview(null);
    handleChange({ logoFile: undefined, logoUrl: undefined });
    if (logoInputRef.current) {
      logoInputRef.current.value = '';
    }
  };

  const handleSave = () => {
    onSave?.(theme);
  };

  const handleCancel = () => {
    setTheme({ ...DEFAULT_THEME, ...currentTheme });
    setPreview(null);
    onCancel?.();
  };

  // Если не Premium, показываем заглушку
  if (!isPremium) {
    return (
      <Card className="p-6 text-center">
        <AppIcon name="lock" variant="lucide" size={48} className="mx-auto mb-4 text-brand-300" />
        <h3 className="text-lg font-semibold mb-2">Кастомизация темы</h3>
        <p className="text-tg-hint mb-4">
          Настройка темы доступна для пользователей с подпиской PRO или Business
        </p>
        <Button variant="primary">
          <AppIcon name="crown" variant="lucide" size={16} className="mr-2" />
          Повысить статус
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Основной цвет */}
      <Card className="p-4">
        <h3 className="text-sm font-medium mb-3 flex items-center">
          <AppIcon name="theme" variant="lucide" size={16} className="mr-2" />
          Основной цвет
        </h3>
        <div className="flex gap-2 items-center">
          <input
            type="color"
            value={theme.primaryColor}
            onChange={(e) => handleChange({ primaryColor: e.target.value })}
            className="w-12 h-12 rounded cursor-pointer"
          />
          <input
            type="text"
            value={theme.primaryColor}
            onChange={(e) => handleChange({ primaryColor: e.target.value })}
            className="flex-1 px-3 py-2 bg-tg-secondary rounded-lg text-sm"
            placeholder="#f2b6b6"
          />
        </div>
      </Card>

      {/* Фон */}
      <Card className="p-4">
        <h3 className="text-sm font-medium mb-3 flex items-center">
          <AppIcon name="image" variant="lucide" size={16} className="mr-2" />
          Фон
        </h3>
        
        {/* Тип фона */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => handleChange({ backgroundType: 'solid' })}
            className={`px-3 py-2 rounded-lg text-sm ${
              theme.backgroundType === 'solid' ? 'bg-brand text-white' : 'bg-tg-secondary'
            }`}
          >
            Цвет
          </button>
          <button
            onClick={() => handleChange({ backgroundType: 'gradient' })}
            className={`px-3 py-2 rounded-lg text-sm ${
              theme.backgroundType === 'gradient' ? 'bg-brand text-white' : 'bg-tg-secondary'
            }`}
          >
            Градиент
          </button>
          <button
            onClick={() => handleChange({ backgroundType: 'image' })}
            className={`px-3 py-2 rounded-lg text-sm ${
              theme.backgroundType === 'image' ? 'bg-brand text-white' : 'bg-tg-secondary'
            }`}
          >
            Картинка
          </button>
        </div>

        {/* Solid color */}
        {theme.backgroundType === 'solid' && (
          <div className="flex gap-2 items-center">
            <input
              type="color"
              value={theme.backgroundColor}
              onChange={(e) => handleChange({ backgroundColor: e.target.value })}
              className="w-12 h-12 rounded cursor-pointer"
            />
            <input
              type="text"
              value={theme.backgroundColor}
              onChange={(e) => handleChange({ backgroundColor: e.target.value })}
              className="flex-1 px-3 py-2 bg-tg-secondary rounded-lg text-sm"
              placeholder="#ffffff"
            />
          </div>
        )}

        {/* Gradient presets */}
        {theme.backgroundType === 'gradient' && (
          <div className="grid grid-cols-3 gap-2">
            {GRADIENT_PRESETS.map((gradient, idx) => (
              <button
                key={idx}
                onClick={() => handleChange({ backgroundColor: gradient })}
                className="h-16 rounded-lg border-2 border-transparent hover:border-brand"
                style={{ background: gradient }}
              />
            ))}
          </div>
        )}

        {/* Image upload */}
        {theme.backgroundType === 'image' && (
          <div>
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              className="hidden"
              ref={logoInputRef}
            />
            <Button variant="outline" onClick={() => logoInputRef.current?.click()}>
              <AppIcon name="upload" variant="lucide" size={16} className="mr-2" />
              Загрузить фон
            </Button>
          </div>
        )}
      </Card>

      {/* Логотип */}
      <Card className="p-4">
        <h3 className="text-sm font-medium mb-3 flex items-center">
          <AppIcon name="image" variant="lucide" size={16} className="mr-2" />
          Логотип бренда
        </h3>
        
        {(preview || theme.logoUrl) && (
          <div className="mb-3 flex items-center gap-3">
            <img
              src={preview || theme.logoUrl}
              alt="Logo preview"
              className="w-24 h-24 object-contain rounded-lg bg-tg-secondary p-2"
            />
            <Button variant="outline" onClick={handleRemoveLogo}>
              <AppIcon name="delete" variant="lucide" size={16} className="mr-2" />
              Удалить
            </Button>
          </div>
        )}

        <input
          type="file"
          accept="image/png,image/jpeg,image/svg+xml"
          onChange={handleLogoUpload}
          className="hidden"
          ref={logoInputRef}
        />
        <Button variant="outline" onClick={() => logoInputRef.current?.click()}>
          <AppIcon name="upload" variant="lucide" size={16} className="mr-2" />
          {preview || theme.logoUrl ? 'Изменить логотип' : 'Загрузить логотип'}
        </Button>
        <p className="text-xs text-tg-hint mt-2">
          Рекомендуемый размер: 128x128px, формат: PNG/SVG, макс. 2MB
        </p>
      </Card>

      {/* Стиль кнопок */}
      <Card className="p-4">
        <h3 className="text-sm font-medium mb-3 flex items-center">
          <AppIcon name="settings" variant="lucide" size={16} className="mr-2" />
          Стиль кнопок
        </h3>
        
        <div className="space-y-3">
          {/* Button style */}
          <div>
            <label className="text-xs text-tg-hint mb-2 block">Вид</label>
            <div className="flex gap-2">
              <button
                onClick={() => handleChange({ buttonStyle: 'filled' })}
                className={`px-4 py-2 rounded-lg ${
                  theme.buttonStyle === 'filled' ? 'bg-brand text-white' : 'bg-tg-secondary'
                }`}
              >
                Заливка
              </button>
              <button
                onClick={() => handleChange({ buttonStyle: 'outline' })}
                className={`px-4 py-2 rounded-lg ${
                  theme.buttonStyle === 'outline' ? 'bg-brand text-white' : 'bg-tg-secondary'
                }`}
              >
                Контур
              </button>
            </div>
          </div>

          {/* Border radius */}
          <div>
            <label className="text-xs text-tg-hint mb-2 block">Скругление</label>
            <div className="flex gap-2">
              {[8, 12, 16].map((radius) => (
                <button
                  key={radius}
                  onClick={() => handleChange({ buttonRadius: radius as 8 | 12 | 16 })}
                  className={`px-4 py-2 rounded-lg ${
                    theme.buttonRadius === radius ? 'bg-brand text-white' : 'bg-tg-secondary'
                  }`}
                  style={{ borderRadius: `${radius}px` }}
                >
                  {radius}px
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Иконки */}
      <Card className="p-4">
        <h3 className="text-sm font-medium mb-3 flex items-center">
          <AppIcon name="star" variant="lucide" size={16} className="mr-2" />
          Иконки
        </h3>
        
        <div className="space-y-3">
          {/* Icon variant */}
          <div>
            <label className="text-xs text-tg-hint mb-2 block">Набор</label>
            <div className="flex gap-2">
              <button
                onClick={() => handleChange({ iconVariant: 'brand' })}
                className={`px-4 py-2 rounded-lg ${
                  theme.iconVariant === 'brand' ? 'bg-brand text-white' : 'bg-tg-secondary'
                }`}
              >
                Brand (собственные)
              </button>
              <button
                onClick={() => handleChange({ iconVariant: 'lucide' })}
                className={`px-4 py-2 rounded-lg ${
                  theme.iconVariant === 'lucide' ? 'bg-brand text-white' : 'bg-tg-secondary'
                }`}
              >
                Lucide (стандартные)
              </button>
            </div>
          </div>

          {/* Icon color (только для lucide) */}
          {theme.iconVariant === 'lucide' && (
            <div>
              <label className="text-xs text-tg-hint mb-2 block">Цвет</label>
              <div className="flex gap-2">
                {['auto', 'white', 'black'].map((color) => (
                  <button
                    key={color}
                    onClick={() => handleChange({ iconColor: color as 'auto' | 'white' | 'black' })}
                    className={`px-4 py-2 rounded-lg capitalize ${
                      theme.iconColor === color ? 'bg-brand text-white' : 'bg-tg-secondary'
                    }`}
                  >
                    {color === 'auto' ? 'Авто' : color === 'white' ? 'Белый' : 'Черный'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Действия */}
      <div className="flex gap-3">
        <Button variant="primary" onClick={handleSave} className="flex-1">
          <AppIcon name="save" variant="lucide" size={16} className="mr-2" />
          Сохранить
        </Button>
        <Button variant="outline" onClick={handleCancel}>
          Отменить
        </Button>
      </div>
    </div>
  );
}
