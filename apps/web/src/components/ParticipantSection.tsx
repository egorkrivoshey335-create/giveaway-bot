'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import {
  getMyParticipations,
  getMyEntitlements,
  MyParticipation,
  ParticipationFilterStatus,
} from '@/lib/api';
import { AppIcon } from '@/components/AppIcon';
import { Mascot } from '@/components/Mascot';
import { SubscriptionBottomSheet } from '@/components/SubscriptionBottomSheet';

// Форматирование оставшегося времени
function formatTimeLeft(endAt: string): string {
  const end = new Date(endAt);
  const now = new Date();
  const diff = end.getTime() - now.getTime();

  if (diff <= 0) return '...';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// Ключи фильтров
const filterKeys: ParticipationFilterStatus[] = ['all', 'active', 'finished', 'won'];

// Карточка участия
function ParticipationCard({ participation }: { participation: MyParticipation }) {
  const router = useRouter();
  const t = useTranslations('participant');
  const tGiveaway = useTranslations('giveaway');
  const { giveaway, totalTickets, isWinner, winnerPlace } = participation;

  return (
    <div
      className="bg-tg-secondary rounded-xl overflow-hidden cursor-pointer hover:bg-tg-secondary/80 transition-colors relative"
      onClick={() => router.push(`/join/${giveaway.id}`)}
    >
      {/* Бейдж победителя */}
      {isWinner && winnerPlace !== null && (
        <div className="absolute top-2 right-2 bg-gradient-to-r from-yellow-400 to-yellow-500 text-black text-xs font-semibold px-2 py-1 rounded-full">
          {t('place', { place: winnerPlace })}
        </div>
      )}

      <div className="p-4">
        {/* Заголовок */}
        <h3 className="font-semibold text-lg line-clamp-2 pr-20 mb-2">
          {giveaway.title}
        </h3>

        {/* Статистика */}
        <div className="flex items-center gap-4 text-sm text-tg-hint mb-3">
          <span className="flex items-center gap-1">
            <AppIcon name="icon-ticket" size={16} className="shrink-0 text-tg-hint" />
            <span>{t('tickets', { count: totalTickets })}</span>
          </span>
          <span className="flex items-center gap-1">
            <AppIcon name="icon-group" size={14} className="shrink-0 text-tg-hint" />
            <span>{t('participants', { count: giveaway.participantsCount })}</span>
          </span>
        </div>

        {/* Статус */}
        <div className="text-sm">
          {giveaway.status === 'ACTIVE' && giveaway.endAt && (
            <span className="text-orange-500">
              {t('timeLeft', { time: formatTimeLeft(giveaway.endAt) })}
            </span>
          )}
          {giveaway.status === 'SCHEDULED' && (
            <span className="text-blue-500 inline-flex items-center gap-1">
              <AppIcon name="icon-calendar" size={14} className="shrink-0" />
              {tGiveaway('status.scheduled')}
            </span>
          )}
          {giveaway.status === 'FINISHED' && (
            <span className={isWinner ? 'text-yellow-600 font-medium' : 'text-tg-hint inline-flex items-center gap-1'}>
              {isWinner ? (
                t('youWon')
              ) : (
                <>
                  <AppIcon name="icon-success" size={14} className="shrink-0" />
                  {tGiveaway('status.finished')}
                </>
              )}
            </span>
          )}
          {giveaway.status === 'CANCELLED' && (
            <span className="text-red-500 inline-flex items-center gap-1">
              <AppIcon name="icon-error" size={14} className="shrink-0" />
              {tGiveaway('status.cancelled')}
            </span>
          )}
        </div>
      </div>

      {/* Кнопка перехода */}
      <div className="border-t border-tg-bg px-4 py-3 flex items-center justify-between">
        <span className="text-sm text-tg-hint">
          {giveaway.status === 'FINISHED' 
            ? tGiveaway('viewResults') 
            : tGiveaway('openGiveaway')}
        </span>
        <AppIcon name="icon-back" size={16} className="rotate-180 text-tg-link shrink-0" />
      </div>
    </div>
  );
}

// Пустое состояние
function EmptyState({ filter }: { filter: ParticipationFilterStatus }) {
  const t = useTranslations('participant.empty');

  const filterIcons: Record<ParticipationFilterStatus, ReactNode> = {
    all: <AppIcon name="icon-ticket" size={18} className="mx-auto text-tg-hint" />,
    active: <AppIcon name="icon-active" size={18} className="mx-auto text-tg-hint" />,
    finished: <AppIcon name="icon-completed" size={18} className="mx-auto text-tg-hint" />,
    won: <AppIcon name="icon-winner" size={18} className="mx-auto text-tg-hint" />,
    cancelled: <AppIcon name="icon-cancelled" size={18} className="mx-auto text-tg-hint" />,
  };

  return (
    <div className="flex flex-col items-center text-center py-12 bg-tg-secondary rounded-xl">
      <div className="mb-2">
        <Mascot type="state-empty" size={120} loop autoplay />
      </div>
      <h2 className="text-xl font-semibold mb-2">{t(`${filter}.title`)}</h2>
      <p className="text-tg-hint">{t(`${filter}.subtitle`)}</p>
    </div>
  );
}

type TierKey = 'FREE' | 'PLUS' | 'PRO' | 'BUSINESS';

function getTierFromEntitlements(items: { code: string }[]): TierKey {
  for (const item of items) {
    if (item.code === 'tier.business') return 'BUSINESS';
    if (item.code === 'tier.pro') return 'PRO';
    if (item.code === 'tier.plus') return 'PLUS';
  }
  return 'FREE';
}

function getNextTier(current: TierKey): 'plus' | 'pro' | 'business' {
  if (current === 'PLUS') return 'pro';
  if (current === 'PRO') return 'business';
  if (current === 'BUSINESS') return 'business';
  return 'plus';
}

export function ParticipantSection() {
  const router = useRouter();
  const t = useTranslations('participant');
  const tSub = useTranslations('subscription');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  
  const PAGE_SIZE = 20;

  const [filter, setFilter] = useState<ParticipationFilterStatus>('all');
  const [participations, setParticipations] = useState<MyParticipation[]>([]);
  const [counts, setCounts] = useState({ all: 0, active: 0, finished: 0, won: 0, cancelled: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [userTier, setUserTier] = useState<TierKey>('FREE');
  const [showSubscription, setShowSubscription] = useState(false);
  const [tierExpiry, setTierExpiry] = useState<string | null>(null);

  const loadParticipations = useCallback(async (reset = true) => {
    const currentOffset = reset ? 0 : offset;
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError(null);
    try {
      const res = await getMyParticipations({ status: filter, limit: PAGE_SIZE, offset: currentOffset });
      if (res.ok) {
        const newItems = res.participations || [];
        if (reset) {
          setParticipations(newItems);
          setOffset(PAGE_SIZE);
        } else {
          setParticipations(prev => [...prev, ...newItems]);
          setOffset(currentOffset + PAGE_SIZE);
        }
        setHasMore(newItems.length === PAGE_SIZE);
        if (res.counts) {
          setCounts(res.counts);
        }
      } else {
        setError(res.error || tErrors('loadFailed'));
      }
    } catch (err) {
      setError(tErrors('connectionError'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, tErrors]);

  useEffect(() => {
    setOffset(0);
    loadParticipations(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    getMyEntitlements().then(res => {
      if (res.ok && res.items) {
        const tier = getTierFromEntitlements(res.items);
        setUserTier(tier);
        const tierItem = res.items.find(i => i.code.startsWith('tier.'));
        if (tierItem?.expiresAt) setTierExpiry(tierItem.expiresAt);
      }
    }).catch(() => {});
  }, []);

  const filterButtonIcons: Partial<Record<ParticipationFilterStatus, ReactNode>> = {
    active: <AppIcon name="icon-active" size={18} className="shrink-0" />,
    finished: <AppIcon name="icon-completed" size={18} className="shrink-0" />,
    won: <AppIcon name="icon-winner" size={18} className="shrink-0" />,
    cancelled: <AppIcon name="icon-cancelled" size={18} className="shrink-0" />,
  };

  return (
    <>
    <div>
      {/* Заголовок */}
      <div className="mb-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <AppIcon name="icon-ticket" size={22} />
          {t('title')}
        </h2>
        <p className="text-tg-hint text-sm">{t('subtitle')}</p>
      </div>

      {/* Кнопка каталога */}
      <button
        onClick={() => router.push('/catalog')}
        className="catalog-btn relative w-full rounded-2xl py-4 px-5 mb-3 font-semibold hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2.5 overflow-hidden"
      >
        <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 animate-[shimmer_3s_ease-in-out_infinite]" />
        <AppIcon name="icon-giveaway" size={22} className="relative z-10 drop-shadow-sm" />
        <span className="relative z-10 text-[15px]">{t('catalogButton')}</span>
        <AppIcon name="icon-back" size={14} className="rotate-180 relative z-10 opacity-60" />
      </button>

      {/* Кнопка подписки */}
      <button
        onClick={() => setShowSubscription(true)}
        className="relative w-full rounded-2xl py-4 px-5 mb-6 font-semibold hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2.5 bg-gradient-to-r from-purple-500 to-blue-500 text-white overflow-hidden"
      >
        <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 animate-[shimmer_3s_ease-in-out_infinite]" />
        <AppIcon name="icon-diamond" size={20} className="relative z-10 drop-shadow-sm" />
        <span className="relative z-10 text-[15px]">
          {userTier === 'FREE'
            ? tSub('upgradeBtn', { tier: 'PLUS' })
            : userTier === 'PLUS'
            ? tSub('upgradeBtn', { tier: 'PRO' })
            : userTier === 'PRO'
            ? tSub('upgradeBtn', { tier: 'BUSINESS' })
            : tSub('manageBtn')}
        </span>
        {tierExpiry && userTier !== 'FREE' && (
          <span className="relative z-10 text-xs opacity-80 ml-1">
            · {(() => {
              const days = Math.ceil((new Date(tierExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              return days > 0 ? tSub('expiresIn', { days }) : '';
            })()}
          </span>
        )}
      </button>

      {/* Фильтры — сетка 2x2 */}
      <div className="grid grid-cols-2 gap-2 mb-6">
        {filterKeys.map((key) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
              filter === key
                ? 'bg-tg-button text-tg-button-text'
                : 'bg-tg-secondary text-tg-text hover:bg-tg-secondary/80'
            }`}
          >
            {filterButtonIcons[key] != null && (
              <span className="mr-1 inline-flex items-center align-middle">{filterButtonIcons[key]}</span>
            )}
            {t(`filters.${key}`)}
            {counts[key] !== undefined && counts[key] > 0 && (
              <span className="ml-1 opacity-70">({counts[key]})</span>
            )}
          </button>
        ))}
      </div>

      {/* Контент */}
      <AnimatePresence mode="wait">
        <motion.div
          layout
          key={`${filter}-${loading ? 'loading' : 'ready'}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94], layout: { duration: 0.35 } }}
        >
          {loading ? (
            <div className="flex flex-col items-center text-center py-8">
              <Mascot type="state-loading" size={100} loop autoplay />
              <p className="text-tg-hint mt-2">{tCommon('loading')}</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center text-center py-8 bg-tg-secondary rounded-xl">
              <div className="mb-2">
                <Mascot type="state-error" size={100} loop={false} autoplay />
              </div>
              <p className="text-tg-hint mb-4">{error}</p>
              <button
                onClick={() => loadParticipations(true)}
                className="bg-tg-button text-tg-button-text rounded-lg px-4 py-2"
              >
                {tCommon('tryAgain')}
              </button>
            </div>
          ) : participations.length === 0 ? (
            <EmptyState filter={filter} />
          ) : (
            <>
              <div className="grid gap-4">
                {participations.map((p) => (
                  <ParticipationCard key={p.id} participation={p} />
                ))}
              </div>
              {hasMore && (
                <button
                  onClick={() => loadParticipations(false)}
                  disabled={loadingMore}
                  className="w-full mt-4 py-3 bg-tg-secondary rounded-xl text-sm text-tg-hint hover:text-tg-text transition-colors disabled:opacity-50"
                >
                  {loadingMore ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin w-4 h-4 border-2 border-tg-button border-t-transparent rounded-full" />
                      {tCommon('loading')}
                    </span>
                  ) : (
                    tCommon('loadMore')
                  )}
                </button>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
    <SubscriptionBottomSheet
      isOpen={showSubscription}
      onClose={() => setShowSubscription(false)}
      currentTier={userTier === 'FREE' ? 'free' : userTier.toLowerCase() as 'plus' | 'pro' | 'business'}
      defaultTab="participants"
      defaultTier={getNextTier(userTier)}
    />
    </>
  );
}

export default ParticipantSection;
