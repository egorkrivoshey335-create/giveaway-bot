'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  getChannels,
  getChannelAvatarUrl,
  deleteChannel,
  recheckChannel,
  Channel,
} from '@/lib/api';
import { InlineToast } from '@/components/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import { AppIcon } from '@/components/AppIcon';
import { Mascot } from '@/components/Mascot';
import { SubscriptionBottomSheet } from '@/components/SubscriptionBottomSheet';
import { TIER_LIMITS } from '@randombeast/shared';
// Типы Telegram WebApp загружаются из @/types/telegram.d.ts

// Берём username бота из env
const BOT_USERNAME = process.env.NEXT_PUBLIC_BOT_USERNAME || 'BeastRandomBot';

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
function EmptyState({ onAddChannel, t }: { onAddChannel: () => void; t: ReturnType<typeof useTranslations<'channels'>> }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <div className="flex justify-center mb-2"><Mascot type="state-empty" size={120} loop autoplay /></div>
      <h3 className="text-xl font-semibold text-tg-text mb-2">
        {t('empty.title')}
      </h3>
      <p className="text-tg-hint mb-6 max-w-sm">
        {t('empty.subtitle')}
      </p>
      <button
        onClick={onAddChannel}
        className="px-6 py-3 bg-tg-button text-tg-button-text rounded-xl font-medium hover:opacity-90 transition-opacity"
      >
        {t('empty.addFirst')}
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
  t,
}: {
  channel: Channel;
  onRecheck: (id: string) => void;
  onDelete: (id: string) => void;
  isRechecking: boolean;
  t: ReturnType<typeof useTranslations<'channels'>>;
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
        <div className="w-12 h-12 rounded-full overflow-hidden bg-tg-bg flex-shrink-0 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getChannelAvatarUrl(channel.id)}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const parent = e.currentTarget.parentElement;
              if (parent && !parent.querySelector('.avatar-fallback')) {
                const fallback = document.createElement('div');
                fallback.className = 'avatar-fallback w-full h-full flex items-center justify-center';
                fallback.innerHTML = channel.type === 'CHANNEL'
                  ? '<img src="/icons/brand/icon-channel.webp" width="20" height="20" alt="" />'
                  : '<img src="/icons/brand/icon-group.webp" width="20" height="20" alt="" />';
                parent.appendChild(fallback);
              }
            }}
          />
        </div>
        
        {/* Детали */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-tg-text font-medium truncate">
              {channel.title}
            </h4>
            <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium ${
              channel.type === 'CHANNEL'
                ? 'bg-blue-500/10 text-blue-500'
                : 'bg-violet-500/10 text-violet-500'
            }`}>
              {channel.type === 'CHANNEL' ? t('channel') : t('group')}
            </span>
          </div>
          {channel.username ? (
            <button
              onClick={openChannel}
              className="text-tg-link text-sm hover:underline"
            >
              @{channel.username}
            </button>
          ) : (
            <span className="text-tg-hint text-sm">{t('private')}</span>
          )}
          <div className="text-tg-hint text-xs mt-0.5">
            {channel.memberCount && `${channel.memberCount.toLocaleString()} ${t('members')}`}
          </div>
        </div>
      </div>

      {/* Статусы */}
      <div className="flex flex-wrap gap-3 mb-3">
        <div className={`flex items-center gap-1 text-sm ${channel.botIsAdmin ? 'text-green-500' : 'text-red-500'}`}>
          {channel.botIsAdmin ? <AppIcon name="icon-success" size={14} /> : <AppIcon name="icon-error" size={14} />} {t('botAdmin')}
        </div>
        <div className={`flex items-center gap-1 text-sm ${channel.creatorIsAdmin ? 'text-green-500' : 'text-red-500'}`}>
          {channel.creatorIsAdmin ? <AppIcon name="icon-success" size={14} /> : <AppIcon name="icon-error" size={14} />} {t('youAdmin')}
        </div>
      </div>

      {/* Последняя проверка */}
      {channel.lastCheckedAt && (
        <div className="text-tg-hint text-xs mb-3">
          {t('lastChecked')}: {formatDate(channel.lastCheckedAt)}
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
          title={t('recheck')}
        >
          {isRechecking ? '⏳' : <AppIcon name="icon-refresh" size={14} />} {t('recheckShort')}
        </button>
        <AnimatePresence mode="wait">
          <motion.button
            key={showDeleteConfirm ? 'confirm' : 'delete'}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            onClick={handleDelete}
            className={`px-3 py-2 text-sm rounded-lg transition-colors ${
              showDeleteConfirm
                ? 'bg-red-500 text-white'
                : 'bg-tg-bg text-red-500 hover:bg-red-50'
            }`}
            title={t('delete')}
          >
            <AppIcon name="icon-delete" size={14} /> {showDeleteConfirm ? t('deleteConfirm') : t('deleteShort')}
          </motion.button>
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function ChannelsPage() {
  const router = useRouter();
  const t = useTranslations('channels');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [recheckingId, setRecheckingId] = useState<string | null>(null);
  const [userTier, setUserTier] = useState<'FREE' | 'PLUS' | 'PRO' | 'BUSINESS'>('FREE');
  const [showSubscription, setShowSubscription] = useState(false);
  const [showAddConfirm, setShowAddConfirm] = useState(false);

  useEffect(() => {
    fetch('/api/users/me/entitlements', { credentials: 'include' })
      .then(r => r.json())
      .then((data: { ok?: boolean; data?: { tier?: string } }) => {
        const tier = data?.data?.tier as typeof userTier;
        if (tier) setUserTier(tier);
      })
      .catch(() => {});
  }, []);

  // Загрузка каналов
  const loadChannels = useCallback(async () => {
    try {
      const res = await getChannels();
      if (res.ok && res.channels) {
        setChannels(res.channels);
      } else {
        setError(res.error || tErrors('loadFailed'));
      }
    } catch (err) {
      setError(tErrors('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [tErrors]);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  // Показать popup подтверждения перехода к боту
  const openBotAddChannel = () => {
    setShowAddConfirm(true);
  };

  // Подтверждение — переход к боту
  const confirmGoToBot = () => {
    setShowAddConfirm(false);
    const botUrl = `https://t.me/${BOT_USERNAME}?start=add_channel`;
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.openTelegramLink(botUrl);
      tg.close();
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
        setMessage(t('statusUpdated'));
        setTimeout(() => setMessage(null), 2000);
      } else {
        setMessage(res.error || tErrors('error'));
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (err) {
      setMessage(tErrors('connectionError'));
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
        setMessage(t('deleted'));
        setTimeout(() => setMessage(null), 2000);
      } else {
        setMessage(res.error || tErrors('error'));
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (err) {
      setMessage(tErrors('connectionError'));
      setTimeout(() => setMessage(null), 3000);
    }
  };

  // Вернуться назад
  const goBack = () => {
    router.push('/creator');
  };

  return (
    <div className="min-h-screen bg-tg-bg">
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            className="flex items-center justify-center min-h-screen"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            layout
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94], layout: { duration: 0.35 } }}
          >
            <div className="text-tg-hint">{tCommon('loading')}</div>
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            layout
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94], layout: { duration: 0.35 } }}
          >
      {/* Header */}
      <header className="sticky top-0 z-10 bg-tg-bg border-b border-tg-secondary">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={goBack}
            className="flex items-center gap-1 text-tg-link text-sm hover:opacity-70"
          >
            <AppIcon name="icon-back" size={16} /> {tCommon('back')}
          </button>
          <h1 className="text-lg font-semibold text-tg-text flex-1">
            {t('title')}
          </h1>
        </div>
      </header>

      <div className="max-w-xl mx-auto p-4">
        {/* Уведомление */}
        <InlineToast message={message} onClose={() => setMessage(null)} />

        {/* Секция добавления */}
        {(() => {
          const maxChannels = TIER_LIMITS.maxChannels[userTier];
          const limitReached = channels.length >= maxChannels;
          return (
            <div className="bg-tg-secondary rounded-xl p-4 mb-6">
              <h3 className="text-tg-text font-medium mb-2">{t('addTitle')}</h3>
              <p className="text-tg-hint text-sm mb-2">
                {t('addDescription')}
              </p>
              <p className="text-xs text-tg-hint mb-4">
                {`${channels.length} / ${maxChannels === Infinity ? '∞' : maxChannels} (${userTier})`}
              </p>
              {limitReached ? (
                <>
                  <p className="text-xs text-orange-500 mb-3">
                    <AppIcon name="icon-warning" size={12} className="inline mr-1" />
                    {`Достигнут лимит каналов: ${maxChannels}`}
                  </p>
                  <button
                    onClick={() => setShowSubscription(true)}
                    className="w-full px-4 py-3 bg-tg-button text-tg-button-text rounded-xl font-medium hover:opacity-90 transition-opacity"
                  >
                    Повысить подписку
                  </button>
                </>
              ) : (
                <button
                  onClick={openBotAddChannel}
                  className="w-full px-4 py-3 bg-tg-button text-tg-button-text rounded-xl font-medium hover:opacity-90 transition-opacity"
                >
                  {t('add')}
                </button>
              )}
            </div>
          );
        })()}

        {/* Ошибка */}
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-4 text-center">
            {error}
            <button
              onClick={loadChannels}
              className="block w-full mt-2 text-sm text-red-500 underline"
            >
              {tCommon('tryAgain')}
            </button>
          </div>
        )}

        {/* Список каналов */}
        {channels.length === 0 ? (
          <EmptyState onAddChannel={openBotAddChannel} t={t} />
        ) : (
          <div>
            <h3 className="text-tg-hint text-sm mb-3">
              {t('count', { count: channels.length })}
            </h3>
            {channels.map(channel => (
              <ChannelCard
                key={channel.id}
                channel={channel}
                onRecheck={handleRecheck}
                onDelete={handleDelete}
                isRechecking={recheckingId === channel.id}
                t={t}
              />
            ))}
          </div>
        )}
      </div>
          </motion.div>
        )}
      </AnimatePresence>

      <SubscriptionBottomSheet
        isOpen={showSubscription}
        onClose={() => setShowSubscription(false)}
        currentTier={userTier === 'FREE' ? 'free' : userTier.toLowerCase() as 'plus' | 'pro' | 'business'}
      />

      {/* Popup подтверждения перехода к боту */}
      <AnimatePresence>
        {showAddConfirm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/50 z-50"
              onClick={() => setShowAddConfirm(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-tg-bg rounded-2xl p-6 max-w-sm mx-auto shadow-xl"
            >
              <div className="text-center mb-4">
                <AppIcon name="icon-add-channel" size={40} className="mx-auto mb-3" />
                <h3 className="text-lg font-semibold mb-2">{t('addTitle')}</h3>
                <p className="text-tg-hint text-sm">
                  {t('addPopupDescription')}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={confirmGoToBot}
                  className="w-full py-3 bg-tg-button text-tg-button-text rounded-xl font-medium hover:opacity-90 transition-opacity"
                >
                  {t('goToBot')}
                </button>
                <button
                  onClick={() => setShowAddConfirm(false)}
                  className="w-full py-3 bg-tg-secondary text-tg-text rounded-xl font-medium hover:bg-tg-secondary/80 transition-colors"
                >
                  {tCommon('cancel')}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
