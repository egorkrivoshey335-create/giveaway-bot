'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  getGiveawayFull,
  getGiveawayStats,
  getGiveawayParticipants,
  duplicateGiveaway,
  startGiveaway,
  cancelGiveaway,
  retryGiveaway,
  updateGiveaway,
  getParticipantCount,
  getTopInviters,
  banParticipant,
  getLivenessChecks,
  approveLiveness,
  rejectLiveness,
  getLivenessPhotoUrl,
  GiveawayFull,
  GiveawayStats,
  GiveawayParticipant,
  TopInviter,
  LivenessCheck,
} from '@/lib/api';
import { TIER_LIMITS } from '@randombeast/shared';
import { InlineToast } from '@/components/Toast';
import { ShareBottomSheet } from '@/components/ShareBottomSheet';
import { StatsBottomSheet } from '@/components/StatsBottomSheet';
import { SubscriptionBottomSheet } from '@/components/SubscriptionBottomSheet';
import { AnimatedCounter } from '@/components/AnimatedCounter';
import { AppIcon } from '@/components/AppIcon';
import { Mascot } from '@/components/Mascot';
import { DateTimePicker } from '@/components/DateTimePicker';
import { AnimatePresence, motion } from 'framer-motion';

// Берём username бота из env
const BOT_USERNAME = process.env.NEXT_PUBLIC_BOT_USERNAME || 'BeastRandomBot';

type TabType = 'overview' | 'participants' | 'winners' | 'stories' | 'liveness';

// Получить метку статуса
const STATUS_ICON_MAP: Record<string, string> = {
  'DRAFT': 'icon-edit',
  'PENDING_CONFIRM': 'icon-pending',
  'SCHEDULED': 'icon-calendar',
  'ACTIVE': 'icon-active',
  'FINISHED': 'icon-success',
  'CANCELLED': 'icon-cancelled',
  'ERROR': 'icon-warning',
};

function StatusIcon({ status }: { status: string }) {
  const iconName = STATUS_ICON_MAP[status];
  if (!iconName) return null;
  return <AppIcon name={iconName} size={14} className="inline-block mr-1" />;
}

function getStatusLabel(status: string, t: ReturnType<typeof useTranslations<'giveawayDetails'>>): string {
  switch (status) {
    case 'DRAFT': return t('status.draft');
    case 'PENDING_CONFIRM': return t('status.pendingConfirm');
    case 'SCHEDULED': return t('status.scheduled');
    case 'ACTIVE': return t('status.active');
    case 'FINISHED': return t('status.finished');
    case 'CANCELLED': return t('status.cancelled');
    case 'ERROR': return t('status.error');
    default: return status;
  }
}

// Форматирование даты
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Компонент карточки статистики
function StatCard({ icon, label, value, subValue }: { icon: string; label: string; value: number | string; subValue?: string }) {
  return (
    <div className="bg-tg-secondary rounded-lg p-4 text-center transition-all duration-300 hover:scale-105">
      <div className="flex justify-center mb-1">
        <AppIcon name={icon} variant="brand" size={28} />
      </div>
      <div className="text-2xl font-bold">
        {typeof value === 'number' ? (
          <AnimatedCounter value={value} />
        ) : (
          value
        )}
      </div>
      <div className="text-xs text-tg-hint">{label}</div>
      {subValue && <div className="text-xs text-green-500 mt-1">{subValue}</div>}
    </div>
  );
}

export default function GiveawayDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations('giveawayDetails');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const giveawayId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [giveaway, setGiveaway] = useState<GiveawayFull | null>(null);
  const [stats, setStats] = useState<GiveawayStats | null>(null);
  const [participants, setParticipants] = useState<GiveawayParticipant[]>([]);
  const [participantsTotal, setParticipantsTotal] = useState(0);
  const [topInviters, setTopInviters] = useState<TopInviter[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  // Liveness check (10.19)
  const [livenessChecks, setLivenessChecks] = useState<LivenessCheck[]>([]);
  const [livenessStats, setLivenessStats] = useState<{
    pending: number; approved: number; rejected: number; notSubmitted: number;
  } | null>(null);
  const [livenessFilter, setLivenessFilter] = useState<string>('PENDING');
  const [livenessLoading, setLivenessLoading] = useState(false);

  // BottomSheet states
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [showStatsSheet, setShowStatsSheet] = useState(false);

  // Модалки
  const [showStartModal, setShowStartModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [banTarget, setBanTarget] = useState<{ id: string; name: string } | null>(null);

  // Subscription tier (for stats gating & CSV export)
  const [userTier, setUserTier] = useState<'FREE' | 'PLUS' | 'PRO' | 'BUSINESS'>('FREE');
  const [showSubscription, setShowSubscription] = useState(false);

  // Legacy inline editing state (endAt only)
  const [editingEndAt, setEditingEndAt] = useState(false);
  const [editEndAtValue, setEditEndAtValue] = useState('');
  const [saving, setSaving] = useState(false);

  // Full edit mode (task 5.3)
  const [isEditMode, setIsEditMode] = useState(false);
  const [editData, setEditData] = useState<{
    title: string;
    winnersCount: number;
    endAt: string | null;
    captchaMode: 'OFF' | 'SUSPICIOUS_ONLY' | 'ALL';
    livenessEnabled: boolean;
    inviteEnabled: boolean;
    inviteMax: number;
    boostEnabled: boolean;
    storiesEnabled: boolean;
  } | null>(null);

  // Polling
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Загрузка данных розыгрыша
  const loadGiveaway = useCallback(async () => {
    try {
      const [giveawayRes, statsRes] = await Promise.all([
        getGiveawayFull(giveawayId),
        getGiveawayStats(giveawayId),
      ]);

      if (!giveawayRes.ok || !giveawayRes.giveaway) {
        setError(giveawayRes.error || tErrors('giveawayNotFound'));
        return;
      }

      setGiveaway(giveawayRes.giveaway);
      if (statsRes.ok && statsRes.stats) {
        setStats(statsRes.stats);
      }

      // Загружаем топ инвайтеров если приглашения включены
      if (giveawayRes.giveaway.condition?.inviteEnabled) {
        getTopInviters(giveawayId).then(res => {
          if (res.ok && res.topInviters) {
            setTopInviters(res.topInviters);
          }
        }).catch(() => {});
      }
    } catch (err) {
      console.error('Failed to load giveaway:', err);
      setError(tErrors('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [giveawayId, tErrors]);

  // Загрузка участников
  const loadParticipants = useCallback(async (search?: string) => {
    try {
      const res = await getGiveawayParticipants(giveawayId, {
        limit: 50,
        search: search || undefined,
      });

      if (res.ok) {
        setParticipants(res.participants || []);
        setParticipantsTotal(res.total || 0);
      }
    } catch (err) {
      console.error('Failed to load participants:', err);
    }
  }, [giveawayId]);

  const loadLivenessChecks = useCallback(async (status?: string) => {
    setLivenessLoading(true);
    try {
      const res = await getLivenessChecks(giveawayId, status);
      if (res.ok) {
        setLivenessChecks(res.checks || []);
        if (res.stats) setLivenessStats(res.stats);
      }
    } catch (err) {
      console.error('Failed to load liveness checks:', err);
    } finally {
      setLivenessLoading(false);
    }
  }, [giveawayId]);

  useEffect(() => {
    if (activeTab === 'liveness') {
      loadLivenessChecks(livenessFilter);
    }
  }, [activeTab, livenessFilter, loadLivenessChecks]);

  useEffect(() => {
    loadGiveaway();
    // Fetch user tier for statistics gating
    fetch('/api/users/me/entitlements', { credentials: 'include' })
      .then(r => r.json())
      .then((d: { data?: { tier?: string } }) => {
        const tier = d?.data?.tier as string;
        if (tier && ['PLUS', 'PRO', 'BUSINESS'].includes(tier)) {
          setUserTier(tier as 'PLUS' | 'PRO' | 'BUSINESS');
        }
      })
      .catch(() => {});
  }, [loadGiveaway]);

  useEffect(() => {
    if (activeTab === 'participants') {
      loadParticipants(searchQuery);
    }
  }, [activeTab, searchQuery, loadParticipants]);

  // Polling участников для активных розыгрышей
  const giveawayStatus = giveaway?.status;
  useEffect(() => {
    if (giveawayStatus !== 'ACTIVE') {
      return;
    }

    // Обновляем счётчик каждые 10 секунд
    const pollParticipantCount = async () => {
      try {
        const res = await getParticipantCount(giveawayId);
        if (res.ok && res.count !== undefined) {
          setGiveaway(prev => prev ? { ...prev, participantsCount: res.count! } : null);
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    };

    pollingIntervalRef.current = setInterval(pollParticipantCount, 10000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [giveawayStatus, giveawayId]);

  // Дублировать
  // ── Full edit mode handlers (task 5.3) ──────────────────────────────────────

  const EDITABLE_STATUSES = ['DRAFT', 'PENDING_CONFIRM', 'SCHEDULED', 'ACTIVE'];
  const ACTIVE_ONLY_FIELDS = giveaway?.status === 'ACTIVE'; // true => only endAt, captchaMode, livenessEnabled

  const openEditMode = () => {
    if (!giveaway) return;
    setEditData({
      title: giveaway.title,
      winnersCount: giveaway.winnersCount,
      endAt: giveaway.endAt ? new Date(giveaway.endAt).toISOString() : null,
      captchaMode: (giveaway.condition?.captchaMode as 'OFF' | 'SUSPICIOUS_ONLY' | 'ALL') ?? 'OFF',
      livenessEnabled: giveaway.condition?.livenessEnabled ?? false,
      inviteEnabled: giveaway.condition?.inviteEnabled ?? false,
      inviteMax: giveaway.condition?.inviteMax ?? 1,
      boostEnabled: giveaway.condition?.boostEnabled ?? false,
      storiesEnabled: giveaway.condition?.storiesEnabled ?? false,
    });
    setIsEditMode(true);
  };

  const cancelEditMode = () => {
    setIsEditMode(false);
    setEditData(null);
  };

  const handleSaveEdit = async () => {
    if (!giveaway || !editData) return;
    setSaving(true);
    try {
      const payload: Parameters<typeof updateGiveaway>[1] = {
        captchaMode: editData.captchaMode,
        livenessEnabled: editData.livenessEnabled,
        endAt: editData.endAt || null,
      };
      if (!ACTIVE_ONLY_FIELDS) {
        payload.title = editData.title;
        payload.winnersCount = editData.winnersCount;
      }

      const res = await updateGiveaway(giveaway.id, payload);
      if (res.ok) {
        setMessage(t('edit.saved'));
        setIsEditMode(false);
        setEditData(null);
        await loadGiveaway();
      } else {
        setMessage(res.error || t('edit.error'));
      }
    } catch {
      setMessage(t('edit.error'));
    } finally {
      setSaving(false);
    }
    setTimeout(() => setMessage(null), 4000);
  };

  const handleDuplicate = async () => {
    try {
      const res = await duplicateGiveaway(giveawayId);
      if (res.ok && res.newGiveawayId) {
        setMessage(t('duplicated'));
        router.push(`/creator/giveaway/new?draft=${res.newGiveawayId}`);
      } else {
        setMessage(res.error || tErrors('connectionError'));
      }
    } catch (err) {
      console.error('Duplicate error:', err);
      setMessage(t('duplicateError'));
    }
    setTimeout(() => setMessage(null), 3000);
  };

  // Скопировать ссылку
  const handleCopyLink = () => {
    const link = `https://t.me/${BOT_USERNAME}/participate?startapp=join_${giveawayId}`;
    navigator.clipboard.writeText(link);
    setMessage(t('linkCopied'));
    setTimeout(() => setMessage(null), 2000);
  };

  // Запустить розыгрыш
  const handleStart = async () => {
    setShowStartModal(false);
    try {
      const res = await startGiveaway(giveawayId);
      if (res.ok) {
        setMessage(t('started'));
        await loadGiveaway();
      } else {
        setMessage(res.error || tErrors('connectionError'));
      }
    } catch (err) {
      console.error('Start error:', err);
      setMessage(tErrors('connectionError'));
    }
    setTimeout(() => setMessage(null), 3000);
  };

  // Отменить розыгрыш
  const handleCancel = async () => {
    setShowDeleteModal(false);
    setShowMenu(false);
    try {
      const res = await cancelGiveaway(giveawayId);
      if (res.ok) {
        setMessage(t('cancelled'));
        await loadGiveaway();
      } else {
        setMessage(res.error || tErrors('connectionError'));
      }
    } catch (err) {
      console.error('Cancel error:', err);
      setMessage(tErrors('connectionError'));
    }
    setTimeout(() => setMessage(null), 3000);
  };

  // Повторить (для ERROR)
  const handleRetry = async () => {
    try {
      const res = await retryGiveaway(giveawayId);
      if (res.ok) {
        setMessage(t('retrying'));
        await loadGiveaway();
      } else {
        setMessage(res.error || tErrors('connectionError'));
      }
    } catch (err) {
      console.error('Retry error:', err);
      setMessage(tErrors('connectionError'));
    }
    setTimeout(() => setMessage(null), 3000);
  };

  // Табы
  const tabs: { key: TabType; icon: string; label: string; count?: number; show: boolean }[] = giveaway ? [
    { key: 'overview',     icon: 'icon-analytics', label: t('tabs.overview'),                                    show: true },
    { key: 'participants', icon: 'icon-participant', label: t('tabs.participants'), count: giveaway.participantsCount, show: true },
    { key: 'winners',      icon: 'icon-winner',     label: t('tabs.winners'),      count: giveaway.winners.length, show: giveaway.status === 'FINISHED' && giveaway.winners.length > 0 },
    { key: 'stories',      icon: 'icon-story',      label: t('tabs.stories'),                                    show: giveaway.condition?.storiesEnabled || false },
    { key: 'liveness',     icon: 'icon-verify',      label: 'Liveness',      count: livenessStats?.pending,       show: giveaway.condition?.livenessEnabled || false },
  ] : [];

  return (
    <div className="min-h-screen bg-tg-bg">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-tg-bg border-b border-tg-secondary">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.push('/creator')}
            className="flex items-center gap-1 text-tg-link text-sm hover:opacity-70"
          >
            <AppIcon name="icon-back" size={16} /> {tCommon('back')}
          </button>
          {giveaway && (
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-semibold truncate">{giveaway.title}</h1>
              <p className="text-tg-hint text-xs flex items-center gap-1">
                <StatusIcon status={giveaway.status} />{getStatusLabel(giveaway.status, t)}
              </p>
            </div>
          )}
        </div>
      </header>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            className="max-w-xl mx-auto text-center py-12"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4 }}
          >
            <Mascot type="state-loading" size={100} loop autoplay />
            <p className="text-tg-hint mt-2">{tCommon('loading')}</p>
          </motion.div>
        ) : (error || !giveaway) ? (
          <motion.div
            key="error"
            className="max-w-xl mx-auto text-center py-12"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4 }}
          >
            <div className="flex justify-center mb-2">
              <Mascot type="state-error" size={120} loop autoplay />
            </div>
            <p className="text-tg-hint mb-4">{error || tErrors('giveawayNotFound')}</p>
            <button
              onClick={() => router.push('/creator')}
              className="bg-tg-button text-tg-button-text rounded-lg px-4 py-2"
            >
              {t('backToList')}
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="content"
            className="p-4"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4 }}
          >
      <div className="max-w-xl mx-auto">

        {/* Управление (кнопки для SCHEDULED/PENDING_CONFIRM) */}
        {(giveaway.status === 'SCHEDULED' || giveaway.status === 'PENDING_CONFIRM') && (
          <div className="mb-6 flex gap-3 animate-fadeIn">
            <button
              onClick={() => setShowStartModal(true)}
              className="flex-1 bg-tg-button text-tg-button-text rounded-lg px-6 py-3 font-medium transition-all hover:scale-105 active:scale-95 hover:shadow-lg"
            >
              <span className="flex items-center justify-center gap-2">
                <AppIcon name="icon-active" variant="brand" size={18} />
                {t('actions.startNow')}
              </span>
            </button>
            
            {/* Меню с тремя точками */}
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="bg-tg-secondary text-tg-text rounded-lg px-4 py-3 font-medium transition-all hover:scale-105 active:scale-95"
              >
                ⋯
              </button>
              
              {showMenu && (
                <div className="absolute right-0 top-full mt-2 bg-tg-secondary rounded-lg shadow-lg overflow-hidden z-10 min-w-[160px] animate-slideIn">
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      // TODO: TASKS-6-payments — проверка подписки для доступа к участникам
                      setActiveTab('participants');
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-tg-bg transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <AppIcon name="icon-participant" variant="brand" size={16} />
                      {t('actions.viewParticipants')}
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      setShowDeleteModal(true);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-tg-bg transition-colors text-red-500"
                  >
                    <span className="flex items-center gap-2">
                      <AppIcon name="icon-cancelled" variant="brand" size={16} />
                      {t('actions.delete')}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Управление (ERROR) */}
        {giveaway.status === 'ERROR' && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 animate-shake">
            <div className="flex items-start gap-3">
              <div className="animate-bounce-subtle">
                <AppIcon name="icon-error" variant="brand" size={28} />
              </div>
              <div className="flex-1">
                <div className="font-medium text-red-900 mb-1">
                  {t('error.title')}
                </div>
                <div className="text-sm text-red-700 mb-3">
                  {t('error.description')}
                </div>
                <button
                  onClick={handleRetry}
                  className="bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-medium transition-all hover:scale-105 active:scale-95 hover:shadow-lg"
                >
                  <span className="flex items-center gap-2 justify-center">
                    <AppIcon name="icon-refresh" variant="brand" size={16} />
                    {t('actions.retry')}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Кнопки шаринга и статистики */}
        <div className="mb-6 flex gap-3 animate-fadeIn" style={{ animationDelay: '0.1s' }}>
          <button
            onClick={() => {
              if (userTier === 'FREE') {
                setShowSubscription(true);
              } else {
                setShowShareSheet(true);
              }
            }}
            className="flex-1 bg-tg-secondary text-tg-text rounded-lg px-4 py-3 font-medium transition-all hover:scale-105 active:scale-95 hover:bg-opacity-80 flex items-center justify-center gap-2"
          >
            <AppIcon name="icon-share" variant="brand" size={18} />
            {t('actions.share')}
          </button>
          <button
            onClick={() => setShowStatsSheet(true)}
            className="flex-1 bg-tg-secondary text-tg-text rounded-lg px-4 py-3 font-medium transition-all hover:scale-105 active:scale-95 hover:bg-opacity-80 flex items-center justify-center gap-2"
          >
            <AppIcon name="icon-analytics" variant="brand" size={18} />
            {t('actions.statistics')}
          </button>
        </div>

        {/* Сообщение */}
        <InlineToast message={message} onClose={() => setMessage(null)} />

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 justify-center">
          {tabs.filter(tab => tab.show).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-300 flex items-center gap-1.5 ${
                activeTab === tab.key
                  ? 'bg-tg-button text-tg-button-text'
                  : 'bg-tg-secondary text-tg-text'
              }`}
            >
              <AppIcon name={tab.icon} variant="brand" size={15} />
              {tab.label}
              {tab.count !== undefined && <span className="opacity-70">({tab.count})</span>}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
        {/* Tab: Обзор */}
        {activeTab === 'overview' && (
          <motion.div
            key="overview"
            className="space-y-6"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {/* Статистика */}
            {stats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard
                  icon="icon-participant"
                  label={t('stats.participants')}
                  value={stats.participantsCount}
                  subValue={stats.participantsToday > 0 ? `+${stats.participantsToday} ${t('stats.today')}` : undefined}
                />
                <StatCard icon="icon-ticket" label={t('stats.tickets')} value={stats.ticketsTotal} />
                <StatCard icon="icon-referral" label={t('stats.invites')} value={stats.invitesCount} />
                <StatCard icon="icon-boost" label={t('stats.boosts')} value={stats.boostsCount} />
              </div>
            )}

            {/* Информация */}
            <div className="bg-tg-secondary rounded-xl p-4 space-y-3">
              <h3 className="font-medium mb-3 flex items-center gap-2">
                <AppIcon name="icon-info" variant="brand" size={18} />
                {t('info.title')}
              </h3>
              
              <div className="flex justify-between text-sm">
                <span className="text-tg-hint">{t('info.winnersCount')}:</span>
                <span>{giveaway.winnersCount}</span>
              </div>
              
              <div className="flex justify-between text-sm">
                <span className="text-tg-hint">{t('info.start')}:</span>
                <span>{formatDate(giveaway.startAt)}</span>
              </div>
              
              <div className="flex justify-between text-sm">
                <span className="text-tg-hint">{t('info.end')}:</span>
                <span>{formatDate(giveaway.endAt)}</span>
              </div>
              
              <div className="flex justify-between text-sm">
                <span className="text-tg-hint">{t('info.created')}:</span>
                <span>{formatDate(giveaway.createdAt)}</span>
              </div>

              {giveaway.publishChannels.length > 0 && (
                <div className="pt-2 border-t border-tg-bg">
                  <div className="text-sm text-tg-hint mb-1">{t('info.publishChannels')}:</div>
                  <div className="flex flex-wrap gap-2">
                    {giveaway.publishChannels.map((ch) => (
                      <span key={ch.id} className="text-xs bg-tg-bg px-2 py-1 rounded">
                        {ch.title}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Условия */}
            {giveaway.condition && (
              <div className="bg-tg-secondary rounded-xl p-4">
                <h3 className="font-medium mb-3 flex items-center gap-2"><AppIcon name="icon-settings" size={18} /> {t('conditions.title')}</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-tg-hint">{t('conditions.invites')}:</span>
                    <span className="flex items-center gap-1">{giveaway.condition.inviteEnabled ? <><AppIcon name="icon-success" size={14} /> {t('conditions.upTo')} {giveaway.condition.inviteMax}</> : <AppIcon name="icon-error" size={14} />}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tg-hint">{t('conditions.boosts')}:</span>
                    <span>{giveaway.condition.boostEnabled ? <AppIcon name="icon-success" size={14} /> : <AppIcon name="icon-error" size={14} />}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tg-hint">{t('conditions.stories')}:</span>
                    <span>{giveaway.condition.storiesEnabled ? <AppIcon name="icon-success" size={14} /> : <AppIcon name="icon-error" size={14} />}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tg-hint">{t('conditions.captcha')}:</span>
                    <span>{giveaway.condition.captchaMode}</span>
                  </div>
                </div>
              </div>
            )}

            {/* PLUS+ расширенная статистика — источники билетов */}
            {stats && (stats.ticketsFromInvites > 0 || stats.ticketsFromBoosts > 0 || stats.ticketsFromStories > 0 || stats.storiesPending > 0) && (
              <div className="bg-tg-secondary rounded-xl p-4 relative">
                <h3 className="font-medium mb-3 flex items-center gap-2"><AppIcon name="icon-ticket" size={18} /> {t('stats.ticketSources')}</h3>
                <div className={`space-y-2 text-sm ${userTier === 'FREE' ? 'blur-sm select-none pointer-events-none' : ''}`}>
                  <div className="flex justify-between">
                    <span className="text-tg-hint flex items-center gap-1"><AppIcon name="icon-share" size={14} /> {t('stats.fromInvites')}:</span>
                    <span className="font-medium">{stats.ticketsFromInvites}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tg-hint flex items-center gap-1"><AppIcon name="icon-boost" size={14} /> {t('stats.fromBoosts')}:</span>
                    <span className="font-medium">{stats.ticketsFromBoosts}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tg-hint flex items-center gap-1"><AppIcon name="icon-story" size={14} /> {t('stats.fromStories')}:</span>
                    <span className="font-medium">{stats.ticketsFromStories}
                      {stats.storiesPending > 0 && (
                        <span className="ml-1 text-xs text-yellow-500 inline-flex items-center gap-0.5">(<AppIcon name="icon-pending" size={12} /> {stats.storiesPending} {t('stats.pending')})</span>
                      )}
                    </span>
                  </div>
                </div>
                {userTier === 'FREE' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-tg-secondary/60 rounded-xl">
                    <div className="mb-1"><AppIcon name="icon-lock" size={28} /></div>
                    <p className="text-xs font-medium text-tg-text">PLUS+</p>
                    <button
                      onClick={() => router.push('/creator/subscription')}
                      className="mt-2 text-xs text-tg-button underline"
                    >
                      {t('stats.upgrade')}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Рост участников — PLUS+ только */}
            {stats && stats.participantsGrowth.length > 0 && (
              <div className="bg-tg-secondary rounded-xl p-4 relative">
                <h3 className="font-medium mb-3 flex items-center gap-2"><AppIcon name="icon-analytics" size={18} /> {t('growth.title')}</h3>
                <div className={`flex items-end gap-1 h-24 ${userTier === 'FREE' ? 'blur-sm select-none' : ''}`}>
                  {stats.participantsGrowth.map((day, i) => {
                    const maxCount = Math.max(...stats.participantsGrowth.map(d => d.count), 1);
                    const height = (day.count / maxCount) * 100;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center">
                        <div
                          className="w-full bg-tg-button rounded-t"
                          style={{ height: `${Math.max(height, 4)}%` }}
                        />
                        <div className="text-[10px] text-tg-hint mt-1">
                          {new Date(day.date).getDate()}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {userTier === 'FREE' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-tg-secondary/60 rounded-xl">
                    <div className="mb-1"><AppIcon name="icon-lock" size={28} /></div>
                    <p className="text-xs font-medium text-tg-text">PLUS+</p>
                    <button
                      onClick={() => router.push('/creator/subscription')}
                      className="mt-2 text-xs text-tg-button underline"
                    >
                      {t('stats.upgrade')}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Редактирование розыгрыша (task 5.3) */}
            {giveaway && EDITABLE_STATUSES.includes(giveaway.status) && (
              <>
                <AnimatePresence mode="wait">
                  {isEditMode && editData ? (
                    <motion.div
                      key="edit-form"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="bg-tg-secondary rounded-2xl p-4 space-y-4 border border-tg-button/20">
                        {/* Заголовок */}
                        <div className="text-center">
                          <h3 className="font-semibold flex items-center justify-center gap-2">
                            <AppIcon name="icon-settings" variant="brand" size={18} />
                            {t('edit.title')}
                          </h3>
                          {ACTIVE_ONLY_FIELDS && (
                            <span className="inline-block mt-2 text-xs bg-yellow-500/15 text-yellow-600 px-3 py-1 rounded-full">
                              {t('edit.activeHint')}
                            </span>
                          )}
                        </div>

                        {/* Название — только для не-ACTIVE */}
                        {!ACTIVE_ONLY_FIELDS && (
                          <div>
                            <label className="block text-xs text-tg-hint mb-1.5">{t('info.giveawayTitle')}</label>
                            <input
                              type="text"
                              value={editData.title}
                              onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                              maxLength={255}
                              className="w-full bg-tg-bg rounded-xl px-3 py-2.5 text-sm border border-tg-hint/15 focus:border-tg-button outline-none transition-colors"
                            />
                          </div>
                        )}

                        {/* Количество победителей — только для не-ACTIVE */}
                        {!ACTIVE_ONLY_FIELDS && (
                          <div>
                            <label className="block text-xs text-tg-hint mb-1.5">{t('info.winnersCount')}</label>
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={editData.winnersCount}
                              onChange={(e) => setEditData({ ...editData, winnersCount: parseInt(e.target.value) || 1 })}
                              className="w-full bg-tg-bg rounded-xl px-3 py-2.5 text-sm border border-tg-hint/15 focus:border-tg-button outline-none transition-colors"
                            />
                          </div>
                        )}

                        {/* Дата окончания */}
                        <div>
                          <label className="block text-xs text-tg-hint mb-1.5">{t('info.end')}</label>
                          <DateTimePicker
                            value={editData.endAt}
                            onChange={(iso) => setEditData({ ...editData, endAt: iso })}
                            min={(() => { const d = new Date(); d.setHours(d.getHours() + 1); return d; })()}
                            placeholder={t('info.end')}
                          />
                        </div>

                        {/* Капча — карточки выбора */}
                        <div>
                          <label className="block text-xs text-tg-hint mb-1.5">{t('conditions.captcha')}</label>
                          <div className="space-y-2">
                            {([
                              { value: 'OFF' as const, label: t('edit.captchaOff'), icon: 'icon-close' },
                              { value: 'SUSPICIOUS_ONLY' as const, label: t('edit.captchaSuspicious'), icon: 'icon-view' },
                              ...(userTier !== 'FREE' ? [{ value: 'ALL' as const, label: t('edit.captchaAll'), icon: 'icon-shield' }] : []),
                            ] as const).map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => setEditData({ ...editData, captchaMode: opt.value })}
                                className={`w-full flex items-center gap-3 p-3 rounded-xl text-sm text-left transition-all ${
                                  editData.captchaMode === opt.value
                                    ? 'bg-tg-button/10 border border-tg-button/40'
                                    : 'bg-tg-bg border border-tg-hint/15 hover:border-tg-hint/30'
                                }`}
                              >
                                <AppIcon name={opt.icon} size={16} />
                                <span className={editData.captchaMode === opt.value ? 'font-medium' : ''}>{opt.label}</span>
                                {editData.captchaMode === opt.value && (
                                  <span className="ml-auto"><AppIcon name="icon-success" size={16} /></span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Liveness — карточка выбора (только для BUSINESS) */}
                        {userTier === 'BUSINESS' && (
                          <div>
                            <label className="block text-xs text-tg-hint mb-1.5">{t('conditions.liveness')}</label>
                            <button
                              type="button"
                              onClick={() => setEditData({ ...editData, livenessEnabled: !editData.livenessEnabled })}
                              className={`w-full flex items-center gap-3 p-3 rounded-xl text-sm text-left transition-all ${
                                editData.livenessEnabled
                                  ? 'bg-tg-button/10 border border-tg-button/40'
                                  : 'bg-tg-bg border border-tg-hint/15 hover:border-tg-hint/30'
                              }`}
                            >
                              <AppIcon name="icon-camera" size={16} />
                              <span className={editData.livenessEnabled ? 'font-medium' : ''}>{t('conditions.liveness')}</span>
                              {editData.livenessEnabled && (
                                <span className="ml-auto"><AppIcon name="icon-success" size={16} /></span>
                              )}
                            </button>
                          </div>
                        )}

                        {/* Кнопки Сохранить / Отменить */}
                        <div className="flex gap-3 pt-1">
                          <button
                            onClick={cancelEditMode}
                            disabled={saving}
                            className="flex-1 bg-tg-bg text-tg-text rounded-xl py-2.5 text-sm font-medium transition-all active:scale-[0.97] disabled:opacity-50 border border-tg-hint/15"
                          >
                            {t('edit.cancel')}
                          </button>
                          <button
                            onClick={handleSaveEdit}
                            disabled={saving}
                            className="flex-1 bg-tg-button text-tg-button-text rounded-xl py-2.5 text-sm font-medium transition-all active:scale-[0.97] disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            {saving ? (
                              <span className="animate-spin"><AppIcon name="icon-refresh" size={16} /></span>
                            ) : (
                              <><AppIcon name="icon-save" size={16} /> {t('edit.save')}</>
                            )}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="edit-button"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <button
                        onClick={openEditMode}
                        className="w-full bg-tg-secondary rounded-xl p-3 flex items-center justify-center gap-2 text-sm text-tg-button font-medium transition-all active:scale-95 hover:bg-tg-secondary/80"
                      >
                        <AppIcon name="icon-settings" variant="brand" size={16} />
                        {t('edit.openButton')}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}

            {/* Топ инвайтеров */}
            {giveaway.condition?.inviteEnabled && (
              <div className="bg-tg-secondary rounded-xl p-4 relative">
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <AppIcon name="icon-winner" variant="brand" size={18} />
                  {t('topInviters.title')}
                </h3>
                {topInviters.length === 0 ? (
                  <p className="text-sm text-tg-hint text-center py-2">{t('topInviters.empty')}</p>
                ) : (
                  <div className="space-y-2">
                    {topInviters.map((inv) => {
                      const placeColors = [
                        'from-yellow-400 to-amber-500 text-white shadow-amber-500/30',
                        'from-slate-300 to-slate-400 text-white shadow-slate-400/30',
                        'from-amber-600 to-amber-700 text-white shadow-amber-700/30',
                      ];
                      const colorClass = inv.rank <= 3
                        ? placeColors[inv.rank - 1]
                        : 'from-tg-button/80 to-tg-button text-tg-button-text shadow-tg-button/20';

                      return (
                        <div key={inv.userId} className="flex items-center gap-3">
                          <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${colorClass} flex items-center justify-center font-bold text-xs shadow flex-shrink-0`}>
                            {inv.rank}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium truncate block">
                              {inv.firstName}{inv.lastName ? ` ${inv.lastName}` : ''}
                            </span>
                            {inv.username && (
                              <span className="text-xs text-tg-hint">@{inv.username}</span>
                            )}
                          </div>
                          <span className="text-sm font-semibold text-tg-button">
                            {inv.inviteCount} {t('topInviters.invites')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Действия */}
            <div className="flex flex-wrap gap-3 justify-center">
              <button
                onClick={handleCopyLink}
                className="bg-tg-button text-tg-button-text rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2"
              >
                <AppIcon name="icon-copy" variant="brand" size={16} />
                {t('actions.copyLink')}
              </button>
              <button
                onClick={handleDuplicate}
                className="bg-tg-secondary text-tg-text rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2"
              >
                <AppIcon name="icon-giveaway" variant="brand" size={16} />
                {t('actions.duplicate')}
              </button>
              <button
                onClick={() => router.push(`/creator/giveaway/${giveawayId}/theme`)}
                className="bg-tg-secondary text-tg-text rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2"
              >
                <AppIcon name="icon-theme" variant="brand" size={16} />
                Тема
              </button>
              {giveaway.condition?.storiesEnabled && (
                <button
                  onClick={() => router.push(`/creator/giveaway/${giveawayId}/stories`)}
                  className="bg-tg-secondary text-tg-text rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2"
                >
                  <AppIcon name="icon-story" variant="brand" size={16} />
                  {t('actions.storiesModeration')}
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* Tab: Участники */}
        {activeTab === 'participants' && (
          <motion.div
            key="participants"
            className="space-y-4"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {/* Поиск + экспорт */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={t('participantsTab.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-tg-secondary text-tg-text rounded-lg px-4 py-3"
              />
              <button
                onClick={() => {
                  if (userTier === 'FREE') {
                    setShowSubscription(true);
                  } else {
                    window.open(`/api/giveaways/${giveawayId}/participants/export`, '_blank');
                  }
                }}
                className="bg-tg-secondary text-tg-text rounded-lg px-4 py-3 hover:opacity-80 transition-opacity flex items-center gap-1 text-sm whitespace-nowrap"
                title="CSV"
              >
                <AppIcon name="icon-export" size={16} />
                CSV
              </button>
            </div>

            {/* Карточки участников */}
            {participants.length > 0 ? (
              <div className="space-y-3">
                {participants.map((p, idx) => (
                  <motion.div
                    key={p.id}
                    className="bg-tg-secondary rounded-xl p-4"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: idx * 0.03 }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        {(() => {
                          const avatarColors = [
                            'from-rose-400 to-pink-500',
                            'from-violet-400 to-purple-500',
                            'from-blue-400 to-indigo-500',
                            'from-cyan-400 to-teal-500',
                            'from-emerald-400 to-green-500',
                            'from-amber-400 to-orange-500',
                            'from-red-400 to-rose-500',
                            'from-fuchsia-400 to-pink-600',
                          ];
                          const colorIdx = parseInt(p.user.telegramUserId.slice(-2), 10) % avatarColors.length;
                          return (
                            <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatarColors[colorIdx]} flex items-center justify-center text-white text-lg font-bold flex-shrink-0 shadow-sm`}>
                              {(p.user.firstName || 'U')[0].toUpperCase()}
                            </div>
                          );
                        })()}
                        <div>
                          <div className="font-semibold text-sm">
                            {p.user.firstName || 'User'} {p.user.lastName || ''}
                          </div>
                          {p.user.username && (
                            <div className="text-tg-hint text-xs">@{p.user.username}</div>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => setBanTarget({ id: p.user.id, name: p.user.firstName || 'пользователя' })}
                        className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Забанить"
                      >
                        <AppIcon name="icon-delete" size={16} />
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-tg-bg rounded-lg py-2 px-1">
                        <div className="flex items-center justify-center gap-1 mb-0.5">
                          <AppIcon name="icon-ticket" size={14} />
                          <span className="text-xs text-tg-hint">{t('participantsTab.tickets')}</span>
                        </div>
                        <div className="font-bold text-sm">
                          {p.ticketsBase + p.ticketsExtra}
                          {p.ticketsExtra > 0 && (
                            <span className="text-green-500 text-[10px] ml-0.5">+{p.ticketsExtra}</span>
                          )}
                        </div>
                      </div>
                      <div className="bg-tg-bg rounded-lg py-2 px-1">
                        <div className="flex items-center justify-center gap-1 mb-0.5">
                          <AppIcon name="icon-invite" size={14} />
                          <span className="text-xs text-tg-hint">{t('participantsTab.invites')}</span>
                        </div>
                        <div className="font-bold text-sm">{p.invitedCount}</div>
                      </div>
                      <div className="bg-tg-bg rounded-lg py-2 px-1">
                        <div className="flex items-center justify-center gap-1 mb-0.5">
                          <AppIcon name="icon-calendar" size={14} />
                          <span className="text-xs text-tg-hint">{t('participantsTab.date')}</span>
                        </div>
                        <div className="font-bold text-[11px]">
                          {new Date(p.joinedAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                        </div>
                      </div>
                    </div>

                    {(p.boostedChannelIds.length > 0 || p.storiesShared) && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {p.boostedChannelIds.length > 0 && (
                          <span className="text-[10px] bg-blue-500/15 text-blue-400 rounded-full px-2 py-0.5 flex items-center gap-1">
                            <AppIcon name="icon-boost" size={10} />
                            {p.boostedChannelIds.length} буст
                          </span>
                        )}
                        {p.storiesShared && (
                          <span className="text-[10px] bg-purple-500/15 text-purple-400 rounded-full px-2 py-0.5 flex items-center gap-1">
                            <AppIcon name="icon-story" size={10} />
                            Сторис
                          </span>
                        )}
                      </div>
                    )}
                  </motion.div>
                ))}

                {participantsTotal > participants.length && (
                  <div className="text-center py-3 text-tg-hint text-sm">
                    {t('participantsTab.showing', { shown: participants.length, total: participantsTotal })}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 bg-tg-secondary rounded-xl">
                <div className="flex justify-center mb-4">
                  <AppIcon name="icon-participant" variant="brand" size={56} />
                </div>
                <p className="text-tg-hint">
                  {searchQuery ? t('participantsTab.notFound') : t('participantsTab.empty')}
                </p>
              </div>
            )}
          </motion.div>
        )}

        {/* Tab: Победители */}
        {activeTab === 'winners' && (
          <motion.div
            key="winners"
            className="space-y-4"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {giveaway.winners.length > 0 ? (
              <div className="space-y-2">
                {giveaway.winners.map((w) => {
                  const placeColors = [
                    'from-yellow-400 to-amber-500 text-white shadow-amber-500/30',
                    'from-slate-300 to-slate-400 text-white shadow-slate-400/30',
                    'from-amber-600 to-amber-700 text-white shadow-amber-700/30',
                  ];
                  const colorClass = w.place <= 3
                    ? placeColors[w.place - 1]
                    : 'from-tg-button/80 to-tg-button text-tg-button-text shadow-tg-button/20';

                  return (
                    <div
                      key={w.place}
                      className="flex items-center gap-3 bg-tg-secondary rounded-xl p-4"
                    >
                      <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${colorClass} flex items-center justify-center font-bold text-lg shadow-lg flex-shrink-0`}>
                        {w.place}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm flex items-center gap-1.5">
                          <AppIcon name="icon-winner" size={14} />
                          <span className="truncate">{w.user.firstName || 'User'} {w.user.lastName || ''}</span>
                        </div>
                        {w.user.username && (
                          <div className="text-tg-hint text-xs ml-[20px]">@{w.user.username}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 bg-tg-secondary rounded-xl">
                <div className="flex justify-center mb-4">
                  <AppIcon name="icon-winner" variant="brand" size={56} />
                </div>
                <p className="text-tg-hint">{t('winnersTab.notDetermined')}</p>
              </div>
            )}
          </motion.div>
        )}

        {/* Tab: Сторис */}
        {activeTab === 'stories' && (
          <motion.div
            key="stories"
            className="text-center py-12 bg-tg-secondary rounded-xl"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <div className="flex justify-center mb-4"><AppIcon name="icon-story" size={40} /></div>
            <p className="text-tg-hint mb-4">{t('storiesTab.description')}</p>
            <button
              onClick={() => router.push(`/creator/giveaway/${giveawayId}/stories`)}
              className="bg-tg-button text-tg-button-text rounded-lg px-4 py-2"
            >
              {t('storiesTab.openModeration')}
            </button>
          </motion.div>
        )}

        {/* Tab: Liveness Check (10.19) */}
        {activeTab === 'liveness' && (
          <motion.div
            key="liveness"
            className="space-y-4"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
          {/* Статистика */}
          {livenessStats && (
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Ожидают', value: livenessStats.pending, color: 'text-yellow-500', filter: 'PENDING' },
                { label: 'Одобрены', value: livenessStats.approved, color: 'text-green-500', filter: 'APPROVED' },
                { label: 'Отклонены', value: livenessStats.rejected, color: 'text-red-500', filter: 'REJECTED' },
                { label: 'Без фото', value: livenessStats.notSubmitted, color: 'text-tg-hint', filter: '' },
              ].map((stat) => (
                <button
                  key={stat.filter}
                  onClick={() => stat.filter && setLivenessFilter(stat.filter)}
                  className={`bg-tg-secondary rounded-xl p-3 text-center transition-all duration-300 ${
                    livenessFilter === stat.filter ? 'ring-2 ring-tg-button' : ''
                  }`}
                >
                  <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                  <div className="text-xs text-tg-hint mt-1">{stat.label}</div>
                </button>
              ))}
            </div>
          )}

          {/* Список проверок */}
          <AnimatePresence mode="wait">
            <motion.div
              key={livenessFilter === '' ? 'NOT_SUBMITTED' : livenessFilter}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {livenessLoading ? (
                <div className="text-center py-8 text-tg-hint flex items-center justify-center gap-2"><AppIcon name="icon-pending" size={16} /> Загружаем...</div>
              ) : livenessChecks.length === 0 ? (
                <div className="text-center py-12 bg-tg-secondary rounded-xl">
                  <div className="flex justify-center mb-3"><AppIcon name="icon-search" size={40} /></div>
                  <p className="text-tg-hint text-sm">
                    {livenessFilter === 'PENDING' ? 'Нет ожидающих проверок' : 'Нет записей'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
              {livenessChecks.map((check) => (
                <div key={check.participationId} className="bg-tg-secondary rounded-xl p-4">
                  <div className="flex items-start gap-4">
                    {/* Фото */}
                    {check.hasPhoto && check.photoUrl && (
                      <a
                        href={getLivenessPhotoUrl(giveawayId, check.userId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={getLivenessPhotoUrl(giveawayId, check.userId)}
                          alt="Фото"
                          className="w-16 h-16 rounded-lg object-cover border border-tg-bg hover:opacity-80 transition-opacity"
                        />
                      </a>
                    )}
                    {!check.hasPhoto && (
                      <div className="w-16 h-16 rounded-lg bg-tg-bg flex items-center justify-center flex-shrink-0">
                        <AppIcon name="icon-camera" size={24} />
                      </div>
                    )}

                    {/* Инфо */}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">
                        {check.user.firstName || 'User'} {check.user.lastName || ''}
                      </div>
                      {check.user.username && (
                        <div className="text-xs text-tg-hint">@{check.user.username}</div>
                      )}
                      <div className="text-xs text-tg-hint mt-1">
                        {new Date(check.joinedAt).toLocaleDateString('ru-RU')}
                      </div>
                      <div className="mt-1">
                        {check.livenessStatus === 'PENDING' && (
                          <span className="text-xs bg-yellow-500/10 text-yellow-600 px-2 py-0.5 rounded-full inline-flex items-center gap-1"><AppIcon name="icon-pending" size={12} /> Ожидает</span>
                        )}
                        {check.livenessStatus === 'APPROVED' && (
                          <span className="text-xs bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full inline-flex items-center gap-1"><AppIcon name="icon-success" size={12} /> Одобрен</span>
                        )}
                        {check.livenessStatus === 'REJECTED' && (
                          <span className="text-xs bg-red-500/10 text-red-600 px-2 py-0.5 rounded-full inline-flex items-center gap-1"><AppIcon name="icon-error" size={12} /> Отклонён</span>
                        )}
                        {check.livenessStatus === 'NOT_SUBMITTED' && (
                          <span className="text-xs bg-gray-500/10 text-gray-500 px-2 py-0.5 rounded-full">— Без фото</span>
                        )}
                      </div>
                    </div>

                    {/* Кнопки действий (только если фото есть и ожидает) */}
                    {check.livenessStatus === 'PENDING' && check.hasPhoto && (
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        <button
                          onClick={async () => {
                            const res = await approveLiveness(giveawayId, check.userId);
                            if (res.ok) {
                              setMessage('Участник одобрен');
                              loadLivenessChecks(livenessFilter);
                            } else {
                              setMessage(res.error || 'Ошибка');
                            }
                            setTimeout(() => setMessage(null), 3000);
                          }}
                          className="bg-green-500 text-white text-xs rounded-lg px-3 py-1.5 hover:bg-green-600 transition-colors"
                        >
                          <span className="inline-flex items-center gap-1"><AppIcon name="icon-success" size={12} /> Одобрить</span>
                        </button>
                        <button
                          onClick={async () => {
                            const res = await rejectLiveness(giveawayId, check.userId);
                            if (res.ok) {
                              setMessage('Участник отклонён');
                              loadLivenessChecks(livenessFilter);
                            } else {
                              setMessage(res.error || 'Ошибка');
                            }
                            setTimeout(() => setMessage(null), 3000);
                          }}
                          className="bg-red-500 text-white text-xs rounded-lg px-3 py-1.5 hover:bg-red-600 transition-colors"
                        >
                          <span className="inline-flex items-center gap-1"><AppIcon name="icon-error" size={12} /> Отклонить</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
          </motion.div>
        )}
        </AnimatePresence>
      </div>

      {/* Модалка: Запустить сейчас */}
      {showStartModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fadeIn"
          onClick={() => setShowStartModal(false)}
        >
          <div 
            className="bg-tg-bg rounded-xl p-6 max-w-md w-full animate-slideIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-4">
              <div className="flex justify-center mb-3 animate-bounce"><AppIcon name="icon-active" size={40} /></div>
              <h3 className="font-bold text-lg mb-2">{t('startModal.title')}</h3>
              <p className="text-tg-hint text-sm">
                {t('startModal.description')}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowStartModal(false)}
                className="flex-1 bg-tg-secondary text-tg-text rounded-lg px-4 py-3 font-medium transition-all hover:scale-105 active:scale-95"
              >
                {tCommon('cancel')}
              </button>
              <button
                onClick={handleStart}
                className="flex-1 bg-tg-button text-tg-button-text rounded-lg px-4 py-3 font-medium transition-all hover:scale-105 active:scale-95 hover:shadow-lg"
              >
                {tCommon('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модалка: Удалить розыгрыш */}
      {showDeleteModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fadeIn"
          onClick={() => setShowDeleteModal(false)}
        >
          <div 
            className="bg-tg-bg rounded-xl p-6 max-w-md w-full animate-slideIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-4">
              <div className="flex justify-center mb-3 animate-shake"><AppIcon name="icon-delete" size={40} /></div>
              <h3 className="font-bold text-lg mb-2">{t('deleteModal.title')}</h3>
              <p className="text-tg-hint text-sm">
                {t('deleteModal.description')}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 bg-tg-secondary text-tg-text rounded-lg px-4 py-3 font-medium transition-all hover:scale-105 active:scale-95"
              >
                {tCommon('cancel')}
              </button>
              <button
                onClick={handleCancel}
                className="flex-1 bg-red-600 text-white rounded-lg px-4 py-3 font-medium transition-all hover:scale-105 active:scale-95 hover:shadow-lg"
              >
                {tCommon('delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модалка: Забанить участника */}
      <AnimatePresence>
        {banTarget && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50"
              onClick={() => setBanTarget(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-tg-bg rounded-2xl p-6 max-w-sm mx-auto shadow-2xl"
            >
              <div className="text-center mb-5">
                <div className="flex justify-center mb-3">
                  <div className="w-14 h-14 rounded-full bg-red-500/15 flex items-center justify-center">
                    <AppIcon name="icon-delete" size={28} />
                  </div>
                </div>
                <h3 className="font-bold text-lg mb-2">Заблокировать участника?</h3>
                <p className="text-tg-hint text-sm">
                  <span className="font-medium text-tg-text">{banTarget.name}</span> будет добавлен в ваш бан-лист и не сможет участвовать в ваших розыгрышах.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setBanTarget(null)}
                  className="flex-1 bg-tg-secondary text-tg-text rounded-xl px-4 py-3 font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  {tCommon('cancel')}
                </button>
                <button
                  onClick={async () => {
                    const res = await banParticipant(giveawayId, banTarget.id);
                    if (res.ok) {
                      setMessage('Пользователь заблокирован');
                      loadParticipants();
                    } else {
                      setMessage(res.error || 'Ошибка');
                    }
                    setBanTarget(null);
                    setTimeout(() => setMessage(null), 3000);
                  }}
                  className="flex-1 bg-red-600 text-white rounded-xl px-4 py-3 font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  Заблокировать
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* BottomSheet: Поделиться */}
      <ShareBottomSheet
        isOpen={showShareSheet}
        onClose={() => setShowShareSheet(false)}
        giveawayId={giveawayId}
        shortCode={giveaway.id.slice(0, 8)}
        botUsername={BOT_USERNAME}
        maxLinks={TIER_LIMITS.maxTrackingLinks[userTier]}
      />

      {/* BottomSheet: Статистика */}
      <StatsBottomSheet
        isOpen={showStatsSheet}
        onClose={() => setShowStatsSheet(false)}
        giveawayId={giveawayId}
      />

      {/* BottomSheet: Подписка */}
      <SubscriptionBottomSheet
        isOpen={showSubscription}
        onClose={() => setShowSubscription(false)}
        currentTier={userTier === 'FREE' ? 'free' : userTier.toLowerCase() as 'plus' | 'pro' | 'business'}
      />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
