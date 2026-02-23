'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getBanList, deleteBanEntry, BanEntry } from '@/lib/api';

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
      showMessage('✅ Пользователь разбанен');
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
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
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
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-tg-button border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-tg-hint text-sm">Загрузка...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-16">
            <span className="text-5xl block mb-3">✅</span>
            <p className="font-semibold mb-1">Бан-лист пуст</p>
            <p className="text-tg-hint text-sm">Заблокированных пользователей нет</p>
          </div>
        ) : (
          <div className="space-y-2">
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
          </div>
        )}
      </div>
    </main>
  );
}
