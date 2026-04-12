'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getBanList, deleteBanEntry, BanEntry } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { AppIcon } from '@/components/AppIcon';
import { Mascot } from '@/components/Mascot';

/**
 * Страница бан-листа создателя
 * Задача 14.4 из TASKS-14-features.md
 */
export default function BanListPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<BanEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getBanList();
      if (res.ok && res.entries) {
        setEntries(res.entries);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUnban(entryId: string, name: string) {
    if (!confirm(`Разбанить ${name}?`)) return;
    const res = await deleteBanEntry(entryId);
    if (res.ok) {
      showMessage('Пользователь разбанен');
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
    } else {
      showMessage(res.error || 'Ошибка');
    }
  }

  return (
    <main className="min-h-screen bg-tg-bg pb-safe">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-tg-bg/95 backdrop-blur border-b border-tg-secondary">
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-2 -ml-2 rounded-full hover:bg-tg-secondary transition-colors"
            >
              <AppIcon name="icon-back" size={20} />
            </button>
            <div>
              <h1 className="text-xl font-bold">🚫 Бан-лист</h1>
              <p className="text-xs text-tg-hint">Заблокированные пользователи</p>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {message && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-tg-text text-tg-bg text-sm px-4 py-2.5 rounded-full shadow-lg">
          {message}
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-4">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              className="text-center py-12"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              layout
              transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94], layout: { duration: 0.35 } }}
            >
              <Mascot type="state-loading" size={100} loop autoplay />
              <p className="text-tg-hint text-sm mt-2">Загрузка...</p>
            </motion.div>
          ) : entries.length === 0 ? (
            <motion.div
              key="empty"
              className="text-center py-16"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              layout
              transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94], layout: { duration: 0.35 } }}
            >
              <Mascot type="state-empty" size={120} loop autoplay />
              <p className="font-semibold mb-1 mt-2">Бан-лист пуст</p>
              <p className="text-tg-hint text-sm">Заблокированных пользователей нет</p>
            </motion.div>
          ) : (
            <motion.div
              key="list"
              className="space-y-2"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              layout
              transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94], layout: { duration: 0.35 } }}
            >
              <p className="text-tg-hint text-sm px-1 mb-3">{entries.length} пользователей заблокировано</p>
              {entries.map((entry) => {
                const name = [entry.bannedUser.firstName, entry.bannedUser.lastName]
                  .filter(Boolean)
                  .join(' ') || `User ${entry.bannedUser.telegramUserId}`;

                return (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between bg-tg-secondary rounded-xl px-4 py-3"
                  >
                    <div>
                      <div className="font-medium">{name}</div>
                      {entry.bannedUser.username && (
                        <div className="text-tg-hint text-xs">@{entry.bannedUser.username}</div>
                      )}
                      {entry.reason && (
                        <div className="text-tg-hint text-xs mt-0.5">Причина: {entry.reason}</div>
                      )}
                    </div>
                    <button
                      onClick={() => handleUnban(entry.id, name)}
                      className="text-sm text-tg-button font-medium hover:underline"
                    >
                      Разбанить
                    </button>
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
