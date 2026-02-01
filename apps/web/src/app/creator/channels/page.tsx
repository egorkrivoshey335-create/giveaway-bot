'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  getChannels,
  deleteChannel,
  recheckChannel,
  Channel,
} from '@/lib/api';
import { InlineToast } from '@/components/Toast';

// Объявляем тип для Telegram WebApp
declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        openTelegramLink: (url: string) => void;
      };
    };
  }
}

// Форматирование даты
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'только что';
  if (diffMins < 60) return `${diffMins} мин. назад`;
  if (diffHours < 24) return `${diffHours} ч. назад`;
  if (diffDays < 7) return `${diffDays} дн. назад`;

  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });
}

// Компонент пустого состояния
function EmptyState({ onAddChannel }: { onAddChannel: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="text-6xl mb-4">📣</div>
      <h3 className="text-xl font-semibold text-tg-text mb-2">
        Каналы не добавлены
      </h3>
      <p className="text-tg-hint mb-6 max-w-sm">
        Добавьте каналы, чтобы публиковать в них розыгрыши 
        и проверять подписку участников.
      </p>
      <button
        onClick={onAddChannel}
        className="px-6 py-3 bg-tg-button text-tg-button-text rounded-xl font-medium hover:opacity-90 transition-opacity"
      >
        ➕ Добавить первый канал
      </button>
    </div>
  );
}

// Компонент карточки канала
function ChannelCard({
  channel,
  onRecheck,
  onDelete,
  isRechecking,
}: {
  channel: Channel;
  onRecheck: (id: string) => void;
  onDelete: (id: string) => void;
  isRechecking: boolean;
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = () => {
    if (showDeleteConfirm) {
      onDelete(channel.id);
      setShowDeleteConfirm(false);
    } else {
      setShowDeleteConfirm(true);
      // Автоматически скрываем через 3 сек
      setTimeout(() => setShowDeleteConfirm(false), 3000);
    }
  };

  const openChannel = () => {
    if (channel.username) {
      const url = `https://t.me/${channel.username.replace('@', '')}`;
      const tg = window.Telegram?.WebApp;
      if (tg) {
        tg.openTelegramLink(url);
      } else {
        window.open(url, '_blank');
      }
    }
  };

  return (
    <div className="bg-tg-secondary rounded-xl p-4 mb-3">
      {/* Информация о канале */}
      <div className="flex gap-3 mb-3">
        {/* Аватар */}
        <div 
          className="w-12 h-12 rounded-full flex items-center justify-center text-2xl flex-shrink-0"
          style={{ backgroundColor: 'var(--brand-color, #f2b6b6)' }}
        >
          {channel.type === 'CHANNEL' ? '📢' : '👥'}
        </div>
        
        {/* Детали */}
        <div className="flex-1 min-w-0">
          <h4 className="text-tg-text font-medium truncate">
            {channel.title}
          </h4>
          {channel.username ? (
            <button
              onClick={openChannel}
              className="text-tg-link text-sm hover:underline"
            >
              @{channel.username}
            </button>
          ) : (
            <span className="text-tg-hint text-sm">Приватный</span>
          )}
          <div className="text-tg-hint text-xs mt-0.5">
            {channel.type === 'CHANNEL' ? 'Канал' : 'Группа'}
            {channel.memberCount && ` · ${channel.memberCount.toLocaleString('ru-RU')} подписчиков`}
          </div>
        </div>
      </div>

      {/* Статусы */}
      <div className="flex flex-wrap gap-3 mb-3">
        <div className={`flex items-center gap-1 text-sm ${channel.botIsAdmin ? 'text-green-500' : 'text-red-500'}`}>
          {channel.botIsAdmin ? '✅' : '❌'} Бот админ
        </div>
        <div className={`flex items-center gap-1 text-sm ${channel.creatorIsAdmin ? 'text-green-500' : 'text-red-500'}`}>
          {channel.creatorIsAdmin ? '✅' : '❌'} Вы админ
        </div>
      </div>

      {/* Последняя проверка */}
      {channel.lastCheckedAt && (
        <div className="text-tg-hint text-xs mb-3">
          Проверено: {formatDate(channel.lastCheckedAt)}
        </div>
      )}

      {/* Действия */}
      <div className="flex gap-2 justify-end pt-2 border-t border-tg-bg">
        <button
          onClick={() => onRecheck(channel.id)}
          disabled={isRechecking}
          className={`px-3 py-2 text-sm rounded-lg transition-colors ${
            isRechecking 
              ? 'bg-tg-bg text-tg-hint cursor-not-allowed' 
              : 'bg-tg-bg text-tg-text hover:bg-tg-bg/70'
          }`}
          title="Перепроверить статус"
        >
          {isRechecking ? '⏳' : '🔄'} Проверить
        </button>
        <button
          onClick={handleDelete}
          className={`px-3 py-2 text-sm rounded-lg transition-colors ${
            showDeleteConfirm
              ? 'bg-red-500 text-white'
              : 'bg-tg-bg text-red-500 hover:bg-red-50'
          }`}
          title="Удалить"
        >
          🗑️ {showDeleteConfirm ? 'Точно удалить?' : 'Удалить'}
        </button>
      </div>
    </div>
  );
}

export default function ChannelsPage() {
  const router = useRouter();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [recheckingId, setRecheckingId] = useState<string | null>(null);

  // Загрузка каналов
  const loadChannels = useCallback(async () => {
    try {
      const res = await getChannels();
      if (res.ok && res.channels) {
        setChannels(res.channels);
      } else {
        setError(res.error || 'Не удалось загрузить каналы');
      }
    } catch (err) {
      setError('Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  // Открыть бота для добавления канала
  const openBotAddChannel = () => {
    const botUrl = 'https://t.me/BeastRandomBot?start=add_channel';
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.openTelegramLink(botUrl);
    } else {
      window.open(botUrl, '_blank');
    }
  };

  // Перепроверить статус канала
  const handleRecheck = async (id: string) => {
    setRecheckingId(id);
    try {
      const res = await recheckChannel(id);
      if (res.ok && res.channel) {
        setChannels(prev => prev.map(ch => 
          ch.id === id ? res.channel! : ch
        ));
        setMessage('✅ Статус обновлён');
        setTimeout(() => setMessage(null), 2000);
      } else {
        setMessage('❌ ' + (res.error || 'Ошибка проверки'));
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (err) {
      setMessage('❌ Ошибка соединения');
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setRecheckingId(null);
    }
  };

  // Удалить канал
  const handleDelete = async (id: string) => {
    try {
      const res = await deleteChannel(id);
      if (res.ok) {
        setChannels(prev => prev.filter(ch => ch.id !== id));
        setMessage('✅ Канал удалён');
        setTimeout(() => setMessage(null), 2000);
      } else {
        setMessage('❌ ' + (res.error || 'Ошибка удаления'));
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (err) {
      setMessage('❌ Ошибка соединения');
      setTimeout(() => setMessage(null), 3000);
    }
  };

  // Вернуться назад
  const goBack = () => {
    router.push('/creator');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-tg-bg flex items-center justify-center">
        <div className="text-tg-hint">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-tg-bg">

      {/* Header */}
      <header className="sticky top-0 z-10 bg-tg-bg border-b border-tg-secondary">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={goBack}
            className="text-tg-link text-sm hover:opacity-70"
          >
            ← Назад
          </button>
          <h1 className="text-lg font-semibold text-tg-text flex-1">
            📣 Мои каналы
          </h1>
        </div>
      </header>

      <div className="max-w-xl mx-auto p-4">
        {/* Уведомление */}
        <InlineToast message={message} onClose={() => setMessage(null)} />

        {/* Секция добавления */}
        <div className="bg-tg-secondary rounded-xl p-4 mb-6">
          <h3 className="text-tg-text font-medium mb-2">Добавить канал</h3>
          <p className="text-tg-hint text-sm mb-4">
            Чтобы добавить канал, перейдите в бота и следуйте инструкциям.
            Бот должен быть админом канала с правами на публикацию.
          </p>
          <button
            onClick={openBotAddChannel}
            className="w-full px-4 py-3 bg-tg-button text-tg-button-text rounded-xl font-medium hover:opacity-90 transition-opacity"
          >
            ➕ Добавить канал
          </button>
        </div>

        {/* Ошибка */}
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-4 text-center">
            {error}
            <button
              onClick={loadChannels}
              className="block w-full mt-2 text-sm text-red-500 underline"
            >
              Попробовать снова
            </button>
          </div>
        )}

        {/* Список каналов */}
        {channels.length === 0 ? (
          <EmptyState onAddChannel={openBotAddChannel} />
        ) : (
          <div>
            <h3 className="text-tg-hint text-sm mb-3">
              Добавлено каналов: {channels.length}
            </h3>
            {channels.map(channel => (
              <ChannelCard
                key={channel.id}
                channel={channel}
                onRecheck={handleRecheck}
                onDelete={handleDelete}
                isRechecking={recheckingId === channel.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
