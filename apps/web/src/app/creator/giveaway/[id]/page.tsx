'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getGiveawayFull,
  getGiveawayStats,
  getGiveawayParticipants,
  duplicateGiveaway,
  GiveawayFull,
  GiveawayStats,
  GiveawayParticipant,
} from '@/lib/api';
import { InlineToast } from '@/components/Toast';

type TabType = 'overview' | 'participants' | 'winners' | 'stories';

// Получить метку статуса
function getStatusLabel(status: string): string {
  switch (status) {
    case 'DRAFT': return '📝 Черновик';
    case 'PENDING_CONFIRM': return '⏳ Ожидает подтверждения';
    case 'SCHEDULED': return '⏰ Запланирован';
    case 'ACTIVE': return '🟢 Активен';
    case 'FINISHED': return '✅ Завершён';
    case 'CANCELLED': return '❌ Отменён';
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
    <div className="bg-tg-secondary rounded-lg p-4 text-center">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-tg-hint">{label}</div>
      {subValue && <div className="text-xs text-green-500 mt-1">{subValue}</div>}
    </div>
  );
}

export default function GiveawayDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const giveawayId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [giveaway, setGiveaway] = useState<GiveawayFull | null>(null);
  const [stats, setStats] = useState<GiveawayStats | null>(null);
  const [participants, setParticipants] = useState<GiveawayParticipant[]>([]);
  const [participantsTotal, setParticipantsTotal] = useState(0);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  // Загрузка данных розыгрыша
  const loadGiveaway = useCallback(async () => {
    try {
      const [giveawayRes, statsRes] = await Promise.all([
        getGiveawayFull(giveawayId),
        getGiveawayStats(giveawayId),
      ]);

      if (!giveawayRes.ok || !giveawayRes.giveaway) {
        setError(giveawayRes.error || 'Розыгрыш не найден');
        return;
      }

      setGiveaway(giveawayRes.giveaway);
      if (statsRes.ok && statsRes.stats) {
        setStats(statsRes.stats);
      }
    } catch (err) {
      console.error('Failed to load giveaway:', err);
      setError('Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [giveawayId]);

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
  }, [loadGiveaway]);

  useEffect(() => {
    if (activeTab === 'participants') {
      loadParticipants(searchQuery);
    }
  }, [activeTab, searchQuery, loadParticipants]);

  // Дублировать
  const handleDuplicate = async () => {
    try {
      const res = await duplicateGiveaway(giveawayId);
      if (res.ok && res.newGiveawayId) {
        setMessage('✅ Розыгрыш скопирован');
        router.push(`/creator/giveaway/new?draft=${res.newGiveawayId}`);
      } else {
        setMessage(res.error || 'Ошибка');
      }
    } catch (err) {
      console.error('Duplicate error:', err);
      setMessage('Ошибка копирования');
    }
    setTimeout(() => setMessage(null), 3000);
  };

  // Скопировать ссылку
  const handleCopyLink = () => {
    const link = `https://t.me/BeastRandomBot/participate?startapp=join_${giveawayId}`;
    navigator.clipboard.writeText(link);
    setMessage('✅ Ссылка скопирована');
    setTimeout(() => setMessage(null), 2000);
  };

  if (loading) {
    return (
      <main className="min-h-screen p-4">
        <div className="max-w-4xl mx-auto text-center py-12">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-tg-hint">Загрузка...</p>
        </div>
      </main>
    );
  }

  if (error || !giveaway) {
    return (
      <main className="min-h-screen p-4">
        <div className="max-w-4xl mx-auto text-center py-12">
          <div className="text-4xl mb-4">❌</div>
          <p className="text-tg-hint mb-4">{error || 'Розыгрыш не найден'}</p>
          <button
            onClick={() => router.push('/creator')}
            className="bg-tg-button text-tg-button-text rounded-lg px-4 py-2"
          >
            К списку розыгрышей
          </button>
        </div>
      </main>
    );
  }

  // Табы
  const tabs: { key: TabType; label: string; show: boolean }[] = [
    { key: 'overview', label: '📊 Обзор', show: true },
    { key: 'participants', label: `👥 Участники (${giveaway.participantsCount})`, show: true },
    { key: 'winners', label: `🏆 Победители (${giveaway.winners.length})`, show: giveaway.status === 'FINISHED' && giveaway.winners.length > 0 },
    { key: 'stories', label: '📺 Сторис', show: giveaway.condition?.storiesEnabled || false },
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
            ← К списку розыгрышей
          </button>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">{giveaway.title}</h1>
              <p className="text-tg-hint mt-1">{getStatusLabel(giveaway.status)}</p>
            </div>
          </div>
        </div>

        {/* Сообщение */}
        <InlineToast message={message} onClose={() => setMessage(null)} />

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {tabs.filter(t => t.show).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'bg-tg-button text-tg-button-text'
                  : 'bg-tg-secondary text-tg-text'
              }`}
            >
              {tab.label}
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
                  icon="👥"
                  label="Участники"
                  value={stats.participantsCount}
                  subValue={stats.participantsToday > 0 ? `+${stats.participantsToday} сегодня` : undefined}
                />
                <StatCard icon="🎫" label="Билеты" value={stats.ticketsTotal} />
                <StatCard icon="👥" label="Приглашения" value={stats.invitesCount} />
                <StatCard icon="⚡" label="Бусты" value={stats.boostsCount} />
              </div>
            )}

            {/* Информация */}
            <div className="bg-tg-secondary rounded-xl p-4 space-y-3">
              <h3 className="font-medium mb-3">📋 Информация</h3>
              
              <div className="flex justify-between text-sm">
                <span className="text-tg-hint">Победителей:</span>
                <span>{giveaway.winnersCount}</span>
              </div>
              
              <div className="flex justify-between text-sm">
                <span className="text-tg-hint">Начало:</span>
                <span>{formatDate(giveaway.startAt)}</span>
              </div>
              
              <div className="flex justify-between text-sm">
                <span className="text-tg-hint">Окончание:</span>
                <span>{formatDate(giveaway.endAt)}</span>
              </div>
              
              <div className="flex justify-between text-sm">
                <span className="text-tg-hint">Создан:</span>
                <span>{formatDate(giveaway.createdAt)}</span>
              </div>

              {giveaway.publishChannels.length > 0 && (
                <div className="pt-2 border-t border-tg-bg">
                  <div className="text-sm text-tg-hint mb-1">Каналы публикации:</div>
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
                <h3 className="font-medium mb-3">⚙️ Условия</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-tg-hint">Приглашения:</span>
                    <span>{giveaway.condition.inviteEnabled ? `✅ до ${giveaway.condition.inviteMax}` : '❌'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tg-hint">Бусты:</span>
                    <span>{giveaway.condition.boostEnabled ? '✅' : '❌'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tg-hint">Сторис:</span>
                    <span>{giveaway.condition.storiesEnabled ? '✅' : '❌'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tg-hint">Капча:</span>
                    <span>{giveaway.condition.captchaMode}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Рост участников */}
            {stats && stats.participantsGrowth.length > 0 && (
              <div className="bg-tg-secondary rounded-xl p-4">
                <h3 className="font-medium mb-3">📈 Рост участников (7 дней)</h3>
                <div className="flex items-end gap-1 h-24">
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
              </div>
            )}

            {/* Действия */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleCopyLink}
                className="bg-tg-button text-tg-button-text rounded-lg px-4 py-2 text-sm font-medium"
              >
                🔗 Скопировать ссылку
              </button>
              <button
                onClick={handleDuplicate}
                className="bg-tg-secondary text-tg-text rounded-lg px-4 py-2 text-sm font-medium"
              >
                📋 Дублировать
              </button>
              {giveaway.condition?.storiesEnabled && (
                <button
                  onClick={() => router.push(`/creator/giveaway/${giveawayId}/stories`)}
                  className="bg-tg-secondary text-tg-text rounded-lg px-4 py-2 text-sm font-medium"
                >
                  📺 Модерация сторис
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
              placeholder="Поиск по имени или username..."
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
                        <th className="text-left px-4 py-3 font-medium">Пользователь</th>
                        <th className="text-center px-4 py-3 font-medium">Билеты</th>
                        <th className="text-center px-4 py-3 font-medium">Приглашения</th>
                        <th className="text-right px-4 py-3 font-medium">Дата</th>
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {participantsTotal > participants.length && (
                  <div className="text-center py-3 text-tg-hint text-sm">
                    Показано {participants.length} из {participantsTotal}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 bg-tg-secondary rounded-xl">
                <div className="text-4xl mb-4">👥</div>
                <p className="text-tg-hint">
                  {searchQuery ? 'Участники не найдены' : 'Пока нет участников'}
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
                <div className="text-4xl mb-4">🏆</div>
                <p className="text-tg-hint">Победители ещё не определены</p>
              </div>
            )}
          </div>
        )}

        {/* Tab: Сторис */}
        {activeTab === 'stories' && (
          <div className="text-center py-12 bg-tg-secondary rounded-xl">
            <div className="text-4xl mb-4">📺</div>
            <p className="text-tg-hint mb-4">Модерация заявок на сторис</p>
            <button
              onClick={() => router.push(`/creator/giveaway/${giveawayId}/stories`)}
              className="bg-tg-button text-tg-button-text rounded-lg px-4 py-2"
            >
              Открыть модерацию
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
