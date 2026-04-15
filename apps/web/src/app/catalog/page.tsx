'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getCatalog, getInitData, CatalogGiveaway } from '@/lib/api';
import { SubscriptionBottomSheet } from '@/components/SubscriptionBottomSheet';
import { AppIcon } from '@/components/AppIcon';
import { Mascot } from '@/components/Mascot';
import { AnimatePresence, motion } from 'framer-motion';

// Тип для функции перевода (упрощённый для передачи как пропс)
type TranslateFunc = (key: string, values?: Record<string, string | number | Date>) => string;

// Форматирование оставшегося времени
function formatTimeLeft(
  endAt: string,
  t: TranslateFunc
): string {
  const end = new Date(endAt);
  const now = new Date();
  const diff = end.getTime() - now.getTime();

  if (diff <= 0) return t('time.ending');

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) return t('time.daysHours', { days, hours });
  return t('time.hours', { hours });
}

// Форматирование числа (1500 → 1.5K)
function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

// Карточка розыгрыша в каталоге (всегда заблюрена без подписки)
function CatalogCard({
  giveaway,
  t,
}: {
  giveaway: CatalogGiveaway;
  t: TranslateFunc;
}) {
  return (
    <div className="bg-tg-secondary rounded-xl overflow-hidden">
      <div className="p-4">
        {/* Информация о канале */}
        {giveaway.channel && (
          <div className="flex items-center gap-2 mb-3">
            <AppIcon name="icon-channel" variant="brand" size={20} />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{giveaway.channel.title}</div>
              <div className="text-xs text-tg-hint">
                {giveaway.channel.username || `${formatNumber(giveaway.channel.subscribersCount)} ${t('subscribers')}`}
              </div>
            </div>
          </div>
        )}

        {/* Название розыгрыша */}
        <h3 className="font-semibold line-clamp-2 mb-3">{giveaway.title}</h3>

        {/* Статистика */}
        <div className="flex items-center gap-4 text-sm text-tg-hint">
          <span className="flex items-center gap-1.5">
            <AppIcon name="icon-participant" variant="brand" size={15} />
            <span>{formatNumber(giveaway.participantsCount)}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <AppIcon name="icon-winner" variant="brand" size={15} />
            <span>{giveaway.winnersCount}</span>
          </span>
          {giveaway.endAt && (
            <span className="flex items-center gap-1.5">
              <AppIcon name="icon-calendar" variant="brand" size={15} />
              <span>{formatTimeLeft(giveaway.endAt, t)}</span>
            </span>
          )}
        </div>
      </div>

      {/* Кнопка */}
      <div className="border-t border-tg-bg px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-tg-link">{t('participate')}</span>
          <AppIcon name="icon-back" variant="brand" size={16} className="rotate-180" />
        </div>
      </div>
    </div>
  );
}

// Карточка для пользователя с доступом (кликабельная)
function CatalogCardWithAccess({
  giveaway,
  onClick,
  t,
}: {
  giveaway: CatalogGiveaway;
  onClick: () => void;
  t: TranslateFunc;
}) {
  return (
    <div
      className="bg-tg-secondary rounded-xl overflow-hidden cursor-pointer hover:bg-tg-secondary/80 transition-all"
      onClick={onClick}
    >
      <div className="p-4">
        {/* Информация о канале */}
        {giveaway.channel && (
          <div className="flex items-center gap-2 mb-3">
            <AppIcon name="icon-channel" variant="brand" size={20} />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{giveaway.channel.title}</div>
              <div className="text-xs text-tg-hint">
                {giveaway.channel.username || `${formatNumber(giveaway.channel.subscribersCount)} ${t('subscribers')}`}
              </div>
            </div>
          </div>
        )}

        {/* Название розыгрыша */}
        <h3 className="font-semibold line-clamp-2 mb-3">{giveaway.title}</h3>

        {/* Статистика */}
        <div className="flex items-center gap-4 text-sm text-tg-hint">
          <span className="flex items-center gap-1.5">
            <AppIcon name="icon-participant" variant="brand" size={15} />
            <span>{formatNumber(giveaway.participantsCount)}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <AppIcon name="icon-winner" variant="brand" size={15} />
            <span>{giveaway.winnersCount}</span>
          </span>
          {giveaway.endAt && (
            <span className="flex items-center gap-1.5">
              <AppIcon name="icon-calendar" variant="brand" size={15} />
              <span>{formatTimeLeft(giveaway.endAt, t)}</span>
            </span>
          )}
        </div>
      </div>

      {/* Кнопка */}
      <div className="border-t border-tg-bg px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-tg-link">{t('participate')}</span>
          <AppIcon name="icon-back" size={16} className="rotate-180 text-tg-hint" />
        </div>
      </div>
    </div>
  );
}

function PaywallFullOverlay({
  total,
  onShowModal,
  t,
}: {
  total: number;
  onShowModal: () => void;
  t: TranslateFunc;
}) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col">
      <div className="flex-1 bg-gradient-to-b from-transparent via-tg-bg/70 to-tg-bg pointer-events-none" />
      
      <div className="bg-tg-bg p-4">
        <div className="bg-tg-secondary rounded-xl p-6 flex flex-col items-center text-center">
          <Mascot type="state-locked" size={100} loop autoplay />
          <div className="h-2" />
          <h3 className="text-xl font-bold mb-2">{t('giveawaysCount', { count: total })}</h3>
          <p className="text-tg-hint text-sm mb-4">
            {t('paywall.description')}
          </p>

          <button
            onClick={onShowModal}
            className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-xl py-3 px-4 font-medium"
          >
            {t('paywall.unlock')}
          </button>
          <p className="text-xs text-tg-hint mt-2">{t('paywall.includedInPlus')}</p>
        </div>
      </div>
    </div>
  );
}

// Фильтры каталога
type SortKey = 'totalParticipants' | 'endAt' | 'createdAt';

function CatalogFilters({
  sortBy,
  onSortChange,
}: {
  sortBy: SortKey;
  onSortChange: (s: SortKey) => void;
}) {
  const options: { key: SortKey; label: string; icon: string }[] = [
    { key: 'totalParticipants', label: 'Участники', icon: 'icon-group' },
    { key: 'endAt', label: 'Срок', icon: 'icon-calendar' },
    { key: 'createdAt', label: 'Новые', icon: 'icon-create' },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((o, i) => (
        <button
          key={o.key}
          onClick={() => onSortChange(o.key)}
          className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 flex items-center justify-center gap-1.5 ${
            sortBy === o.key
              ? 'bg-tg-button text-tg-button-text'
              : 'bg-tg-secondary text-tg-hint'
          } ${options.length % 2 !== 0 && i === options.length - 1 ? 'col-span-2 max-w-[50%] mx-auto w-full' : ''}`}
        >
          <AppIcon name={o.icon} size={14} />
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function CatalogPage() {
  const router = useRouter();
  const t = useTranslations('catalog');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  
  const [giveaways, setGiveaways] = useState<CatalogGiveaway[]>([]);
  const [hasAccess, setHasAccess] = useState(false);
  const [total, setTotal] = useState(0);
  const [previewCount, setPreviewCount] = useState(3);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('totalParticipants');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [userTier, setUserTier] = useState<'FREE' | 'PLUS' | 'PRO' | 'BUSINESS'>('FREE');

  const loadCatalog = useCallback(async (append = false, newCursor?: string) => {
    if (!append) setLoading(true);
    else setLoadingMore(true);

    try {
      const res = await getCatalog({ limit: 20, cursor: newCursor, sortBy });
      if (res.ok) {
        if (append) {
          setGiveaways((prev) => [...prev, ...(res.giveaways || [])]);
        } else {
          setGiveaways(res.giveaways || []);
        }
        setHasAccess(res.hasAccess || false);
        setTotal(res.total || 0);
        setPreviewCount(res.previewCount || 3);
        setHasMore(res.hasMore || false);
        if (res.nextCursor) setCursor(res.nextCursor);
      } else {
        setError(res.error || tErrors('loadFailed'));
      }
    } catch {
      setError(tErrors('connectionError'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [tErrors, sortBy]);

  useEffect(() => {
    setCursor(undefined);
    loadCatalog(false, undefined);
  }, [loadCatalog]);

  useEffect(() => {
    getInitData().then((data) => {
      const tier = data?.config?.subscriptionTier as typeof userTier;
      if (tier) setUserTier(tier);
    }).catch(() => {});
  }, []);

  const handleLoadMore = () => {
    loadCatalog(true, cursor);
  };

  const handleSortChange = (newSort: SortKey) => {
    if (newSort !== sortBy) {
      setSortBy(newSort);
    }
  };

  const goBack = () => {
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-tg-bg">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-tg-bg border-b border-tg-secondary">
        <div className="max-w-xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3 mb-2">
            <button onClick={goBack} className="text-tg-link text-sm hover:opacity-70 flex items-center gap-1">
              <AppIcon name="icon-back" size={16} />
              {tCommon('back')}
            </button>
            <h1 className="text-lg font-semibold text-tg-text flex-1">
              {t('title')}
            </h1>
          </div>
          {/* Фильтры сортировки */}
          {hasAccess && (
            <CatalogFilters sortBy={sortBy} onSortChange={handleSortChange} />
          )}
        </div>
      </header>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key={`${sortBy}-loading`}
            className="max-w-xl mx-auto p-4"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            layout
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94], layout: { duration: 0.35 } }}
          >
            <div className="text-center py-12">
              <div className="animate-spin w-8 h-8 border-2 border-tg-button border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-tg-hint">{tCommon('loading')}</p>
            </div>
          </motion.div>
        ) : error ? (
          <motion.div
            key="error"
            className="max-w-xl mx-auto p-4"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            layout
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94], layout: { duration: 0.35 } }}
          >
            <div className="text-center py-12 bg-tg-secondary rounded-xl">
              <div className="flex justify-center mb-4"><AppIcon name="icon-error" size={40} /></div>
              <p className="text-tg-hint mb-4">{error}</p>
              <button
                onClick={() => loadCatalog()}
                className="bg-tg-button text-tg-button-text rounded-lg px-4 py-2"
              >
                {tCommon('tryAgain')}
              </button>
            </div>
          </motion.div>
        ) : giveaways.length === 0 ? (
          <motion.div
            key={`${sortBy}-empty`}
            className="max-w-xl mx-auto p-4"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            layout
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94], layout: { duration: 0.35 } }}
          >
            <div className="flex flex-col items-center text-center py-8 bg-tg-secondary rounded-xl">
              <Mascot type="state-empty" size={120} loop autoplay />
              <div className="h-2" />
              <h2 className="text-xl font-semibold mb-2">{t('empty')}</h2>
              <p className="text-tg-hint mb-6">{t('emptySubtitle')}</p>

              {!hasAccess && (
                <button
                  onClick={() => setShowModal(true)}
                  className="bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-xl py-3 px-6 font-medium"
                >
                  {t('paywall.unlock')}
                </button>
              )}

              {hasAccess && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 mt-4">
                  <p className="text-sm text-green-600">{t('hasAccess')}</p>
                </div>
              )}
            </div>
          </motion.div>
        ) : hasAccess ? (
          <motion.div
            key={`${sortBy}-list`}
            className="max-w-xl mx-auto p-4"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            layout
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94], layout: { duration: 0.35 } }}
          >
            <p className="text-tg-hint text-sm mb-4">
              {t('subtitle')}
            </p>

            {/* Список розыгрышей — кликабельные */}
            <div className="grid gap-4">
              {giveaways.map((g) => (
                <CatalogCardWithAccess
                  key={g.id}
                  giveaway={g}
                  onClick={() => router.push(`/join/${g.id}`)}
                  t={t}
                />
              ))}
            </div>

            {/* Загрузить ещё */}
            {hasMore && (
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="w-full mt-4 bg-tg-secondary text-tg-text rounded-xl py-3 px-4 font-medium hover:bg-tg-secondary/80 transition-colors"
              >
                {loadingMore ? tCommon('loading') : t('loadMore')}
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div
            key={`${sortBy}-paywall`}
            className="relative flex-1"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            layout
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94], layout: { duration: 0.35 } }}
          >
            {/* Контент за overlay — виден, но не кликабелен */}
            <div className="max-w-xl mx-auto p-4 pointer-events-none">
              <p className="text-tg-hint text-sm mb-4">
                {t('subtitle')}
              </p>

              {/* Показываем только превью карточек */}
              <div className="grid gap-4">
                {giveaways.slice(0, previewCount).map((g) => (
                  <CatalogCard key={g.id} giveaway={g} t={t} />
                ))}
              </div>
            </div>

            {/* Полноэкранный paywall overlay */}
            <PaywallFullOverlay
              total={total}
              onShowModal={() => setShowModal(true)}
              t={t}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <SubscriptionBottomSheet
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        defaultTab="participants"
        defaultTier="plus"
        currentTier={userTier === 'FREE' ? 'free' : userTier.toLowerCase() as 'plus' | 'pro' | 'business'}
      />
    </div>
  );
}
