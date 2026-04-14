'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ThemeCustomizer, ThemeSettings } from '@/components/ThemeCustomizer';
import { getGiveawayTheme, saveGiveawayTheme, deleteGiveawayTheme, GiveawayThemeSettings } from '@/lib/api';
import { AppIcon } from '@/components/AppIcon';
import { Mascot } from '@/components/Mascot';
import { SubscriptionBottomSheet } from '@/components/SubscriptionBottomSheet';

/**
 * Страница кастомизации темы розыгрыша (задача 9.6)
 * Доступна по /creator/giveaway/[id]/theme
 * Требует BUSINESS подписку
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
  const [showSubscription, setShowSubscription] = useState(false);

  const loadTheme = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Check tier first
      const tierRes = await fetch('/api/users/me/entitlements', { credentials: 'include' });
      const tierData = await tierRes.json() as { data?: { tier?: string } };
      const tier = tierData?.data?.tier || 'FREE';
      const hasBusiness = tier === 'BUSINESS';
      setIsPremium(hasBusiness);

      if (hasBusiness) {
        const res = await getGiveawayTheme(giveawayId);
        if (res.ok && res.theme) {
          setCurrentTheme(apiThemeToSettings(res.theme));
        }
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
      <main className="min-h-screen bg-tg-bg flex flex-col items-center justify-center">
        <Mascot type="state-loading" size={100} loop autoplay />
        <p className="text-tg-hint text-sm mt-2">Загрузка...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-tg-bg pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-tg-bg/95 backdrop-blur border-b border-tg-secondary/20 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-tg-secondary/60"
        >
          <AppIcon name="icon-back" size={18} />
        </button>
        <AppIcon name="icon-theme" size={20} />
        <h1 className="text-base font-semibold flex-1">Кастомизация темы</h1>
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
          <AppIcon name="icon-success" size={14} /> {successMsg}
        </div>
      )}
      {error && (
        <div className="mx-4 mt-3 bg-red-500/15 border border-red-500/30 rounded-xl px-4 py-3 text-red-500 text-sm">
          <AppIcon name="icon-error" size={14} /> {error}
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
          onUpgrade={() => setShowSubscription(true)}
        />
      </div>

      <SubscriptionBottomSheet
        isOpen={showSubscription}
        onClose={() => setShowSubscription(false)}
      />
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
