'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

// TODO: TASKS-10 - API для профиля создателя
interface CreatorProfile {
  id: string;
  username?: string;
  firstName: string;
  lastName?: string;
  totalGiveaways: number;
  activeGiveaways: number;
  totalParticipants: number;
  totalWinners: number;
  joinedAt: string;
  subscription: 'FREE' | 'PRO' | 'BUSINESS';
  stats: {
    thisMonth: {
      giveaways: number;
      participants: number;
    };
    lastMonth: {
      giveaways: number;
      participants: number;
    };
  };
}

/**
 * Страница профиля создателя — статистика, настройки, история
 * 
 * Задача 4.6 из TASKS-4-creator.md
 */
export default function CreatorProfilePage() {
  const t = useTranslations('creatorProfile');
  const tCommon = useTranslations('common');
  const router = useRouter();

  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: TASKS-10 - загрузить профиль через API
    // Временные моковые данные
    setTimeout(() => {
      setProfile({
        id: '1',
        username: 'demo_creator',
        firstName: 'Иван',
        lastName: 'Иванов',
        totalGiveaways: 15,
        activeGiveaways: 3,
        totalParticipants: 2456,
        totalWinners: 45,
        joinedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        subscription: 'FREE',
        stats: {
          thisMonth: {
            giveaways: 3,
            participants: 345,
          },
          lastMonth: {
            giveaways: 5,
            participants: 567,
          },
        },
      });
      setLoading(false);
    }, 500);
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-tg-bg pb-safe">
        {/* Header Skeleton */}
        <div className="bg-tg-secondary border-b border-tg-secondary p-4">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div className="w-10 h-10 bg-tg-bg rounded-full animate-pulse" />
            <div className="w-32 h-6 bg-tg-bg rounded animate-pulse" />
            <div className="w-10" />
          </div>
        </div>

        <div className="max-w-2xl mx-auto p-4 space-y-4">
          {/* Profile Card Skeleton */}
          <div className="bg-tg-secondary rounded-xl p-4">
            <div className="flex items-start gap-4">
              <div className="w-20 h-20 rounded-full bg-tg-bg animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-6 bg-tg-bg rounded w-3/4 animate-pulse" />
                <div className="h-4 bg-tg-bg rounded w-1/2 animate-pulse" />
                <div className="h-4 bg-tg-bg rounded w-2/3 animate-pulse" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <div className="h-10 bg-tg-bg rounded-lg animate-pulse" />
              <div className="h-10 bg-tg-bg rounded-lg animate-pulse" />
            </div>
          </div>

          {/* Stats Skeleton */}
          <div className="bg-tg-secondary rounded-xl p-4">
            <div className="h-6 bg-tg-bg rounded w-1/3 mb-4 animate-pulse" />
            <div className="grid grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="text-center space-y-2">
                  <div className="h-10 bg-tg-bg rounded animate-pulse mx-auto w-20" />
                  <div className="h-4 bg-tg-bg rounded animate-pulse mx-auto w-24" />
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions Skeleton */}
          <div className="bg-tg-secondary rounded-xl p-4">
            <div className="h-6 bg-tg-bg rounded w-1/3 mb-4 animate-pulse" />
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-tg-bg rounded-lg animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-tg-bg p-4 pb-safe">
        <div className="max-w-2xl mx-auto py-12 text-center">
          <span className="text-6xl mb-4 block">😔</span>
          <h2 className="text-xl font-semibold mb-2">{t('error.title')}</h2>
          <p className="text-tg-hint mb-6">{t('error.description')}</p>
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

  return (
    <main className="min-h-screen bg-tg-bg pb-safe">
      {/* Header */}
      <div className="bg-tg-secondary border-b border-tg-secondary p-4">
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
          <div className="w-10" /> {/* Spacer */}
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Профиль пользователя */}
        <div className="bg-tg-secondary rounded-xl p-4">
          <div className="flex items-start gap-4">
            {/* Аватар */}
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-tg-button to-tg-button/60 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
              {profile.firstName.charAt(0)}
              {profile.lastName?.charAt(0) || ''}
            </div>

            {/* Инфо */}
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-semibold mb-1">
                {profile.firstName} {profile.lastName}
              </h2>
              {profile.username && (
                <p className="text-sm text-tg-hint mb-2">@{profile.username}</p>
              )}
              <div className="flex items-center gap-2 text-xs text-tg-hint">
                <span>📅 {t('member', { days: memberDays })}</span>
                <span>•</span>
                <span className={`px-2 py-0.5 rounded-full ${
                  profile.subscription === 'FREE'
                    ? 'bg-gray-500/20 text-gray-600'
                    : profile.subscription === 'PRO'
                    ? 'bg-blue-500/20 text-blue-600'
                    : 'bg-purple-500/20 text-purple-600'
                }`}>
                  {profile.subscription === 'FREE' && '🆓'}
                  {profile.subscription === 'PRO' && '⭐'}
                  {profile.subscription === 'BUSINESS' && '💼'}
                  {' '}{profile.subscription}
                </span>
              </div>
            </div>
          </div>

          {/* Кнопки действий */}
          <div className="grid grid-cols-2 gap-2 mt-4">
            <Link
              href="/creator/subscription"
              className="bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg py-2 px-4 text-sm font-medium text-center"
            >
              ⭐ {t('upgradePremium')}
            </Link>
            <button
              onClick={() => {
                // TODO: открыть настройки
                alert('Настройки в разработке');
              }}
              className="bg-tg-bg rounded-lg py-2 px-4 text-sm font-medium"
            >
              ⚙️ {t('settings')}
            </button>
          </div>
        </div>

        {/* Общая статистика */}
        <div className="bg-tg-secondary rounded-xl p-4">
          <h3 className="text-lg font-semibold mb-4">{t('stats.overall')}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-tg-button">{profile.totalGiveaways}</div>
              <div className="text-xs text-tg-hint mt-1">{t('stats.totalGiveaways')}</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-500">{profile.activeGiveaways}</div>
              <div className="text-xs text-tg-hint mt-1">{t('stats.activeGiveaways')}</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-500">{profile.totalParticipants}</div>
              <div className="text-xs text-tg-hint mt-1">{t('stats.totalParticipants')}</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-500">{profile.totalWinners}</div>
              <div className="text-xs text-tg-hint mt-1">{t('stats.totalWinners')}</div>
            </div>
          </div>
        </div>

        {/* Динамика за месяц */}
        <div className="bg-tg-secondary rounded-xl p-4">
          <h3 className="text-lg font-semibold mb-4">{t('stats.thisMonth')}</h3>
          <div className="space-y-3">
            {/* Розыгрыши */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-tg-hint">{t('stats.giveaways')}:</span>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">{profile.stats.thisMonth.giveaways}</span>
                <span className="text-xs text-tg-hint">
                  ({profile.stats.lastMonth.giveaways} {t('stats.lastMonth')})
                </span>
              </div>
            </div>

            {/* Участники */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-tg-hint">{t('stats.participants')}:</span>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">{profile.stats.thisMonth.participants}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    growthPercent > 0
                      ? 'bg-green-500/20 text-green-600'
                      : growthPercent < 0
                      ? 'bg-red-500/20 text-red-600'
                      : 'bg-gray-500/20 text-gray-600'
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

            <button
              onClick={() => {
                // TODO: открыть историю
                alert('История в разработке');
              }}
              className="w-full flex items-center justify-between p-3 bg-tg-bg rounded-lg hover:bg-tg-bg/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">📊</span>
                <span className="font-medium">{t('quickActions.history')}</span>
              </div>
              <svg className="w-5 h-5 text-tg-hint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
