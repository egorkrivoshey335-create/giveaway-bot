'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  getMyParticipations,
  MyParticipation,
  ParticipationFilterStatus,
} from '@/lib/api';

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

// Склонение слов
function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

// Фильтры
const filters: { key: ParticipationFilterStatus; label: string; emoji?: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'active', label: 'Активные', emoji: '🟢' },
  { key: 'finished', label: 'Завершённые', emoji: '✅' },
  { key: 'won', label: 'Победы', emoji: '🏆' },
];

// Карточка участия
function ParticipationCard({ participation }: { participation: MyParticipation }) {
  const router = useRouter();
  const { giveaway, totalTickets, isWinner, winnerPlace } = participation;

  return (
    <div
      className="bg-tg-secondary rounded-xl overflow-hidden cursor-pointer hover:bg-tg-secondary/80 transition-colors relative"
      onClick={() => router.push(`/join/${giveaway.id}`)}
    >
      {/* Бейдж победителя */}
      {isWinner && (
        <div className="absolute top-2 right-2 bg-gradient-to-r from-yellow-400 to-yellow-500 text-black text-xs font-semibold px-2 py-1 rounded-full">
          🏆 {winnerPlace} место
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
            <span>🎫</span>
            <span>{totalTickets} {pluralize(totalTickets, 'билет', 'билета', 'билетов')}</span>
          </span>
          <span className="flex items-center gap-1">
            <span>👥</span>
            <span>{giveaway.participantsCount}</span>
          </span>
        </div>

        {/* Статус */}
        <div className="text-sm">
          {giveaway.status === 'ACTIVE' && giveaway.endAt && (
            <span className="text-orange-500">
              ⏰ Осталось: {formatTimeLeft(giveaway.endAt)}
            </span>
          )}
          {giveaway.status === 'SCHEDULED' && (
            <span className="text-blue-500">
              📅 Скоро начнётся
            </span>
          )}
          {giveaway.status === 'FINISHED' && (
            <span className={isWinner ? 'text-yellow-600 font-medium' : 'text-tg-hint'}>
              {isWinner ? '🏆 Вы выиграли!' : '✅ Завершён'}
            </span>
          )}
          {giveaway.status === 'CANCELLED' && (
            <span className="text-red-500">❌ Отменён</span>
          )}
        </div>
      </div>

      {/* Кнопка перехода */}
      <div className="border-t border-tg-bg px-4 py-3 flex items-center justify-between">
        <span className="text-sm text-tg-hint">
          {giveaway.status === 'FINISHED' 
            ? 'Посмотреть результаты' 
            : 'Открыть розыгрыш'}
        </span>
        <span className="text-tg-link">→</span>
      </div>
    </div>
  );
}

// Пустое состояние
function EmptyState({ filter }: { filter: ParticipationFilterStatus }) {
  const messages: Record<ParticipationFilterStatus, { title: string; subtitle: string; emoji: string }> = {
    all: {
      title: 'Вы ещё не участвовали в розыгрышах',
      subtitle: 'Найдите интересный розыгрыш и участвуйте!',
      emoji: '🎫',
    },
    active: {
      title: 'Нет активных розыгрышей',
      subtitle: 'Ваши активные розыгрыши появятся здесь',
      emoji: '🟢',
    },
    finished: {
      title: 'Нет завершённых розыгрышей',
      subtitle: 'Завершённые розыгрыши появятся здесь',
      emoji: '✅',
    },
    won: {
      title: 'Пока нет побед',
      subtitle: 'Участвуйте в розыгрышах — удача улыбнётся!',
      emoji: '🏆',
    },
    cancelled: {
      title: 'Нет отменённых розыгрышей',
      subtitle: 'Отменённые розыгрыши появятся здесь',
      emoji: '❌',
    },
  };

  const msg = messages[filter];

  return (
    <div className="text-center py-12 bg-tg-secondary rounded-xl">
      <div className="text-6xl mb-4">{msg.emoji}</div>
      <h2 className="text-xl font-semibold mb-2">{msg.title}</h2>
      <p className="text-tg-hint">{msg.subtitle}</p>
    </div>
  );
}

export function ParticipantSection() {
  const router = useRouter();
  const [filter, setFilter] = useState<ParticipationFilterStatus>('all');
  const [participations, setParticipations] = useState<MyParticipation[]>([]);
  const [counts, setCounts] = useState({ all: 0, active: 0, finished: 0, won: 0, cancelled: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadParticipations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMyParticipations({ status: filter, limit: 50 });
      if (res.ok) {
        setParticipations(res.participations || []);
        if (res.counts) {
          setCounts(res.counts);
        }
      } else {
        setError(res.error || 'Ошибка загрузки');
      }
    } catch (err) {
      setError('Ошибка соединения');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadParticipations();
  }, [loadParticipations]);

  return (
    <div>
      {/* Заголовок */}
      <div className="mb-4">
        <h2 className="text-xl font-bold">🎫 Мои участия</h2>
        <p className="text-tg-hint text-sm">Розыгрыши, в которых вы участвуете</p>
      </div>

      {/* Кнопка каталога */}
      <button
        onClick={() => router.push('/catalog')}
        className="w-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 text-tg-text rounded-xl py-3 px-4 mb-6 font-medium hover:from-purple-500/30 hover:to-pink-500/30 transition-all flex items-center justify-center gap-2"
      >
        <span>🎁</span>
        <span>Каталог розыгрышей</span>
        <span className="text-tg-hint">→</span>
      </button>

      {/* Фильтры — сетка 2x2 */}
      <div className="grid grid-cols-2 gap-2 mb-6">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              filter === f.key
                ? 'bg-tg-button text-tg-button-text'
                : 'bg-tg-secondary text-tg-text hover:bg-tg-secondary/80'
            }`}
          >
            {f.emoji && <span className="mr-1">{f.emoji}</span>}
            {f.label}
            {counts[f.key] !== undefined && counts[f.key] > 0 && (
              <span className="ml-1 opacity-70">({counts[f.key]})</span>
            )}
          </button>
        ))}
      </div>

      {/* Контент */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-tg-button border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-tg-hint">Загрузка...</p>
        </div>
      ) : error ? (
        <div className="text-center py-12 bg-tg-secondary rounded-xl">
          <div className="text-4xl mb-4">❌</div>
          <p className="text-tg-hint mb-4">{error}</p>
          <button
            onClick={loadParticipations}
            className="bg-tg-button text-tg-button-text rounded-lg px-4 py-2"
          >
            Попробовать снова
          </button>
        </div>
      ) : participations.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <div className="grid gap-4">
          {participations.map((p) => (
            <ParticipationCard key={p.id} participation={p} />
          ))}
        </div>
      )}
    </div>
  );
}

export default ParticipantSection;
