'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ThemeCustomizer, ThemeSettings } from '@/components/ThemeCustomizer';
import { getGiveawayTheme, saveGiveawayTheme, deleteGiveawayTheme, GiveawayThemeSettings } from '@/lib/api';

/**
 * Страница кастомизации темы розыгрыша (задача 9.6)
 * Доступна по /creator/giveaway/[id]/theme
 * Требует PRO/BUSINESS подписку
 */
export default function GiveawayThemePage() {
  const params = useParams();
  const router = useRouter();
  const giveawayId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState<boolean | null>(null);
  const [currentTheme, setCurrentTheme] = useState<Partial<ThemeSettings> | undefined>(undefined);

  const loadTheme = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getGiveawayTheme(giveawayId);
      if (res.ok) {
        setIsPremium(true);
        if (res.theme) {
          setCurrentTheme(apiThemeToSettings(res.theme));
        }
      } else if (res.error?.includes('subscription') || res.error?.includes('403')) {
        setIsPremium(false);
      } else {
        setError(res.error || 'Ошибка загрузки');
      }
    } catch {
      setError('Не удалось загрузить данные');
    } finally {
      setLoading(false);
    }
  }, [giveawayId]);

  useEffect(() => {
    loadTheme();
  }, [loadTheme]);

  const handleSave = async (theme: ThemeSettings) => {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await saveGiveawayTheme(giveawayId, settingsToApiTheme(theme));
      if (res.ok) {
        setCurrentTheme(theme);
        setSuccessMsg('Тема сохранена!');
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setError(res.error || 'Ошибка сохранения');
      }
    } catch {
      setError('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Сбросить тему к стандартной?')) return;
    setSaving(true);
    try {
      await deleteGiveawayTheme(giveawayId);
      setCurrentTheme(undefined);
      setSuccessMsg('Тема сброшена');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch {
      setError('Ошибка сброса темы');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-tg-bg flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-4 border-tg-button border-t-transparent rounded-full" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-tg-bg pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-tg-bg/95 backdrop-blur border-b border-tg-secondary/20 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-full hover:bg-tg-secondary/20 transition-colors"
          aria-label="Назад"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h1 className="text-base font-semibold flex-1">🎨 Кастомизация темы</h1>
        {isPremium && currentTheme && (
          <button
            onClick={handleReset}
            className="text-xs text-tg-hint hover:text-red-400 transition-colors px-2 py-1"
          >
            Сбросить
          </button>
        )}
      </div>

      {/* Уведомления */}
      {successMsg && (
        <div className="mx-4 mt-3 bg-green-500/15 border border-green-500/30 rounded-xl px-4 py-3 text-green-500 text-sm">
          ✅ {successMsg}
        </div>
      )}
      {error && (
        <div className="mx-4 mt-3 bg-red-500/15 border border-red-500/30 rounded-xl px-4 py-3 text-red-500 text-sm">
          ❌ {error}
        </div>
      )}

      {/* Сохранение */}
      {saving && (
        <div className="mx-4 mt-3 bg-tg-secondary/20 rounded-xl px-4 py-3 text-tg-hint text-sm flex items-center gap-2">
          <div className="animate-spin w-4 h-4 border-2 border-tg-button border-t-transparent rounded-full" />
          Сохранение...
        </div>
      )}

      <div className="px-4 pt-4 max-w-lg mx-auto">
        <ThemeCustomizer
          currentTheme={currentTheme}
          isPremium={isPremium ?? false}
          onSave={handleSave}
          onCancel={() => router.back()}
        />
      </div>
    </main>
  );
}

// ---- Helpers ----

function apiThemeToSettings(t: GiveawayThemeSettings): Partial<ThemeSettings> {
  return {
    primaryColor: t.accentColor || '#f2b6b6',
    backgroundColor: t.backgroundColor || '#ffffff',
    backgroundType: 'solid',
    buttonRadius: 12,
    buttonStyle: (t.buttonStyle as 'filled' | 'outline') || 'filled',
    iconVariant: (t.iconVariant as 'brand' | 'lucide') || 'brand',
    iconColor: (t.iconColor as 'auto' | 'white' | 'black') || 'auto',
  };
}

function settingsToApiTheme(t: ThemeSettings): GiveawayThemeSettings {
  return {
    backgroundColor: t.backgroundColor,
    accentColor: t.primaryColor,
    buttonStyle: t.buttonStyle === 'filled' ? 'default' : 'outline',
    iconVariant: t.iconVariant,
    iconColor: t.iconColor,
  };
}
