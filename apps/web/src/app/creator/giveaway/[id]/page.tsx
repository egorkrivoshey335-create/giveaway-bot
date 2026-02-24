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
  GiveawayFull,
  GiveawayStats,
  GiveawayParticipant,
  TopInviter,
} from '@/lib/api';
import { InlineToast } from '@/components/Toast';
import { ShareBottomSheet } from '@/components/ShareBottomSheet';
import { StatsBottomSheet } from '@/components/StatsBottomSheet';
import { AnimatedCounter } from '@/components/AnimatedCounter';
import { AppIcon } from '@/components/AppIcon';

// Берём username бота из env
const BOT_USERNAME = process.env.NEXT_PUBLIC_BOT_USERNAME || 'BeastRandomBot';

type TabType = 'overview' | 'participants' | 'winners' | 'stories';

// Получить метку статуса
function getStatusLabel(status: string, t: ReturnType<typeof useTranslations<'giveawayDetails'>>): string {
  switch (status) {
    case 'DRAFT': return `📝 ${t('status.draft')}`;
    case 'PENDING_CONFIRM': return `⏳ ${t('status.pendingConfirm')}`;
    case 'SCHEDULED': return `⏰ ${t('status.scheduled')}`;
    case 'ACTIVE': return `🟢 ${t('status.active')}`;
    case 'FINISHED': return `✅ ${t('status.finished')}`;
    case 'CANCELLED': return `❌ ${t('status.cancelled')}`;
    case 'ERROR': return `⚠️ ${t('status.error')}`;
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

  // BottomSheet states
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [showStatsSheet, setShowStatsSheet] = useState(false);

  // Модалки
  const [showStartModal, setShowStartModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  // Subscription tier (for stats gating)
  const [userTier, setUserTier] = useState<'FREE' | 'PLUS' | 'PRO' | 'BUSINESS'>('FREE');

  // Inline editing state
  const [editingEndAt, setEditingEndAt] = useState(false);
  const [editEndAtValue, setEditEndAtValue] = useState('');
  const [saving, setSaving] = useState(false);

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

  if (loading) {
    return (
      <main className="min-h-screen p-4">
        <div className="max-w-4xl mx-auto text-center py-12">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-tg-hint">{tCommon('loading')}</p>
        </div>
      </main>
    );
  }

  if (error || !giveaway) {
    return (
      <main className="min-h-screen p-4">
        <div className="max-w-4xl mx-auto text-center py-12">
          <div className="flex justify-center mb-4">
            <AppIcon name="icon-error" variant="brand" size={56} />
          </div>
          <p className="text-tg-hint mb-4">{error || tErrors('giveawayNotFound')}</p>
          <button
            onClick={() => router.push('/creator')}
            className="bg-tg-button text-tg-button-text rounded-lg px-4 py-2"
          >
            {t('backToList')}
          </button>
        </div>
      </main>
    );
  }

  // Табы
  const tabs: { key: TabType; icon: string; label: string; count?: number; show: boolean }[] = [
    { key: 'overview',     icon: 'icon-analytics', label: t('tabs.overview'),                                    show: true },
    { key: 'participants', icon: 'icon-participant', label: t('tabs.participants'), count: giveaway.participantsCount, show: true },
    { key: 'winners',      icon: 'icon-winner',     label: t('tabs.winners'),      count: giveaway.winners.length, show: giveaway.status === 'FINISHED' && giveaway.winners.length > 0 },
    { key: 'stories',      icon: 'icon-story',      label: t('tabs.stories'),                                    show: giveaway.condition?.storiesEnabled || false },
  ];

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.push('/creator')}
            className="text-tg-link text-sm mb-2 flex items-center gap-1"
          >
            ← {t('backToList')}
          </button>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">{giveaway.title}</h1>
              <p className="text-tg-hint text-sm mt-1">
                {t('giveawayId')}: #{giveaway.id.slice(0, 8)}
              </p>
              <p className="text-tg-hint mt-1">{getStatusLabel(giveaway.status, t)}</p>
            </div>
          </div>
        </div>

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
            onClick={() => setShowShareSheet(true)}
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
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {tabs.filter(tab => tab.show).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
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

        {/* Tab: Обзор */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
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
                <h3 className="font-medium mb-3">⚙️ {t('conditions.title')}</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-tg-hint">{t('conditions.invites')}:</span>
                    <span>{giveaway.condition.inviteEnabled ? `✅ ${t('conditions.upTo')} ${giveaway.condition.inviteMax}` : '❌'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tg-hint">{t('conditions.boosts')}:</span>
                    <span>{giveaway.condition.boostEnabled ? '✅' : '❌'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tg-hint">{t('conditions.stories')}:</span>
                    <span>{giveaway.condition.storiesEnabled ? '✅' : '❌'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tg-hint">{t('conditions.captcha')}:</span>
                    <span>{giveaway.condition.captchaMode}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Рост участников — PLUS+ только */}
            {stats && stats.participantsGrowth.length > 0 && (
              <div className="bg-tg-secondary rounded-xl p-4 relative">
                <h3 className="font-medium mb-3">📈 {t('growth.title')}</h3>
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
                    <div className="text-2xl mb-1">🔒</div>
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

            {/* Редактирование даты окончания (для ACTIVE/SCHEDULED) */}
            {giveaway && ['ACTIVE', 'SCHEDULED'].includes(giveaway.status) && (
              <div className="bg-tg-secondary rounded-xl p-4">
                <h3 className="font-medium mb-3">✏️ {t('edit.title')}</h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <label className="block text-tg-hint mb-1">{t('info.end')}:</label>
                    {editingEndAt ? (
                      <div className="flex gap-2">
                        <input
                          type="datetime-local"
                          value={editEndAtValue}
                          onChange={(e) => setEditEndAtValue(e.target.value)}
                          className="flex-1 bg-tg-bg rounded-lg px-3 py-2 text-tg-text text-sm"
                        />
                        <button
                          onClick={async () => {
                            setSaving(true);
                            const isoValue = editEndAtValue ? new Date(editEndAtValue).toISOString() : null;
                            const res = await updateGiveaway(giveaway.id, { endAt: isoValue });
                            setSaving(false);
                            if (res.ok) {
                              setMessage(t('edit.saved'));
                              setEditingEndAt(false);
                              loadGiveaway();
                            } else {
                              setMessage(res.error || t('edit.error'));
                            }
                            setTimeout(() => setMessage(null), 3000);
                          }}
                          disabled={saving}
                          className="bg-tg-button text-tg-button-text rounded-lg px-3 py-2 text-sm disabled:opacity-50"
                        >
                          {saving ? '...' : '✓'}
                        </button>
                        <button
                          onClick={() => setEditingEndAt(false)}
                          className="bg-tg-secondary text-tg-hint rounded-lg px-3 py-2 text-sm"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span>{giveaway.endAt ? formatDate(giveaway.endAt) : t('info.noEndDate')}</span>
                        <button
                          onClick={() => {
                            setEditEndAtValue(giveaway.endAt
                              ? new Date(giveaway.endAt).toISOString().slice(0, 16)
                              : '');
                            setEditingEndAt(true);
                          }}
                          className="text-xs text-tg-button underline"
                        >
                          ✏️ {t('edit.change')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
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
                    {topInviters.map((inv) => (
                      <div key={inv.userId} className="flex items-center gap-3">
                        <span className="text-lg font-bold text-tg-hint w-6 text-center">
                          {inv.rank === 1 ? '🥇' : inv.rank === 2 ? '🥈' : inv.rank === 3 ? '🥉' : `${inv.rank}.`}
                        </span>
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
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Действия */}
            <div className="flex flex-wrap gap-3">
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
          </div>
        )}

        {/* Tab: Участники */}
        {activeTab === 'participants' && (
          <div className="space-y-4">
            {/* Поиск */}
            <input
              type="text"
              placeholder={t('participantsTab.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-tg-secondary text-tg-text rounded-lg px-4 py-3"
            />

            {/* Таблица */}
            {participants.length > 0 ? (
              <div className="bg-tg-secondary rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-tg-bg">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium">{t('participantsTab.user')}</th>
                        <th className="text-center px-4 py-3 font-medium">{t('participantsTab.tickets')}</th>
                        <th className="text-center px-4 py-3 font-medium">{t('participantsTab.invites')}</th>
                        <th className="text-right px-4 py-3 font-medium">{t('participantsTab.date')}</th>
                        <th className="text-right px-4 py-3 font-medium w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {participants.map((p) => (
                        <tr key={p.id} className="border-t border-tg-bg">
                          <td className="px-4 py-3">
                            <div className="font-medium">
                              {p.user.firstName || 'User'} {p.user.lastName || ''}
                            </div>
                            {p.user.username && (
                              <div className="text-tg-hint text-xs">@{p.user.username}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="font-medium">{p.ticketsBase + p.ticketsExtra}</span>
                            {p.ticketsExtra > 0 && (
                              <span className="text-green-500 text-xs ml-1">(+{p.ticketsExtra})</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">{p.invitedCount}</td>
                          <td className="px-4 py-3 text-right text-tg-hint">
                            {formatDate(p.joinedAt)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={async () => {
                                if (!confirm(`Забанить ${p.user.firstName || 'пользователя'}?`)) return;
                                const res = await banParticipant(giveawayId, p.user.id);
                                if (res.ok) {
                                  setMessage('✅ Пользователь забанен');
                                  loadParticipants();
                                } else {
                                  setMessage(res.error || 'Ошибка');
                                }
                                setTimeout(() => setMessage(null), 3000);
                              }}
                              title="Забанить"
                              className="p-1.5 rounded-lg text-red-400 hover:bg-red-50/10 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
          </div>
        )}

        {/* Tab: Победители */}
        {activeTab === 'winners' && (
          <div className="space-y-4">
            {giveaway.winners.length > 0 ? (
              <div className="space-y-2">
                {giveaway.winners.map((w) => (
                  <div
                    key={w.place}
                    className="flex items-center gap-4 bg-tg-secondary rounded-lg p-4"
                  >
                    <div className="text-3xl">
                      {w.place === 1 ? '🥇' : w.place === 2 ? '🥈' : w.place === 3 ? '🥉' : `#${w.place}`}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">
                        {w.user.firstName || 'User'} {w.user.lastName || ''}
                      </div>
                      {w.user.username && (
                        <div className="text-tg-hint text-sm">@{w.user.username}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-tg-secondary rounded-xl">
                <div className="flex justify-center mb-4">
                  <AppIcon name="icon-winner" variant="brand" size={56} />
                </div>
                <p className="text-tg-hint">{t('winnersTab.notDetermined')}</p>
              </div>
            )}
          </div>
        )}

        {/* Tab: Сторис */}
        {activeTab === 'stories' && (
          <div className="text-center py-12 bg-tg-secondary rounded-xl">
            <div className="text-4xl mb-4">📺</div>
            <p className="text-tg-hint mb-4">{t('storiesTab.description')}</p>
            <button
              onClick={() => router.push(`/creator/giveaway/${giveawayId}/stories`)}
              className="bg-tg-button text-tg-button-text rounded-lg px-4 py-2"
            >
              {t('storiesTab.openModeration')}
            </button>
          </div>
        )}
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
              <div className="text-4xl mb-3 animate-bounce">🚀</div>
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
              <div className="text-4xl mb-3 animate-shake">🗑️</div>
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

      {/* BottomSheet: Поделиться */}
      <ShareBottomSheet
        isOpen={showShareSheet}
        onClose={() => setShowShareSheet(false)}
        giveawayId={giveawayId}
        shortCode={giveaway.id.slice(0, 8)}
        botUsername={BOT_USERNAME}
      />

      {/* BottomSheet: Статистика */}
      <StatsBottomSheet
        isOpen={showStatsSheet}
        onClose={() => setShowStatsSheet(false)}
        giveawayId={giveawayId}
      />
    </main>
  );
}
