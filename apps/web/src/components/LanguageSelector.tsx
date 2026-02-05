'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { locales, localeNames, Locale } from '@/i18n/config';
import { setLocale, getCurrentLocale } from '@/hooks/useLocale';

interface LanguageSelectorProps {
  /** Дополнительный класс для контейнера */
  className?: string;
}

/**
 * Компонент выбора языка для настроек
 * 
 * @example
 * <LanguageSelector />
 */
export function LanguageSelector({ className = '' }: LanguageSelectorProps) {
  const t = useTranslations('settings');
  const [currentLocale, setCurrentLocale] = useState<Locale>(getCurrentLocale());
  const [loading, setLoading] = useState(false);

  const handleChange = async (newLocale: Locale) => {
    if (newLocale === currentLocale || loading) return;
    
    setLoading(true);
    setCurrentLocale(newLocale);
    
    // Устанавливаем cookie и перезагружаем страницу
    setLocale(newLocale);
    
    // setLocale вызывает reload, но на всякий случай
    setLoading(false);
  };

  return (
    <div className={`bg-tg-secondary rounded-xl p-4 ${className}`}>
      <h3 className="font-semibold mb-4">{t('language')}</h3>
      
      <div className="grid gap-2">
        {locales.map((locale) => (
          <button
            key={locale}
            onClick={() => handleChange(locale)}
            disabled={loading}
            className={`w-full px-4 py-3 rounded-xl text-left font-medium transition-colors ${
              currentLocale === locale
                ? 'bg-tg-button text-tg-button-text'
                : 'bg-tg-bg text-tg-text hover:bg-tg-bg/80'
            } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span className="flex items-center justify-between">
              <span>{localeNames[locale]}</span>
              {currentLocale === locale && <span>✓</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default LanguageSelector;
