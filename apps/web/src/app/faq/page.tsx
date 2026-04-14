'use client';

import { useState, useMemo } from 'react';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AppIcon } from '@/components/AppIcon';

interface FaqItem {
  q: string;
  a: string;
}

interface FaqCategory {
  title: string;
  items: FaqItem[];
}

/**
 * Страница FAQ — аккордеон по категориям с поиском
 * Задача 14.1 из TASKS-14-features.md
 */
export default function FaqPage() {
  const t = useTranslations('faq');
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  // Ключи категорий фиксированы (совпадают с ключами в JSON)
  const categoryKeys = [
    'create',
    'types',
    'participate',
    'payments',
    'security',
    'errors',
    'catalog',
    'boosts',
  ] as const;

  // Получаем данные из i18n (raw JSON)
  const categories = useMemo<Record<string, FaqCategory>>(() => {
    const result: Record<string, FaqCategory> = {};
    for (const key of categoryKeys) {
      const raw = t.raw(`categories.${key}`) as { title: string; items: FaqItem[] };
      result[key] = raw;
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Фильтрация по поиску
  const filteredCategories = useMemo(() => {
    if (!search.trim()) return categories;

    const q = search.toLowerCase();
    const filtered: Record<string, FaqCategory> = {};

    for (const [key, cat] of Object.entries(categories)) {
      const items = cat.items.filter(
        (item) =>
          item.q.toLowerCase().includes(q) ||
          item.a.toLowerCase().includes(q)
      );
      if (items.length > 0) {
        filtered[key] = { ...cat, items };
      }
    }
    return filtered;
  }, [search, categories]);

  const hasResults = Object.keys(filteredCategories).length > 0;

  function toggleItem(id: string) {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <main className="min-h-screen bg-tg-bg pb-safe">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-tg-bg/95 backdrop-blur border-b border-tg-secondary">
        <div className="max-w-xl mx-auto px-4 pt-4 pb-3">
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={() => router.back()}
              className="p-2 -ml-2 rounded-full hover:bg-tg-secondary transition-colors"
              aria-label="Назад"
            >
              <AppIcon name="icon-back" size={20} />
            </button>
            <div>
              <h1 className="text-xl font-bold">{t('title')}</h1>
              <p className="text-xs text-tg-hint">{t('subtitle')}</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-tg-hint">
              <AppIcon name="icon-search" size={16} />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-tg-secondary text-sm text-tg-text placeholder-tg-hint focus:outline-none focus:ring-2 focus:ring-tg-button/30 transition"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-tg-hint hover:text-tg-text"
              >
                <AppIcon name="icon-close" size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-xl mx-auto px-4 py-4 space-y-4">
        {!hasResults ? (
          <div className="text-center py-16">
            <span className="block mb-3"><AppIcon name="icon-search" size={48} /></span>
            <p className="text-tg-hint">{t('noResults')}</p>
          </div>
        ) : (
          Object.entries(filteredCategories).map(([catKey, cat]) => (
            <div key={catKey} className="bg-tg-secondary rounded-xl overflow-hidden">
              {/* Category title */}
              <div className="px-4 py-3 border-b border-tg-bg">
                <h2 className="font-semibold text-sm text-tg-text">{cat.title}</h2>
              </div>

              {/* Items */}
              <div className="divide-y divide-tg-bg">
                {cat.items.map((item, idx) => {
                  const itemId = `${catKey}-${idx}`;
                  const isOpen = openItems.has(itemId);

                  return (
                    <div key={itemId}>
                      <button
                        onClick={() => toggleItem(itemId)}
                        className="w-full flex items-start justify-between gap-3 px-4 py-3 text-left hover:bg-tg-bg/50 transition-colors"
                      >
                        <span className="text-sm font-medium text-tg-text leading-snug flex-1">
                          {item.q}
                        </span>
                        <span className="flex-shrink-0 mt-0.5">
                          <AppIcon name="icon-back" size={16} className={`text-tg-hint transition-transform duration-200 ${isOpen ? 'rotate-90' : '-rotate-90'}`} />
                        </span>
                      </button>

                      <div
                        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                      >
                        <div className="overflow-hidden">
                          <div className="px-4 pb-4">
                            <p className="text-sm text-tg-hint leading-relaxed whitespace-pre-line">
                              {item.a}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
