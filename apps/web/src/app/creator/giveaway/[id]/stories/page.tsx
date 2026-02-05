'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('storiesModeration');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
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
        setError(res.error || tErrors('loadFailed'));
        return;
      }

      setRequests(res.requests || []);
      setStats(res.stats || null);
    } catch (err) {
      console.error('Failed to load story requests:', err);
      setError(tErrors('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [giveawayId, tErrors]);

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
        setMessage(t('approved'));
        await loadRequests();
      } else {
        setMessage(res.error || tErrors('connectionError'));
      }
    } catch (err) {
      console.error('Failed to approve:', err);
      setMessage(t('approveError'));
    } finally {
      setProcessingId(null);
      setTimeout(() => setMessage(null), 3000);
    }
  }, [giveawayId, loadRequests, t, tErrors]);

  // Отклонить заявку
  const handleReject = useCallback(async (requestId: string) => {
    const reason = prompt(t('rejectReasonPrompt'));
    
    setProcessingId(requestId);
    setMessage(null);

    try {
      const res = await rejectStoryRequest(giveawayId, requestId, reason || undefined);
      
      if (res.ok) {
        setMessage(t('rejected'));
        await loadRequests();
      } else {
        setMessage(res.error || tErrors('connectionError'));
      }
    } catch (err) {
      console.error('Failed to reject:', err);
      setMessage(t('rejectError'));
    } finally {
      setProcessingId(null);
      setTimeout(() => setMessage(null), 3000);
    }
  }, [giveawayId, loadRequests, t, tErrors]);

  // Открыть профиль пользователя в Telegram
  const openTelegramProfile = useCallback((username: string | null, telegramUserId: string) => {
    const tgApp = (window as unknown as { Telegram?: { WebApp?: { openTelegramLink?: (url: string) => void } } }).Telegram?.WebApp;
    
    if (username) {
      // Если есть username — открываем через https://t.me/username
      const profileUrl = `https://t.me/${username}`;
      if (tgApp?.openTelegramLink) {
        tgApp.openTelegramLink(profileUrl);
      } else {
        window.open(profileUrl, '_blank');
      }
    } else {
      // Если нет username — используем tg://user?id=
      // Это работает только внутри Telegram
      const tgUserUrl = `tg://user?id=${telegramUserId}`;
      if (tgApp?.openTelegramLink) {
        tgApp.openTelegramLink(tgUserUrl);
      } else {
        // В браузере показываем alert с ID
        alert(t('noUsernameAlert', { id: telegramUserId }));
      }
    }
  }, [t]);

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
          <p className="text-tg-hint">{tCommon('loading')}</p>
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
            <h1 className="text-xl font-bold mb-2">{tCommon('error')}</h1>
            <p className="text-tg-hint mb-4">{error}</p>
            <button
              onClick={() => router.back()}
              className="bg-tg-button text-tg-button-text rounded-lg px-4 py-2"
            >
              {tCommon('back')}
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
            ← {tCommon('back')}
          </button>
          <h1 className="text-2xl font-bold">📺 {t('title')}</h1>
          <p className="text-tg-hint text-sm mt-1">
            {t('subtitle')}
          </p>
        </div>

        {/* Статистика */}
        {stats && (
          <div className="grid grid-cols-4 gap-2 mb-6">
            <div className="bg-yellow-500/10 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
              <div className="text-xs text-tg-hint">{t('stats.pending')}</div>
            </div>
            <div className="bg-green-500/10 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
              <div className="text-xs text-tg-hint">{t('stats.approved')}</div>
            </div>
            <div className="bg-red-500/10 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
              <div className="text-xs text-tg-hint">{t('stats.rejected')}</div>
            </div>
            <div className="bg-tg-secondary rounded-lg p-3 text-center">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-xs text-tg-hint">{t('stats.total')}</div>
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
              {t('pendingSection')} ({pendingRequests.length})
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
                        {t('submitted')}: {formatDate(req.submittedAt)}
                      </div>
                    </div>
                    <button
                      onClick={() => openTelegramProfile(req.user.username, req.user.telegramUserId)}
                      className="bg-tg-button text-tg-button-text text-xs rounded-lg px-3 py-1.5"
                    >
                      👤 {t('profile')}
                    </button>
                  </div>
                  
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleApprove(req.id)}
                      disabled={processingId === req.id}
                      className="flex-1 bg-green-500 text-white text-sm rounded-lg py-2 font-medium disabled:opacity-50"
                    >
                      {processingId === req.id ? '⏳' : `✅ ${t('approve')}`}
                    </button>
                    <button
                      onClick={() => handleReject(req.id)}
                      disabled={processingId === req.id}
                      className="flex-1 bg-red-500 text-white text-sm rounded-lg py-2 font-medium disabled:opacity-50"
                    >
                      {processingId === req.id ? '⏳' : `❌ ${t('reject')}`}
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
              {t('historySection')} ({otherRequests.length})
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
                      {req.status === 'APPROVED' ? `✅ ${t('statusApproved')}` : `❌ ${t('statusRejected')}`}
                      {req.reviewedAt && ` • ${formatDate(req.reviewedAt)}`}
                    </div>
                    {req.rejectReason && (
                      <div className="text-xs text-red-500 mt-1">
                        {t('reason')}: {req.rejectReason}
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
            <p className="text-tg-hint">{t('empty')}</p>
          </div>
        )}
      </div>
    </main>
  );
}
