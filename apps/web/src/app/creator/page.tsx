'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import {
  getGiveawaysList,
  duplicateGiveaway,
  deleteGiveaway,
  GiveawaySummary,
} from '@/lib/api';
import { InlineToast } from '@/components/Toast';
import { AppIcon } from '@/components/AppIcon';
import { Mascot } from '@/components/Mascot';
import { Stagger, StaggerItem } from '@/components/FadeIn';
import { SubscriptionBottomSheet } from '@/components/SubscriptionBottomSheet';
import { TIER_LIMITS } from '@randombeast/shared';

// Берём username бота из env
const BOT_USERNAME = process.env.NEXT_PUBLIC_BOT_USERNAME || 'BeastRandomBot';

// Статусы для фильтрации
type StatusFilter = 'all' | 'DRAFT' | 'PENDING_CONFIRM' | 'SCHEDULED' | 'ACTIVE' | 'FINISHED' | 'CANCELLED' | 'ERROR';

// Получить метку статуса (будет заменено на переводы в компоненте)
const STATUS_ICON_MAP: Record<string, string> = {
  'DRAFT': 'icon-edit',
  'PENDING_CONFIRM': 'icon-pending',
  'SCHEDULED': 'icon-calendar',
  'ACTIVE': 'icon-active',
  'FINISHED': 'icon-success',
  'CANCELLED': 'icon-cancelled',
  'ERROR': 'icon-warning',
};

function getStatusLabel(status: string, tGiveaway: ReturnType<typeof useTranslations<'giveaway'>>): string {
  const statusMap: Record<string, string> = {
    'DRAFT': 'draft',
    'PENDING_CONFIRM': 'pending',
    'SCHEDULED': 'scheduled',
    'ACTIVE': 'active',
    'FINISHED': 'finished',
    'CANCELLED': 'cancelled',
  };
  const key = statusMap[status];
  if (key) {
    return tGiveaway(`status.${key}`);
  }
  return status;
}

function StatusIcon({ status }: { status: string }) {
  const iconName = STATUS_ICON_MAP[status];
  if (!iconName) return null;
  return <AppIcon name={iconName} size={14} className="inline-block mr-1" />;
}

// Получить CSS класс для бейджа статуса
function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'DRAFT': return 'bg-gray-500/20 text-gray-600';
    case 'PENDING_CONFIRM': return 'bg-yellow-500/20 text-yellow-600';
    case 'SCHEDULED': return 'bg-blue-500/20 text-blue-600';
    case 'ACTIVE': return 'bg-green-500/20 text-green-600';
    case 'FINISHED': return 'bg-purple-500/20 text-purple-600';
    case 'CANCELLED': return 'bg-red-500/20 text-red-600';
    case 'ERROR': return 'bg-orange-500/20 text-orange-600';
    default: return 'bg-gray-500/20 text-gray-600';
  }
}

// Форматирование оставшегося времени
function formatTimeLeft(endAt: string, finishingText: string): string {
  const end = new Date(endAt);
  const now = new Date();
  const diff = end.getTime() - now.getTime();

  if (diff <= 0) return finishingText;

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}д ${hours}ч`;
  if (hours > 0) return `${hours}ч ${minutes}м`;
  return `${minutes}м`;
}

// Форматирование даты
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// Компонент карточки розыгрыша
function GiveawayCard({
  giveaway,
  onDuplicate,
  onDelete,
  onOpenDetails,
  onCopyLink,
  onEdit,
}: {
  giveaway: GiveawaySummary;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenDetails: (id: string) => void;
  onCopyLink: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const t = useTranslations('dashboard');
  const tGiveaway = useTranslations('giveaway');
  const tCard = useTranslations('dashboard.card');
  const tCommon = useTranslations('common');

  // Получить текст даты для карточки (всегда показываем, чтобы высота была одинаковой)
  const getDateInfo = () => {
    switch (giveaway.status) {
      case 'ACTIVE':
        return giveaway.endAt 
          ? { icon: 'icon-calendar', text: `${tCard('timeLeft')}: ${formatTimeLeft(giveaway.endAt, tCommon('finishing'))}`, className: 'text-orange-500' }
          : { text: tCard('noEndDate'), className: 'text-tg-hint' };
      case 'FINISHED':
        return { text: `${tCard('finished')} ${giveaway.endAt ? formatDate(giveaway.endAt) : ''}`, className: 'text-tg-hint' };
      case 'SCHEDULED':
        return giveaway.startAt
          ? { text: `${tCard('startsAt')}: ${formatDate(giveaway.startAt)}`, className: 'text-blue-500' }
          : { text: tCard('noStartDate'), className: 'text-tg-hint' };
      case 'PENDING_CONFIRM':
        return { text: tCard('pendingConfirm'), className: 'text-yellow-600' };
      case 'DRAFT':
        return { text: `${tCard('created')} ${formatDate(giveaway.createdAt)}`, className: 'text-tg-hint' };
      case 'CANCELLED':
        return { text: tCard('cancelled'), className: 'text-red-500' };
      default:
        return { text: `${tCard('created')} ${formatDate(giveaway.createdAt)}`, className: 'text-tg-hint' };
    }
  };

  const dateInfo = getDateInfo();

  return (
    <div
      className="bg-tg-secondary rounded-xl overflow-hidden cursor-pointer hover:bg-tg-secondary/80 transition-colors"
      onClick={() => onOpenDetails(giveaway.id)}
    >
      {/* Заголовок карточки */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {giveaway.isSandbox && (
              <span className="text-xs bg-orange-500/15 text-orange-400 px-2 py-0.5 rounded-full font-medium flex-shrink-0 flex items-center gap-1"><AppIcon name="icon-sandbox" size={12} /> Тест</span>
            )}
            <h3 className="font-semibold text-lg line-clamp-2">{giveaway.title || tCard('noTitle')}</h3>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap flex items-center ${getStatusBadgeClass(giveaway.status)}`}>
            <StatusIcon status={giveaway.status} />
            {getStatusLabel(giveaway.status, tGiveaway)}
          </span>
        </div>

        {/* Статистика */}
        <div className="flex items-center gap-4 text-sm text-tg-hint mb-3">
          <span className="flex items-center gap-1.5">
            <AppIcon name="icon-participant" variant="brand" size={16} />
            <span>{giveaway.participantsCount}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <AppIcon name="icon-winner" variant="brand" size={16} />
            <span>{giveaway.winnersCount}</span>
          </span>
        </div>

        {/* Дата — всегда показываем для одинаковой высоты карточек */}
        <div className={`text-sm flex items-center gap-1 ${dateInfo.className}`}>
          {'icon' in dateInfo && dateInfo.icon && <AppIcon name={dateInfo.icon} size={14} />}
          {dateInfo.text}
        </div>
      </div>

      {/* Действия */}
      <div className="flex border-t border-tg-bg">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetails(giveaway.id);
          }}
          className="flex-1 py-3 text-sm text-tg-link hover:bg-tg-bg/50 transition-colors"
        >
          <span className="flex items-center justify-center gap-1.5">
            <AppIcon name="icon-analytics" variant="brand" size={16} />
            {t('menu.stats')}
          </span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate(giveaway.id);
          }}
          className="flex-1 py-3 text-sm text-tg-link hover:bg-tg-bg/50 transition-colors border-l border-tg-bg"
        >
          <span className="flex items-center justify-center gap-1.5">
            <AppIcon name="icon-copy" variant="brand" size={16} />
            {t('menu.copy')}
          </span>
        </button>
        {/* Меню с действиями */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}
            className="px-4 py-3 text-sm text-tg-hint hover:bg-tg-bg/50 transition-colors border-l border-tg-bg"
          >
            ⋮
          </button>
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                }}
              />
              <div className="absolute right-0 bottom-full mb-1 bg-tg-bg rounded-lg shadow-lg z-20 min-w-[180px] overflow-hidden">
                {/* Редактировать — для черновиков */}
                {giveaway.status === 'DRAFT' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onEdit(giveaway.id);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-tg-text hover:bg-tg-secondary"
                  >
                    {t('menu.edit')}
                  </button>
                )}
                {/* Опубликовать — для ожидающих подтверждения */}
                {giveaway.status === 'PENDING_CONFIRM' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onEdit(giveaway.id);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-tg-text hover:bg-tg-secondary"
                  >
                    {t('menu.publish')}
                  </button>
                )}
                {/* Поделиться — для активных и запланированных */}
                {(giveaway.status === 'ACTIVE' || giveaway.status === 'SCHEDULED') && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onCopyLink(giveaway.id);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-tg-text hover:bg-tg-secondary"
                  >
                    {t('menu.share')}
                  </button>
                )}
                {/* Результаты — для завершённых */}
                {giveaway.status === 'FINISHED' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onOpenDetails(giveaway.id);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-tg-text hover:bg-tg-secondary"
                  >
                    {t('menu.results')}
                  </button>
                )}
                {/* Удалить — для черновиков, ожидающих и отменённых */}
                {(giveaway.status === 'DRAFT' || giveaway.status === 'PENDING_CONFIRM' || giveaway.status === 'CANCELLED') && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onDelete(giveaway.id);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-red-500 hover:bg-tg-secondary"
                  >
                    {t('menu.delete')}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CreatorDashboardPage() {
  const router = useRouter();
  const t = useTranslations('dashboard');
  const tGiveaway = useTranslations('giveaway');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');

  const GIVEAWAY_PAGE_SIZE = 20;

  const [initialLoading, setInitialLoading] = useState(true);
  const [filterLoading, setFilterLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [giveawayOffset, setGiveawayOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [giveaways, setGiveaways] = useState<GiveawaySummary[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [userTier, setUserTier] = useState<'FREE' | 'PLUS' | 'PRO' | 'BUSINESS'>('FREE');
  const [showSubscription, setShowSubscription] = useState(false);

  useEffect(() => {
    fetch('/api/users/me/entitlements', { credentials: 'include' })
      .then(r => r.json())
      .then((data: { ok?: boolean; data?: { tier?: string } }) => {
        const tier = data?.data?.tier as typeof userTier;
        if (tier) setUserTier(tier);
      })
      .catch(() => {});
  }, []);

  // Загрузка розыгрышей
  const loadGiveaways = useCallback(async (reset = true) => {
    const currentOffset = reset ? 0 : giveawayOffset;
    if (reset) {
      setFilterLoading(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const res = await getGiveawaysList({
        status: statusFilter === 'all' ? undefined : statusFilter,
        limit: GIVEAWAY_PAGE_SIZE,
        offset: currentOffset,
      });

      if (!res.ok) {
        setError(res.error || tErrors('loadFailed'));
        return;
      }

      const newItems = res.giveaways || [];
      if (reset) {
        setGiveaways(newItems);
        setGiveawayOffset(GIVEAWAY_PAGE_SIZE);
      } else {
        setGiveaways(prev => [...prev, ...newItems]);
        setGiveawayOffset(currentOffset + GIVEAWAY_PAGE_SIZE);
      }
      setHasMore(newItems.length === GIVEAWAY_PAGE_SIZE);

      if (res.counts) {
        setCounts({
          all: res.counts.all,
          DRAFT: res.counts.draft,
          PENDING_CONFIRM: res.counts.pendingConfirm,
          SCHEDULED: res.counts.scheduled,
          ACTIVE: res.counts.active,
          FINISHED: res.counts.finished,
          CANCELLED: res.counts.cancelled,
          ERROR: res.counts.error || 0,
        });
      }
    } catch (err) {
      console.error('Failed to load giveaways:', err);
      setError(tErrors('loadFailed'));
    } finally {
      setInitialLoading(false);
      setFilterLoading(false);
      setLoadingMore(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, tErrors]);

  useEffect(() => {
    setGiveawayOffset(0);
    loadGiveaways(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  // Дублировать розыгрыш
  const handleDuplicate = async (id: string) => {
    try {
      const res = await duplicateGiveaway(id);
      if (res.ok && res.newGiveawayId) {
        setMessage(t('duplicated'));
        // Переходим к редактированию копии
        router.push(`/creator/giveaway/new?draft=${res.newGiveawayId}`);
      } else {
        setMessage(res.error || tErrors('error'));
      }
    } catch (err) {
      console.error('Duplicate error:', err);
      setMessage(tErrors('error'));
    }
    setTimeout(() => setMessage(null), 3000);
  };

  // Удалить розыгрыш
  const handleDelete = async (id: string) => {
    if (!confirm(t('deleteConfirmSimple'))) {
      return;
    }

    try {
      const res = await deleteGiveaway(id);
      if (res.ok) {
        setMessage(t('deleted'));
        loadGiveaways();
      } else {
        setMessage(res.error || tErrors('error'));
      }
    } catch (err) {
      console.error('Delete error:', err);
      setMessage(tErrors('error'));
    }
    setTimeout(() => setMessage(null), 3000);
  };

  // Открыть детали
  const handleOpenDetails = (id: string) => {
    router.push(`/creator/giveaway/${id}`);
  };

  // Скопировать ссылку
  const handleCopyLink = (id: string) => {
    const link = `https://t.me/${BOT_USERNAME}/participate?startapp=join_${id}`;
    navigator.clipboard.writeText(link);
    setMessage(t('linkCopied'));
    setTimeout(() => setMessage(null), 2000);
  };

  // Редактировать/Опубликовать
  const handleEdit = (id: string) => {
    router.push(`/creator/giveaway/new?draft=${id}`);
  };

  // Фильтры
  const filters: { key: StatusFilter; label: string; icon: string }[] = [
    { key: 'all',       label: t('filters.all'),       icon: '' },
    { key: 'ACTIVE',    label: t('filters.active'),    icon: 'icon-active' },
    { key: 'SCHEDULED', label: t('filters.scheduled'), icon: 'icon-calendar' },
    { key: 'FINISHED',  label: t('filters.finished'),  icon: 'icon-completed' },
    { key: 'DRAFT',     label: t('filters.draft'),     icon: 'icon-edit' },
    ...(counts['ERROR'] ? [{ key: 'ERROR' as StatusFilter, label: 'Ошибка', icon: 'icon-warning' }] : []),
  ];

  if (initialLoading) {
    return (
      <main className="min-h-screen p-4">
        <div className="max-w-xl mx-auto flex flex-col items-center text-center py-12">
          <Mascot type="state-loading" size={100} loop autoplay />
          <p className="text-tg-hint mt-2">{tCommon('loading')}</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen p-4">
        <div className="max-w-xl mx-auto flex flex-col items-center text-center py-12">
          <Mascot type="state-error" size={100} loop={false} autoplay />
          <p className="text-tg-hint mb-4 mt-2">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-tg-button text-tg-button-text rounded-lg px-4 py-2"
          >
            {tCommon('refresh')}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-xl mx-auto">
        <Stagger>
          <StaggerItem>
            <motion.button
              onClick={() => router.push('/')}
              className="flex items-center gap-1 text-tg-link text-sm mb-4"
            >
              <AppIcon name="icon-back" size={16} />
              Назад
            </motion.button>
          </StaggerItem>

          {/* Header — как в Участнике */}
          <StaggerItem>
            <div className="mb-4">
              <h1 className="text-xl font-bold flex items-center gap-2">
                <AppIcon name="icon-giveaway" size={22} />
                {t('title')}
              </h1>
              <p className="text-tg-hint text-sm">{t('subtitle')}</p>
            </div>
          </StaggerItem>

          {/* Кнопка «Создать розыгрыш» — как в CreatorSection */}
          <StaggerItem>
            {(() => {
              const activeCount = giveaways.filter(g =>
                ['ACTIVE', 'SCHEDULED', 'PENDING_CONFIRM'].includes(g.status)
              ).length;
              const maxActive = TIER_LIMITS.maxActiveGiveaways[userTier];
              const limitReached = activeCount >= maxActive;

              return (
                <>
                  <button
                    onClick={() => {
                      if (limitReached) {
                        setShowSubscription(true);
                      } else {
                        router.push('/creator/giveaway/new');
                      }
                    }}
                    className="w-full bg-tg-button text-tg-button-text rounded-xl py-3 px-4 font-medium mb-2 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                  >
                    <AppIcon name="icon-create" size={18} />
                    {t('createGiveaway')}
                  </button>
                  {limitReached && (
                    <p className="text-xs text-orange-500 text-center mb-4">
                      <AppIcon name="icon-warning" size={12} className="inline mr-1" />
                      {`Достигнут лимит активных розыгрышей: ${maxActive} (${userTier})`}
                    </p>
                  )}
                  {!limitReached && (
                    <p className="text-xs text-tg-hint text-center mb-4">
                      {`${activeCount} / ${maxActive === Infinity ? '∞' : maxActive}`}
                    </p>
                  )}
                </>
              );
            })()}
          </StaggerItem>

          {/* Быстрые блоки (Каналы, Посты — 2 колонки, Профиль — на всю ширину) */}
          <StaggerItem>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button
                onClick={() => router.push('/creator/channels')}
                className="bg-tg-secondary rounded-xl p-4 hover:bg-tg-secondary/80 transition-colors flex flex-col items-center text-center"
              >
                <AppIcon name="icon-channel" variant="brand" size={28} className="mb-2" />
                <div className="text-sm font-semibold">{t('channelsShort')}</div>
              </button>

              <button
                onClick={() => {
                  const tg = window.Telegram?.WebApp;
                  const link = `https://t.me/${BOT_USERNAME}?start=posts`;
                  if (tg) {
                    tg.openTelegramLink(link);
                  } else {
                    window.open(link, '_blank');
                  }
                }}
                className="bg-tg-secondary rounded-xl p-4 hover:bg-tg-secondary/80 transition-colors flex flex-col items-center text-center"
              >
                <AppIcon name="icon-edit" variant="brand" size={28} className="mb-2" />
                <div className="text-sm font-semibold">{t('blocks.posts.short')}</div>
              </button>

              <button
                onClick={() => router.push('/creator/profile')}
                className="bg-tg-secondary rounded-xl p-4 hover:bg-tg-secondary/80 transition-colors flex flex-col items-center text-center col-span-2"
              >
                <AppIcon name="icon-participant" variant="brand" size={28} className="mb-2" />
                <div className="text-sm font-semibold">{t('profile')}</div>
              </button>
            </div>
          </StaggerItem>

          {/* Сообщение */}
          <InlineToast message={message} onClose={() => setMessage(null)} />

          {/* Фильтры — сетка 2×2, нечётный по центру */}
          <StaggerItem>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {filters.map((f, idx) => (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                    statusFilter === f.key
                      ? 'bg-tg-button text-tg-button-text'
                      : 'bg-tg-secondary text-tg-text hover:bg-tg-secondary/80'
                  } ${filters.length % 2 !== 0 && idx === filters.length - 1 ? 'col-span-2 max-w-[50%] mx-auto' : ''}`}
                >
                  {f.icon && <span className="mr-1 inline-flex items-center align-middle"><AppIcon name={f.icon} variant="brand" size={18} /></span>}
                  {f.label}
                  {counts[f.key] !== undefined && (
                    <span className="ml-1 opacity-70">({counts[f.key]})</span>
                  )}
                </button>
              ))}
            </div>
          </StaggerItem>

          {/* Список розыгрышей */}
          <StaggerItem>
            <AnimatePresence mode="wait">
              <motion.div
                layout
                key={`${statusFilter}-${filterLoading ? 'loading' : 'ready'}`}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94], layout: { duration: 0.35 } }}
              >
                {filterLoading ? (
                  <div className="flex flex-col items-center text-center py-8">
                    <Mascot type="state-loading" size={80} loop autoplay />
                    <p className="text-tg-hint text-sm mt-2">{tCommon('loading')}</p>
                  </div>
                ) : giveaways.length > 0 ? (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      {giveaways.map((g) => (
                        <GiveawayCard
                          key={g.id}
                          giveaway={g}
                          onDuplicate={handleDuplicate}
                          onDelete={handleDelete}
                          onOpenDetails={handleOpenDetails}
                          onCopyLink={handleCopyLink}
                          onEdit={handleEdit}
                        />
                      ))}
                    </div>
                    {hasMore && (
                      <button
                        onClick={() => loadGiveaways(false)}
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
                ) : (
                  <div className="flex flex-col items-center text-center py-8 bg-tg-secondary rounded-xl">
                    <div className="mb-2">
                      <Mascot type="state-empty" size={120} loop autoplay />
                    </div>
                    <h2 className="text-xl font-semibold mb-2">
                      {statusFilter === 'all' ? t('empty.title') : t('empty.titleFiltered')}
                    </h2>
                    <p className="text-tg-hint mb-6">
                      {t('empty.subtitle')}
                    </p>
                    <button
                      onClick={() => router.push('/creator/giveaway/new')}
                      className="bg-tg-button text-tg-button-text rounded-lg px-6 py-3 font-medium"
                    >
                      {t('createGiveaway')}
                    </button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </StaggerItem>
        </Stagger>
      </div>

      <SubscriptionBottomSheet
        isOpen={showSubscription}
        onClose={() => setShowSubscription(false)}
      />
    </main>
  );
}
