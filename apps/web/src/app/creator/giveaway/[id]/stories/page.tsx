'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getStoryRequests,
  approveStoryRequest,
  rejectStoryRequest,
  StoryRequest,
} from '@/lib/api';
import { InlineToast } from '@/components/Toast';

export default function StoryRequestsPage() {
  const params = useParams();
  const router = useRouter();
  const giveawayId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState<StoryRequest[]>([]);
  const [stats, setStats] = useState<{
    pending: number;
    approved: number;
    rejected: number;
    total: number;
  } | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Загрузить заявки
  const loadRequests = useCallback(async () => {
    try {
      const res = await getStoryRequests(giveawayId);
      
      if (!res.ok) {
        setError(res.error || 'Ошибка загрузки');
        return;
      }

      setRequests(res.requests || []);
      setStats(res.stats || null);
    } catch (err) {
      console.error('Failed to load story requests:', err);
      setError('Ошибка загрузки заявок');
    } finally {
      setLoading(false);
    }
  }, [giveawayId]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  // Одобрить заявку
  const handleApprove = useCallback(async (requestId: string) => {
    setProcessingId(requestId);
    setMessage(null);

    try {
      const res = await approveStoryRequest(giveawayId, requestId);
      
      if (res.ok) {
        setMessage('✅ Заявка одобрена');
        await loadRequests();
      } else {
        setMessage(res.error || 'Ошибка');
      }
    } catch (err) {
      console.error('Failed to approve:', err);
      setMessage('Ошибка одобрения');
    } finally {
      setProcessingId(null);
      setTimeout(() => setMessage(null), 3000);
    }
  }, [giveawayId, loadRequests]);

  // Отклонить заявку
  const handleReject = useCallback(async (requestId: string) => {
    const reason = prompt('Причина отклонения (необязательно):');
    
    setProcessingId(requestId);
    setMessage(null);

    try {
      const res = await rejectStoryRequest(giveawayId, requestId, reason || undefined);
      
      if (res.ok) {
        setMessage('❌ Заявка отклонена');
        await loadRequests();
      } else {
        setMessage(res.error || 'Ошибка');
      }
    } catch (err) {
      console.error('Failed to reject:', err);
      setMessage('Ошибка отклонения');
    } finally {
      setProcessingId(null);
      setTimeout(() => setMessage(null), 3000);
    }
  }, [giveawayId, loadRequests]);

  // Открыть профиль пользователя в Telegram
  const openTelegramProfile = useCallback((username: string | null, telegramUserId: string) => {
    const tg = (window as unknown as { Telegram?: { WebApp?: { openTelegramLink?: (url: string) => void } } }).Telegram?.WebApp;
    
    if (username) {
      // Если есть username — открываем через https://t.me/username
      const profileUrl = `https://t.me/${username}`;
      if (tg?.openTelegramLink) {
        tg.openTelegramLink(profileUrl);
      } else {
        window.open(profileUrl, '_blank');
      }
    } else {
      // Если нет username — используем tg://user?id=
      // Это работает только внутри Telegram
      const tgUserUrl = `tg://user?id=${telegramUserId}`;
      if (tg?.openTelegramLink) {
        tg.openTelegramLink(tgUserUrl);
      } else {
        // В браузере показываем alert с ID
        alert(`Telegram ID: ${telegramUserId}\n\nУ пользователя нет username. Откройте Telegram и найдите его по ID, или протестируйте через Mini App.`);
      }
    }
  }, []);

  // Получить имя пользователя
  const getUserName = (user: StoryRequest['user']) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    if (user.firstName) {
      return user.firstName;
    }
    if (user.username) {
      return `@${user.username}`;
    }
    return `User ${user.telegramUserId}`;
  };

  // Форматирование даты
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <main className="min-h-screen p-4">
        <div className="max-w-2xl mx-auto text-center">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-tg-hint">Загрузка...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen p-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center">
            <div className="text-4xl mb-4">❌</div>
            <h1 className="text-xl font-bold mb-2">Ошибка</h1>
            <p className="text-tg-hint mb-4">{error}</p>
            <button
              onClick={() => router.back()}
              className="bg-tg-button text-tg-button-text rounded-lg px-4 py-2"
            >
              Назад
            </button>
          </div>
        </div>
      </main>
    );
  }

  const pendingRequests = requests.filter((r) => r.status === 'PENDING');
  const otherRequests = requests.filter((r) => r.status !== 'PENDING');

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto">
        {/* Заголовок */}
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-tg-link text-sm mb-2 flex items-center gap-1"
          >
            ← Назад
          </button>
          <h1 className="text-2xl font-bold">📺 Заявки на сторис</h1>
          <p className="text-tg-hint text-sm mt-1">
            Модерация публикаций в сторис
          </p>
        </div>

        {/* Статистика */}
        {stats && (
          <div className="grid grid-cols-4 gap-2 mb-6">
            <div className="bg-yellow-500/10 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
              <div className="text-xs text-tg-hint">На проверке</div>
            </div>
            <div className="bg-green-500/10 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
              <div className="text-xs text-tg-hint">Одобрено</div>
            </div>
            <div className="bg-red-500/10 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
              <div className="text-xs text-tg-hint">Отклонено</div>
            </div>
            <div className="bg-tg-secondary rounded-lg p-3 text-center">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-xs text-tg-hint">Всего</div>
            </div>
          </div>
        )}

        {/* Сообщение */}
        <InlineToast message={message} onClose={() => setMessage(null)} />

        {/* Заявки на проверке */}
        {pendingRequests.length > 0 && (
          <div className="mb-6">
            <h2 className="font-medium mb-3 flex items-center gap-2">
              <span className="text-yellow-500">⏳</span>
              На проверке ({pendingRequests.length})
            </h2>
            <div className="space-y-3">
              {pendingRequests.map((req) => (
                <div
                  key={req.id}
                  className="bg-tg-secondary rounded-lg p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="font-medium">{getUserName(req.user)}</div>
                      {req.user.username && (
                        <div className="text-sm text-tg-link">@{req.user.username}</div>
                      )}
                      <div className="text-xs text-tg-hint mt-1">
                        Отправлено: {formatDate(req.submittedAt)}
                      </div>
                    </div>
                    <button
                      onClick={() => openTelegramProfile(req.user.username, req.user.telegramUserId)}
                      className="bg-tg-button text-tg-button-text text-xs rounded-lg px-3 py-1.5"
                    >
                      👤 Профиль
                    </button>
                  </div>
                  
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleApprove(req.id)}
                      disabled={processingId === req.id}
                      className="flex-1 bg-green-500 text-white text-sm rounded-lg py-2 font-medium disabled:opacity-50"
                    >
                      {processingId === req.id ? '⏳' : '✅ Одобрить'}
                    </button>
                    <button
                      onClick={() => handleReject(req.id)}
                      disabled={processingId === req.id}
                      className="flex-1 bg-red-500 text-white text-sm rounded-lg py-2 font-medium disabled:opacity-50"
                    >
                      {processingId === req.id ? '⏳' : '❌ Отклонить'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Обработанные заявки */}
        {otherRequests.length > 0 && (
          <div>
            <h2 className="font-medium mb-3 text-tg-hint">
              История ({otherRequests.length})
            </h2>
            <div className="space-y-2">
              {otherRequests.map((req) => (
                <div
                  key={req.id}
                  className="bg-tg-secondary/50 rounded-lg p-3 flex items-center justify-between"
                >
                  <div>
                    <div className="text-sm">{getUserName(req.user)}</div>
                    <div className="text-xs text-tg-hint">
                      {req.status === 'APPROVED' ? '✅ Одобрено' : '❌ Отклонено'}
                      {req.reviewedAt && ` • ${formatDate(req.reviewedAt)}`}
                    </div>
                    {req.rejectReason && (
                      <div className="text-xs text-red-500 mt-1">
                        Причина: {req.rejectReason}
                      </div>
                    )}
                  </div>
                  <span className={`text-lg ${req.status === 'APPROVED' ? 'text-green-500' : 'text-red-500'}`}>
                    {req.status === 'APPROVED' ? '✅' : '❌'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Нет заявок */}
        {requests.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">📭</div>
            <p className="text-tg-hint">Заявок пока нет</p>
          </div>
        )}
      </div>
    </main>
  );
}
