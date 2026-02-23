'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { getMyProfile, updateNotifications, UserProfile } from '@/lib/api';

// Emoji для каждого бейджа
const BADGE_EMOJI: Record<string, string> = {
  newcomer: '🌱',
  activist: '🔥',
  veteran: '⚔️',
  winner: '🏆',
  multi_winner: '🥇',
  champion: '👑',
  friend: '🤝',
  patron: '💎',
};

const BADGE_LABEL: Record<string, string> = {
  newcomer: 'Новичок',
  activist: 'Активист',
  veteran: 'Ветеран',
  winner: 'Победитель',
  multi_winner: 'Мульти-победитель',
  champion: 'Чемпион',
  friend: 'Друг',
  patron: 'Меценат',
};

/**
 * Страница профиля создателя — статистика, бейджи, уведомления
 * Задачи 4.6 и 14.6 из TASKS-14-features.md
 */
export default function CreatorProfilePage() {
  const t = useTranslations('creatorProfile');
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingNotif, setTogglingNotif] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMyProfile();
      if (res.ok && res.profile) {
        setProfile(res.profile);
      } else {
        setError(res.error || 'Не удалось загрузить профиль');
      }
    } catch {
      setError('Ошибка соединения');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleToggleNotifications() {
    if (!profile) return;
    setTogglingNotif(true);
    try {
      const newValue = !profile.notificationsBlocked;
      const res = await updateNotifications(newValue);
      if (res.ok) {
        setProfile((prev) => prev ? { ...prev, notificationsBlocked: newValue } : prev);
        showMessage(newValue ? '🔕 Уведомления отключены' : '🔔 Уведомления включены');
      }
    } finally {
      setTogglingNotif(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-tg-bg pb-safe">
        <div className="bg-tg-secondary border-b border-tg-secondary p-4">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div className="w-10 h-10 bg-tg-bg rounded-full animate-pulse" />
            <div className="w-32 h-6 bg-tg-bg rounded animate-pulse" />
            <div className="w-10" />
          </div>
        </div>
        <div className="max-w-2xl mx-auto p-4 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-tg-secondary rounded-xl p-4">
              <div className="h-5 bg-tg-bg rounded w-1/3 mb-4 animate-pulse" />
              <div className="grid grid-cols-2 gap-4">
                {[1, 2].map((j) => (
                  <div key={j} className="h-14 bg-tg-bg rounded-lg animate-pulse" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="min-h-screen bg-tg-bg p-4 pb-safe">
        <div className="max-w-2xl mx-auto py-12 text-center">
          <span className="text-6xl mb-4 block">😔</span>
          <h2 className="text-xl font-semibold mb-2">{t('error.title')}</h2>
          <p className="text-tg-hint mb-6">{error ?? t('error.description')}</p>
          <Link
            href="/creator"
            className="inline-block bg-tg-button text-tg-button-text rounded-lg px-6 py-3 font-medium"
          >
            {t('error.backButton')}
          </Link>
        </div>
      </main>
    );
  }

  const memberDays = Math.floor(
    (Date.now() - new Date(profile.joinedAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  const growthPercent =
    profile.stats.lastMonth.participants > 0
      ? Math.round(
          ((profile.stats.thisMonth.participants - profile.stats.lastMonth.participants) /
            profile.stats.lastMonth.participants) *
            100
        )
      : 0;

  const subscriptionColor =
    profile.subscriptionTier === 'FREE'
      ? 'bg-gray-500/20 text-gray-500'
      : profile.subscriptionTier === 'PLUS'
      ? 'bg-blue-500/20 text-blue-500'
      : 'bg-purple-500/20 text-purple-500';

  return (
    <main className="min-h-screen bg-tg-bg pb-safe">
      {/* Toast */}
      {message && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-tg-text text-tg-bg text-sm px-4 py-2.5 rounded-full shadow-lg">
          {message}
        </div>
      )}

      {/* Header */}
      <div className="bg-tg-secondary border-b border-tg-bg p-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-full hover:bg-tg-bg transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Профиль */}
        <div className="bg-tg-secondary rounded-xl p-4">
          <div className="flex items-start gap-4">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-tg-button to-tg-button/60 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
              {(profile.firstName || '?').charAt(0)}
              {profile.lastName?.charAt(0) || ''}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-semibold mb-1">
                {profile.firstName} {profile.lastName}
                {profile.isPremium && <span className="ml-1 text-yellow-400">⭐</span>}
              </h2>
              {profile.username && (
                <p className="text-sm text-tg-hint mb-2">@{profile.username}</p>
              )}
              <div className="flex flex-wrap items-center gap-2 text-xs text-tg-hint">
                <span>📅 {t('member', { days: memberDays })}</span>
                <span className={`px-2 py-0.5 rounded-full font-medium ${subscriptionColor}`}>
                  {profile.subscriptionTier === 'FREE' && '🆓 FREE'}
                  {profile.subscriptionTier === 'PLUS' && '⭐ PLUS+'}
                  {profile.subscriptionTier === 'PRO' && '💎 PRO+'}
                </span>
              </div>
              {profile.entitlementExpiresAt && (
                <p className="text-xs text-tg-hint mt-1">
                  До: {new Date(profile.entitlementExpiresAt).toLocaleDateString('ru-RU')}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4">
            <Link
              href="/creator/subscription"
              className="bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg py-2 px-4 text-sm font-medium text-center"
            >
              ⭐ {t('upgradePremium')}
            </Link>
            <button
              onClick={handleToggleNotifications}
              disabled={togglingNotif}
              className={`flex items-center justify-center gap-2 rounded-lg py-2 px-4 text-sm font-medium transition-colors ${
                profile.notificationsBlocked
                  ? 'bg-red-500/10 text-red-500'
                  : 'bg-tg-bg text-tg-text'
              }`}
            >
              {profile.notificationsBlocked ? '🔕 Уведомления выкл.' : '🔔 Уведомления вкл.'}
            </button>
          </div>
        </div>

        {/* Бейджи */}
        {profile.badges.length > 0 && (
          <div className="bg-tg-secondary rounded-xl p-4">
            <h3 className="text-lg font-semibold mb-3">🏅 Мои достижения</h3>
            <div className="flex flex-wrap gap-2">
              {profile.badges.map((badge) => (
                <div
                  key={badge.code}
                  title={new Date(badge.earnedAt).toLocaleDateString('ru-RU')}
                  className="flex items-center gap-1.5 bg-tg-bg rounded-full px-3 py-1.5 text-sm"
                >
                  <span>{BADGE_EMOJI[badge.code] ?? '🎖'}</span>
                  <span className="font-medium">{BADGE_LABEL[badge.code] ?? badge.code}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Общая статистика */}
        <div className="bg-tg-secondary rounded-xl p-4">
          <h3 className="text-lg font-semibold mb-4">{t('stats.overall')}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-tg-button">{profile.stats.totalGiveaways}</div>
              <div className="text-xs text-tg-hint mt-1">{t('stats.totalGiveaways')}</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-500">{profile.stats.activeGiveaways}</div>
              <div className="text-xs text-tg-hint mt-1">{t('stats.activeGiveaways')}</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-500">{profile.stats.totalParticipants.toLocaleString()}</div>
              <div className="text-xs text-tg-hint mt-1">{t('stats.totalParticipants')}</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-500">{profile.stats.totalWinners}</div>
              <div className="text-xs text-tg-hint mt-1">{t('stats.totalWinners')}</div>
            </div>
          </div>
        </div>

        {/* Динамика за месяц */}
        <div className="bg-tg-secondary rounded-xl p-4">
          <h3 className="text-lg font-semibold mb-4">{t('stats.thisMonth')}</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-tg-hint">{t('stats.giveaways')}:</span>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">{profile.stats.thisMonth.giveaways}</span>
                <span className="text-xs text-tg-hint">
                  ({profile.stats.lastMonth.giveaways} {t('stats.lastMonth')})
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-tg-hint">{t('stats.participants')}:</span>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">{profile.stats.thisMonth.participants}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    growthPercent > 0
                      ? 'bg-green-500/20 text-green-500'
                      : growthPercent < 0
                      ? 'bg-red-500/20 text-red-500'
                      : 'bg-gray-500/20 text-gray-500'
                  }`}
                >
                  {growthPercent > 0 && '↗'}
                  {growthPercent < 0 && '↘'}
                  {growthPercent === 0 && '→'}
                  {' '}{Math.abs(growthPercent)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Быстрые действия */}
        <div className="bg-tg-secondary rounded-xl p-4">
          <h3 className="text-lg font-semibold mb-4">{t('quickActions.title')}</h3>
          <div className="space-y-2">
            <Link
              href="/creator/giveaway/new"
              className="flex items-center justify-between p-3 bg-tg-bg rounded-lg hover:bg-tg-bg/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">🎁</span>
                <span className="font-medium">{t('quickActions.newGiveaway')}</span>
              </div>
              <svg className="w-5 h-5 text-tg-hint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            <Link
              href="/creator/channels"
              className="flex items-center justify-between p-3 bg-tg-bg rounded-lg hover:bg-tg-bg/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">📣</span>
                <span className="font-medium">{t('quickActions.manageChannels')}</span>
              </div>
              <svg className="w-5 h-5 text-tg-hint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            <Link
              href="/participant/history"
              className="flex items-center justify-between p-3 bg-tg-bg rounded-lg hover:bg-tg-bg/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">📊</span>
                <span className="font-medium">{t('quickActions.history')}</span>
              </div>
              <svg className="w-5 h-5 text-tg-hint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            <Link
              href="/creator/ban-list"
              className="flex items-center justify-between p-3 bg-tg-bg rounded-lg hover:bg-tg-bg/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">🚫</span>
                <span className="font-medium">Бан-лист</span>
              </div>
              <svg className="w-5 h-5 text-tg-hint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
