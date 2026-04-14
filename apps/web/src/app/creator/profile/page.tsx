'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { getMyProfile, updateNotifications, UserProfile } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { AppIcon } from '@/components/AppIcon';
import { SubscriptionBottomSheet } from '@/components/SubscriptionBottomSheet';

function ProfileAvatar({ firstName, lastName }: { firstName: string | null; lastName: string | null }) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    try {
      const url = window.Telegram?.WebApp?.initDataUnsafe?.user?.photo_url;
      if (url) setPhotoUrl(url);
    } catch { /* not in Telegram context */ }
  }, []);

  const initials = `${(firstName || '?').charAt(0)}${lastName?.charAt(0) || ''}`;

  return (
    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-tg-button to-tg-button/60 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0 overflow-hidden relative">
      {photoUrl && !imgFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="w-full h-full object-cover" onError={() => setImgFailed(true)} />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

const BADGE_EMOJI: Record<string, React.ReactNode> = {
  newcomer: '🌱',
  activist: '🔥',
  veteran: '⚔️',
  winner: <AppIcon name="icon-winner" size={14} />,
  multi_winner: '🥇',
  champion: '👑',
  friend: '🤝',
  patron: <AppIcon name="icon-diamond" size={14} />,
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
  const tCommon = useTranslations('common');
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingNotif, setTogglingNotif] = useState(false);
  const [showSubscription, setShowSubscription] = useState(false);

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
      }
    } finally {
      setTogglingNotif(false);
    }
  }

  return (
    <main className="min-h-screen bg-tg-bg pb-safe">
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <div className="sticky top-0 z-10 bg-tg-bg border-b border-tg-secondary">
              <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-3">
                <div className="w-10 h-10 bg-tg-secondary rounded-lg animate-pulse" />
                <div className="w-32 h-6 bg-tg-secondary rounded animate-pulse" />
              </div>
            </div>
            <div className="max-w-xl mx-auto p-4 space-y-4">
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
          </motion.div>
        ) : error || !profile ? (
          <motion.div
            key="error"
            className="p-4 pb-safe"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <div className="max-w-xl mx-auto py-12 text-center">
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
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {(() => {
              const p = profile;
              const memberDays = Math.floor(
                (Date.now() - new Date(p.joinedAt).getTime()) / (1000 * 60 * 60 * 24)
              );
              const growthPercent =
                p.stats.lastMonth.participants > 0
                  ? Math.round(
                      ((p.stats.thisMonth.participants - p.stats.lastMonth.participants) /
                        p.stats.lastMonth.participants) *
                        100
                    )
                  : 0;
              const subscriptionColor =
                p.subscriptionTier === 'FREE'
                  ? 'bg-gray-500/20 text-gray-500'
                  : p.subscriptionTier === 'PLUS'
                  ? 'bg-blue-500/20 text-blue-500'
                  : p.subscriptionTier === 'PRO'
                  ? 'bg-purple-500/20 text-purple-500'
                  : 'bg-amber-500/20 text-amber-600';
              return (
                <>
                  <div className="sticky top-0 z-10 bg-tg-bg border-b border-tg-secondary">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1 text-tg-link text-sm hover:opacity-70"
          >
            <AppIcon name="icon-back" size={16} /> {tCommon('back')}
          </button>
          <h1 className="text-lg font-semibold text-tg-text flex-1">{t('title')}</h1>
        </div>
      </div>

      <div className="max-w-xl mx-auto p-4 space-y-4">
        {/* Профиль */}
        <div className="bg-tg-secondary rounded-xl p-4">
          <div className="flex items-start gap-4">
            <ProfileAvatar firstName={p.firstName} lastName={p.lastName} />
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-semibold mb-1">
                {p.firstName} {p.lastName}
                {p.isPremium && <span className="ml-1 text-yellow-400"><AppIcon name="icon-star" size={14} /></span>}
              </h2>
              {p.username && (
                <p className="text-sm text-tg-hint mb-2">@{p.username}</p>
              )}
              <div className="flex flex-wrap items-center gap-2 text-xs text-tg-hint">
                <span className="flex items-center gap-1"><AppIcon name="icon-calendar" size={14} /> {t('member', { days: memberDays })}</span>
                <span className={`px-2 py-0.5 rounded-full font-medium ${subscriptionColor}`}>
                  {p.subscriptionTier === 'FREE' && 'FREE'}
                  {p.subscriptionTier === 'PLUS' && <><AppIcon name="icon-star" size={14} /> PLUS</>}
                  {p.subscriptionTier === 'PRO' && <><AppIcon name="icon-diamond" size={14} /> PRO</>}
                  {p.subscriptionTier === 'BUSINESS' && <><AppIcon name="icon-diamond" size={14} /> BUSINESS</>}
                </span>
              </div>
              {p.entitlementExpiresAt && (
                <p className="text-xs text-tg-hint mt-1">
                  Активна до {new Date(p.entitlementExpiresAt).toLocaleDateString('ru-RU')}
                  {' · '}
                  {(() => {
                    const days = Math.ceil((new Date(p.entitlementExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    return days > 0 ? `${days} дн.` : 'истекла';
                  })()}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4">
            <button
              onClick={() => setShowSubscription(true)}
              className="bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg py-2 px-4 text-sm font-medium text-center flex items-center justify-center gap-1"
            >
              <AppIcon name="icon-star" size={14} />
              {p.subscriptionTier === 'FREE'
                ? 'Повысить до PLUS'
                : p.subscriptionTier === 'PLUS'
                ? 'Повысить до PRO'
                : p.subscriptionTier === 'PRO'
                ? 'Повысить до BUSINESS'
                : t('upgradePremium')}
            </button>
            <AnimatePresence mode="wait">
              <motion.button
                key={p.notificationsBlocked ? 'off' : 'on'}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                onClick={handleToggleNotifications}
                disabled={togglingNotif}
                className={`flex items-center justify-center gap-2 rounded-lg py-2 px-4 text-sm font-medium transition-colors ${
                  p.notificationsBlocked
                    ? 'bg-red-500/10 text-red-500'
                    : 'bg-tg-bg text-tg-text'
                }`}
              >
                <AppIcon name="icon-notification" size={14} />
                {p.notificationsBlocked ? t('notifOff') : t('notifOn')}
              </motion.button>
            </AnimatePresence>
          </div>
        </div>

        {/* Бейджи */}
        {p.badges.length > 0 && (
          <div className="bg-tg-secondary rounded-xl p-4">
            <h3 className="text-lg font-semibold mb-3">🏅 Мои достижения</h3>
            <div className="flex flex-wrap gap-2">
              {p.badges.map((badge) => (
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
              <div className="text-3xl font-bold text-tg-button">{p.stats.totalGiveaways}</div>
              <div className="text-xs text-tg-hint mt-1">{t('stats.totalGiveaways')}</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-500">{p.stats.activeGiveaways}</div>
              <div className="text-xs text-tg-hint mt-1">{t('stats.activeGiveaways')}</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-500">{p.stats.totalParticipants.toLocaleString()}</div>
              <div className="text-xs text-tg-hint mt-1">{t('stats.totalParticipants')}</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-500">{p.stats.totalWinners}</div>
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
                <span className="text-lg font-semibold">{p.stats.thisMonth.giveaways}</span>
                <span className="text-xs text-tg-hint">
                  ({p.stats.lastMonth.giveaways} {t('stats.lastMonth')})
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-tg-hint">{t('stats.participants')}:</span>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">{p.stats.thisMonth.participants}</span>
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
                <span className="text-2xl"><AppIcon name="icon-giveaway" size={16} /></span>
                <span className="font-medium">{t('quickActions.newGiveaway')}</span>
              </div>
              <AppIcon name="icon-back" size={16} className="rotate-180" />
            </Link>
            <Link
              href="/creator/channels"
              className="flex items-center justify-between p-3 bg-tg-bg rounded-lg hover:bg-tg-bg/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl"><AppIcon name="icon-channel" size={14} /></span>
                <span className="font-medium">{t('quickActions.manageChannels')}</span>
              </div>
              <AppIcon name="icon-back" size={16} className="rotate-180" />
            </Link>
            <Link
              href="/participant/history"
              className="flex items-center justify-between p-3 bg-tg-bg rounded-lg hover:bg-tg-bg/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl"><AppIcon name="icon-chart" size={14} /></span>
                <span className="font-medium">{t('quickActions.history')}</span>
              </div>
              <AppIcon name="icon-back" size={16} className="rotate-180" />
            </Link>
            <Link
              href="/creator/ban-list"
              className="flex items-center justify-between p-3 bg-tg-bg rounded-lg hover:bg-tg-bg/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl"><AppIcon name="icon-cancel" size={14} /></span>
                <span className="font-medium">Бан-лист</span>
              </div>
              <AppIcon name="icon-back" size={16} className="rotate-180" />
            </Link>
          </div>
        </div>
      </div>
                </>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>
      <SubscriptionBottomSheet
        isOpen={showSubscription}
        onClose={() => setShowSubscription(false)}
        currentTier={
          profile?.subscriptionTier === 'FREE' ? 'free'
          : profile?.subscriptionTier === 'PLUS' ? 'plus'
          : profile?.subscriptionTier === 'PRO' ? 'pro'
          : profile?.subscriptionTier === 'BUSINESS' ? 'business'
          : 'free'
        }
        defaultTab="creators"
        defaultTier={
          profile?.subscriptionTier === 'PLUS' ? 'pro'
          : profile?.subscriptionTier === 'PRO' ? 'business'
          : profile?.subscriptionTier === 'BUSINESS' ? 'business'
          : 'plus'
        }
      />
    </main>
  );
}
