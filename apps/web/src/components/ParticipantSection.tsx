'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
            <span>🎫</span>
            <span>{t('tickets', { count: totalTickets })}</span>
          </span>
          <span className="flex items-center gap-1">
            <span>👥</span>
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
            <span className="text-blue-500">
              📅 {tGiveaway('status.scheduled')}
            </span>
          )}
          {giveaway.status === 'FINISHED' && (
            <span className={isWinner ? 'text-yellow-600 font-medium' : 'text-tg-hint'}>
              {isWinner ? t('youWon') : `✅ ${tGiveaway('status.finished')}`}
            </span>
          )}
          {giveaway.status === 'CANCELLED' && (
            <span className="text-red-500">❌ {tGiveaway('status.cancelled')}</span>
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
        <span className="text-tg-link">→</span>
      </div>
    </div>
  );
}

// Пустое состояние
function EmptyState({ filter }: { filter: ParticipationFilterStatus }) {
  const t = useTranslations('participant.empty');
  
  const emojis: Record<ParticipationFilterStatus, string> = {
    all: '🎫',
    active: '🟢',
    finished: '✅',
    won: '🏆',
    cancelled: '❌',
  };

  return (
    <div className="text-center py-12 bg-tg-secondary rounded-xl">
      <div className="text-6xl mb-4">{emojis[filter]}</div>
      <h2 className="text-xl font-semibold mb-2">{t(`${filter}.title`)}</h2>
      <p className="text-tg-hint">{t(`${filter}.subtitle`)}</p>
    </div>
  );
}

export function ParticipantSection() {
  const router = useRouter();
  const t = useTranslations('participant');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  
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
        setError(res.error || tErrors('loadFailed'));
      }
    } catch (err) {
      setError(tErrors('connectionError'));
    } finally {
      setLoading(false);
    }
  }, [filter, tErrors]);

  useEffect(() => {
    loadParticipations();
  }, [loadParticipations]);

  // Эмодзи для фильтров
  const filterEmojis: Record<ParticipationFilterStatus, string | undefined> = {
    all: undefined,
    active: '🟢',
    finished: '✅',
    won: '🏆',
    cancelled: '❌',
  };

  return (
    <div>
      {/* Заголовок */}
      <div className="mb-4">
        <h2 className="text-xl font-bold">{t('title')}</h2>
        <p className="text-tg-hint text-sm">{t('subtitle')}</p>
      </div>

      {/* Кнопка каталога */}
      <button
        onClick={() => router.push('/catalog')}
        className="w-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 text-tg-text rounded-xl py-3 px-4 mb-6 font-medium hover:from-purple-500/30 hover:to-pink-500/30 transition-all flex items-center justify-center gap-2"
      >
        <span>{t('catalogButton')}</span>
        <span className="text-tg-hint">→</span>
      </button>

      {/* Фильтры — сетка 2x2 */}
      <div className="grid grid-cols-2 gap-2 mb-6">
        {filterKeys.map((key) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              filter === key
                ? 'bg-tg-button text-tg-button-text'
                : 'bg-tg-secondary text-tg-text hover:bg-tg-secondary/80'
            }`}
          >
            {filterEmojis[key] && <span className="mr-1">{filterEmojis[key]}</span>}
            {t(`filters.${key}`)}
            {counts[key] !== undefined && counts[key] > 0 && (
              <span className="ml-1 opacity-70">({counts[key]})</span>
            )}
          </button>
        ))}
      </div>

      {/* Контент */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-tg-button border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-tg-hint">{tCommon('loading')}</p>
        </div>
      ) : error ? (
        <div className="text-center py-12 bg-tg-secondary rounded-xl">
          <div className="text-4xl mb-4">❌</div>
          <p className="text-tg-hint mb-4">{error}</p>
          <button
            onClick={loadParticipations}
            className="bg-tg-button text-tg-button-text rounded-lg px-4 py-2"
          >
            {tCommon('tryAgain')}
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
