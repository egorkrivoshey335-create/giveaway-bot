'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  getGiveawaysList,
  duplicateGiveaway,
  deleteGiveaway,
  GiveawaySummary,
} from '@/lib/api';
import { InlineToast } from '@/components/Toast';

// Статусы для фильтрации
type StatusFilter = 'all' | 'DRAFT' | 'PENDING_CONFIRM' | 'SCHEDULED' | 'ACTIVE' | 'FINISHED' | 'CANCELLED';

// Получить метку статуса
function getStatusLabel(status: string): string {
  switch (status) {
    case 'DRAFT': return '📝 Черновик';
    case 'PENDING_CONFIRM': return '⏳ Ожидает';
    case 'SCHEDULED': return '⏰ Запланирован';
    case 'ACTIVE': return '🟢 Активен';
    case 'FINISHED': return '✅ Завершён';
    case 'CANCELLED': return '❌ Отменён';
    case 'ERROR': return '⚠️ Ошибка';
    default: return status;
  }
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
    default: return 'bg-gray-500/20 text-gray-600';
  }
}

// Форматирование оставшегося времени
function formatTimeLeft(endAt: string): string {
  const end = new Date(endAt);
  const now = new Date();
  const diff = end.getTime() - now.getTime();

  if (diff <= 0) return 'Завершается...';

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

  // Получить текст даты для карточки (всегда показываем, чтобы высота была одинаковой)
  const getDateInfo = () => {
    switch (giveaway.status) {
      case 'ACTIVE':
        return giveaway.endAt 
          ? { text: `⏰ Осталось: ${formatTimeLeft(giveaway.endAt)}`, className: 'text-orange-500' }
          : { text: 'Без даты окончания', className: 'text-tg-hint' };
      case 'FINISHED':
        return { text: `Завершён ${giveaway.endAt ? formatDate(giveaway.endAt) : ''}`, className: 'text-tg-hint' };
      case 'SCHEDULED':
        return giveaway.startAt
          ? { text: `Старт: ${formatDate(giveaway.startAt)}`, className: 'text-blue-500' }
          : { text: 'Дата старта не указана', className: 'text-tg-hint' };
      case 'PENDING_CONFIRM':
        return { text: 'Ожидает подтверждения', className: 'text-yellow-600' };
      case 'DRAFT':
        return { text: `Создан ${formatDate(giveaway.createdAt)}`, className: 'text-tg-hint' };
      case 'CANCELLED':
        return { text: 'Розыгрыш отменён', className: 'text-red-500' };
      default:
        return { text: `Создан ${formatDate(giveaway.createdAt)}`, className: 'text-tg-hint' };
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
          <h3 className="font-semibold text-lg line-clamp-2">{giveaway.title || 'Без названия'}</h3>
          <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${getStatusBadgeClass(giveaway.status)}`}>
            {getStatusLabel(giveaway.status)}
          </span>
        </div>

        {/* Статистика */}
        <div className="flex items-center gap-4 text-sm text-tg-hint mb-3">
          <span className="flex items-center gap-1">
            <span>👥</span>
            <span>{giveaway.participantsCount}</span>
          </span>
          <span className="flex items-center gap-1">
            <span>🏆</span>
            <span>{giveaway.winnersCount}</span>
          </span>
        </div>

        {/* Дата — всегда показываем для одинаковой высоты карточек */}
        <div className={`text-sm ${dateInfo.className}`}>
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
          📊 Статистика
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate(giveaway.id);
          }}
          className="flex-1 py-3 text-sm text-tg-link hover:bg-tg-bg/50 transition-colors border-l border-tg-bg"
        >
          📋 Копия
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
                    ✏️ Редактировать
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
                    📤 Опубликовать
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
                    🔗 Поделиться
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
                    🏆 Результаты
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
                    🗑️ Удалить
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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [giveaways, setGiveaways] = useState<GiveawaySummary[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<string | null>(null);

  // Загрузка розыгрышей
  const loadGiveaways = useCallback(async () => {
    try {
      const res = await getGiveawaysList({
        status: statusFilter === 'all' ? undefined : statusFilter,
        limit: 50,
      });

      if (!res.ok) {
        setError(res.error || 'Ошибка загрузки');
        return;
      }

      setGiveaways(res.giveaways || []);
      if (res.counts) {
        setCounts({
          all: res.counts.all,
          DRAFT: res.counts.draft,
          PENDING_CONFIRM: res.counts.pendingConfirm,
          SCHEDULED: res.counts.scheduled,
          ACTIVE: res.counts.active,
          FINISHED: res.counts.finished,
          CANCELLED: res.counts.cancelled,
        });
      }
    } catch (err) {
      console.error('Failed to load giveaways:', err);
      setError('Ошибка загрузки розыгрышей');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadGiveaways();
  }, [loadGiveaways]);

  // Дублировать розыгрыш
  const handleDuplicate = async (id: string) => {
    try {
      const res = await duplicateGiveaway(id);
      if (res.ok && res.newGiveawayId) {
        setMessage('✅ Розыгрыш скопирован');
        // Переходим к редактированию копии
        router.push(`/creator/giveaway/new?draft=${res.newGiveawayId}`);
      } else {
        setMessage(res.error || 'Ошибка копирования');
      }
    } catch (err) {
      console.error('Duplicate error:', err);
      setMessage('Ошибка копирования');
    }
    setTimeout(() => setMessage(null), 3000);
  };

  // Удалить розыгрыш
  const handleDelete = async (id: string) => {
    if (!confirm('Удалить розыгрыш? Это действие нельзя отменить.')) {
      return;
    }

    try {
      const res = await deleteGiveaway(id);
      if (res.ok) {
        setMessage('✅ Розыгрыш удалён');
        loadGiveaways();
      } else {
        setMessage(res.error || 'Ошибка удаления');
      }
    } catch (err) {
      console.error('Delete error:', err);
      setMessage('Ошибка удаления');
    }
    setTimeout(() => setMessage(null), 3000);
  };

  // Открыть детали
  const handleOpenDetails = (id: string) => {
    router.push(`/creator/giveaway/${id}`);
  };

  // Скопировать ссылку
  const handleCopyLink = (id: string) => {
    const link = `https://t.me/BeastRandomBot/participate?startapp=join_${id}`;
    navigator.clipboard.writeText(link);
    setMessage('✅ Ссылка скопирована');
    setTimeout(() => setMessage(null), 2000);
  };

  // Редактировать/Опубликовать
  const handleEdit = (id: string) => {
    router.push(`/creator/giveaway/new?draft=${id}`);
  };

  // Фильтры
  const filters: { key: StatusFilter; label: string; icon: string }[] = [
    { key: 'all', label: 'Все', icon: '' },
    { key: 'ACTIVE', label: 'Активные', icon: '🟢' },
    { key: 'SCHEDULED', label: 'Запланированные', icon: '⏰' },
    { key: 'FINISHED', label: 'Завершённые', icon: '✅' },
    { key: 'DRAFT', label: 'Черновики', icon: '📝' },
  ];

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

  if (error) {
    return (
      <main className="min-h-screen p-4">
        <div className="max-w-4xl mx-auto text-center py-12">
          <div className="text-4xl mb-4">❌</div>
          <p className="text-tg-hint mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-tg-button text-tg-button-text rounded-lg px-4 py-2"
          >
            Обновить
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Мои розыгрыши</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/creator/channels')}
              className="bg-tg-secondary text-tg-text rounded-lg px-3 py-2 font-medium flex items-center gap-2 hover:bg-tg-secondary/80 transition-colors"
              title="Управление каналами"
            >
              <span>📣</span>
              <span className="hidden sm:inline">Каналы</span>
            </button>
            <button
              onClick={() => router.push('/creator/giveaway/new')}
              className="bg-tg-button text-tg-button-text rounded-lg px-4 py-2 font-medium flex items-center gap-2"
            >
              <span>➕</span>
              <span>Создать</span>
            </button>
          </div>
        </div>

        {/* Сообщение */}
        <InlineToast message={message} onClose={() => setMessage(null)} />

        {/* Фильтры */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                statusFilter === f.key
                  ? 'bg-tg-button text-tg-button-text'
                  : 'bg-tg-secondary text-tg-text hover:bg-tg-secondary/80'
              }`}
            >
              {f.icon && <span className="mr-1">{f.icon}</span>}
              {f.label}
              {counts[f.key] !== undefined && (
                <span className="ml-1 opacity-70">({counts[f.key]})</span>
              )}
            </button>
          ))}
        </div>

        {/* Список розыгрышей */}
        {giveaways.length > 0 ? (
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
        ) : (
          <div className="text-center py-12 bg-tg-secondary rounded-xl">
            <div className="text-6xl mb-4">🎁</div>
            <h2 className="text-xl font-semibold mb-2">
              {statusFilter === 'all' ? 'У вас пока нет розыгрышей' : 'Нет розыгрышей с таким статусом'}
            </h2>
            <p className="text-tg-hint mb-6">
              Создайте свой первый розыгрыш и привлекайте подписчиков!
            </p>
            <button
              onClick={() => router.push('/creator/giveaway/new')}
              className="bg-tg-button text-tg-button-text rounded-lg px-6 py-3 font-medium"
            >
              Создать розыгрыш
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
