'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { locales, localeNames, defaultLocale, type Locale } from '@/i18n/config';

const localeFlags: Record<Locale, string> = {
  ru: '🇷🇺',
  en: '🇬🇧',
  kk: '🇰🇿',
};

/**
 * Builds the URL for switching to another locale.
 * With localePrefix: 'as-needed':
 *   - default locale (ru) has no prefix: /some-path
 *   - other locales have prefix:          /en/some-path
 */
function buildLocalePath(pathname: string, currentLocale: Locale, targetLocale: Locale): string {
  // Strip current locale prefix if it exists
  let basePath = pathname;

  if (currentLocale !== defaultLocale) {
    // Remove /<currentLocale> prefix
    const prefix = `/${currentLocale}`;
    if (basePath.startsWith(prefix)) {
      basePath = basePath.slice(prefix.length) || '/';
    }
  }

  // Add target locale prefix
  if (targetLocale === defaultLocale) {
    return basePath || '/';
  }
  return `/${targetLocale}${basePath === '/' ? '' : basePath}`;
}

export function LanguageSwitcher({ darkMode = false }: { darkMode?: boolean }) {
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function switchLocale(target: Locale) {
    if (target === locale) {
      setOpen(false);
      return;
    }
    const newPath = buildLocalePath(pathname, locale, target);
    setOpen(false);
    router.push(newPath);
  }

  const buttonBg = darkMode
    ? 'bg-white/10 hover:bg-white/20 border-white/20 text-gray-200'
    : 'bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-700';

  const dropdownBg = darkMode
    ? 'bg-gray-900 border-white/10'
    : 'bg-white border-gray-100';

  const itemHover = darkMode
    ? 'hover:bg-white/10 text-gray-200'
    : 'hover:bg-gray-50 text-gray-700';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm font-medium transition-colors ${buttonBg}`}
        aria-label="Switch language"
      >
        <span>{localeFlags[locale]}</span>
        <span className="hidden sm:inline">{locale.toUpperCase()}</span>
        <svg
          className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          className={`absolute right-0 top-full mt-1.5 w-36 rounded-xl shadow-xl border overflow-hidden z-50 ${dropdownBg}`}
        >
          {locales.map((loc) => (
            <button
              key={loc}
              onClick={() => switchLocale(loc)}
              className={`flex items-center gap-2.5 w-full px-3 py-2.5 text-sm transition-colors ${itemHover} ${
                loc === locale ? 'font-semibold' : ''
              }`}
            >
              <span>{localeFlags[loc]}</span>
              <span>{localeNames[loc]}</span>
              {loc === locale && (
                <svg className="ml-auto w-3.5 h-3.5 text-brand-400" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
