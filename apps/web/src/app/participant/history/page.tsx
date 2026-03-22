'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getMyParticipations, MyParticipation } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { AppIcon } from '@/components/AppIcon';

type FilterStatus = 'all' | 'active' | 'finished' | 'won';

const FILTER_LABELS: Record<FilterStatus, React.ReactNode> = {
  all: <><AppIcon name="icon-ticket" size={16} /> Все</>,
  active: <>🟢 Активные</>,
  finished: <><AppIcon name="icon-success" size={14} /> Завершённые</>,
  won: <><AppIcon name="icon-winner" size={14} /> Победы</>,
};

const PAGE_SIZE = 20;

const GIVEAWAY_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: 'Активен', className: 'bg-green-500/15 text-green-500' },
  FINISHED: { label: 'Завершён', className: 'bg-gray-500/15 text-gray-400' },
  CANCELLED: { label: 'Отменён', className: 'bg-red-500/15 text-red-400' },
  SCHEDULED: { label: 'Запланирован', className: 'bg-blue-500/15 text-blue-500' },
};

/**
 * Страница истории участий пользователя
 * Задача 14.7 из TASKS-14-features.md
 */
export default function ParticipationHistoryPage() {
  const router = useRouter();

  const [filter, setFilter] = useState<FilterStatus>('all');
  const [participations, setParticipations] = useState<MyParticipation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ all: 0, active: 0, finished: 0, won: 0, cancelled: 0 });

  const offsetRef = useRef(0);

  const load = useCallback(
    async (status: FilterStatus, offset: number, append: boolean) => {
      if (offset === 0) setLoading(true);
      else setLoadingMore(true);

      try {
        const res = await getMyParticipations({
          status: status === 'all' ? undefined : status,
          limit: PAGE_SIZE,
          offset,
        });

        if (res.ok) {
          if (append) {
            setParticipations((prev) => [...prev, ...(res.participations ?? [])]);
          } else {
            setParticipations(res.participations ?? []);
          }
          setHasMore(res.hasMore ?? false);
          setTotal(res.total ?? 0);
          if (res.counts) {
            setCounts({
              all: res.counts.all,
              active: res.counts.active,
              finished: res.counts.finished + res.counts.cancelled,
              won: res.counts.won,
              cancelled: res.counts.cancelled,
            });
          }
          offsetRef.current = offset + (res.participations?.length ?? 0);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    []
  );

  useEffect(() => {
    offsetRef.current = 0;
    load(filter, 0, false);
  }, [filter, load]);

  function handleLoadMore() {
    load(filter, offsetRef.current, true);
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  return (
    <main className="min-h-screen bg-tg-bg pb-safe">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-tg-bg/95 backdrop-blur border-b border-tg-secondary">
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-3">
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={() => router.back()}
              className="p-2 -ml-2 rounded-full hover:bg-tg-secondary transition-colors"
            >
              <AppIcon name="icon-back" size={20} />
            </button>
            <div>
              <h1 className="text-xl font-bold">📜 История участий</h1>
              {total > 0 && <p className="text-xs text-tg-hint">{total} розыгрышей</p>}
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
            {(['all', 'active', 'finished', 'won'] as FilterStatus[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${
                  filter === f
                    ? 'bg-tg-button text-tg-button-text'
                    : 'bg-tg-secondary text-tg-hint hover:bg-tg-secondary/80'
                }`}
              >
                {FILTER_LABELS[f]}
                {f !== 'all' && counts[f] > 0 && (
                  <span className="ml-1 opacity-70">({counts[f]})</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-4">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              className="space-y-3"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              layout
              transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94], layout: { duration: 0.35 } }}
            >
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="bg-tg-secondary rounded-xl p-4 animate-pulse">
                  <div className="h-5 bg-tg-bg rounded w-3/4 mb-2" />
                  <div className="h-4 bg-tg-bg rounded w-1/3" />
                </div>
              ))}
            </motion.div>
          ) : participations.length === 0 ? (
            <motion.div
              key={`empty-${filter}`}
              className="text-center py-16"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              layout
              transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94], layout: { duration: 0.35 } }}
            >
              <span className="text-5xl block mb-3"><AppIcon name="icon-ticket" size={16} /></span>
              <p className="font-semibold mb-1">Здесь пусто</p>
              <p className="text-tg-hint text-sm">
                {filter === 'all'
                  ? 'Вы ещё не участвовали ни в одном розыгрыше'
                  : filter === 'won'
                  ? 'У вас пока нет побед'
                  : 'Нет участий с таким статусом'}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key={`list-${filter}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              layout
              transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94], layout: { duration: 0.35 } }}
            >
              <div className="space-y-3">
                {participations.map((p) => {
                  const statusInfo = GIVEAWAY_STATUS_BADGE[p.giveaway.status];
                  return (
                    <div
                      key={p.id}
                      onClick={() => router.push(`/giveaway/${p.giveaway.id}`)}
                      className="bg-tg-secondary rounded-xl p-4 cursor-pointer hover:bg-tg-secondary/80 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {p.isWinner && (
                              <span className="text-xs font-bold text-yellow-500">
                                <AppIcon name="icon-winner" size={14} /> {p.winnerPlace ? `#${p.winnerPlace}` : 'Победитель'}
                              </span>
                            )}
                            {statusInfo && (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusInfo.className}`}>
                                {statusInfo.label}
                              </span>
                            )}
                          </div>
                          <h3 className="font-semibold text-sm leading-tight line-clamp-2">
                            {p.giveaway.title}
                          </h3>
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-tg-hint">
                            <span><AppIcon name="icon-ticket" size={16} /> {p.totalTickets} билет{p.totalTickets !== 1 ? (p.totalTickets < 5 ? 'а' : 'ов') : ''}</span>
                            {p.ticketsExtra > 0 && (
                              <span className="text-green-500">+{p.ticketsExtra} бонус</span>
                            )}
                            <span><AppIcon name="icon-calendar" size={14} /> {formatDate(p.joinedAt)}</span>
                          </div>
                        </div>
                        <div className="text-right text-xs text-tg-hint flex-shrink-0">
                          <div>{p.giveaway.participantsCount} уч.</div>
                          <div><AppIcon name="icon-group" size={14} /> {p.giveaway.winnersCount} победит.</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {hasMore && (
                <div className="mt-4 text-center">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="px-6 py-2.5 bg-tg-secondary rounded-xl text-sm font-medium hover:bg-tg-secondary/80 transition-colors disabled:opacity-50"
                  >
                    {loadingMore ? 'Загрузка...' : 'Загрузить ещё'}
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
