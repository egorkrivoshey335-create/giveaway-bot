'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { BottomSheet } from './ui/BottomSheet';
import { getGiveawayStats, type GiveawayStats } from '@/lib/api';

interface StatsBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  giveawayId: string;
}

export function StatsBottomSheet({
  isOpen,
  onClose,
  giveawayId,
}: StatsBottomSheetProps) {
  const t = useTranslations('giveawayDetails');
  const tCommon = useTranslations('common');

  const [stats, setStats] = useState<GiveawayStats | null>(null);
  const [loading, setLoading] = useState(false);
  // TODO: TASKS-6-payments — проверка подписки через entitlements
  // Временно: показываем все статистику без проверки подписки
  const [hasAccess, setHasAccess] = useState(true); // Заглушка

  useEffect(() => {
    if (isOpen && hasAccess) {
      loadStats();
    }
  }, [isOpen, hasAccess]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const res = await getGiveawayStats(giveawayId);
      if (res.ok && res.stats) {
        setStats(res.stats);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={t('stats.title')}>
      {/* TODO: TASKS-6-payments — если нет подписки, показать блюр + предложение */}
      {!hasAccess ? (
        <div className="py-8 text-center animate-fadeIn">
          <div className="text-4xl mb-4 animate-bounce">📊</div>
          <div className="text-lg font-medium mb-2">
            {t('stats.plusRequired')}
          </div>
          <p className="text-tg-hint mb-6">
            {t('stats.plusDescription')}
          </p>
          <button
            onClick={() => {
              // TODO: TASKS-6-payments — открыть страницу подписки
              console.log('Open subscription page');
            }}
            className="bg-tg-button text-tg-button-text rounded-lg px-6 py-3 font-medium transition-all hover:scale-105 active:scale-95"
          >
            {t('stats.upgradeButton')}
          </button>
        </div>
      ) : loading ? (
        <div className="py-8 text-center">
          <div className="inline-block w-12 h-12 border-4 border-tg-button border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-tg-hint">{tCommon('loading')}</p>
        </div>
      ) : stats ? (
        <div className="space-y-6 animate-fadeIn">
          {/* Основная статистика */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: stats.participantsCount, label: t('stats.participants'), subValue: stats.participantsToday > 0 ? `+${stats.participantsToday} ${t('stats.today')}` : undefined },
              { value: stats.ticketsTotal, label: t('stats.tickets') },
              { value: stats.invitesCount, label: t('stats.invites') },
              { value: stats.boostsCount, label: t('stats.boosts') },
            ].map((stat, index) => (
              <div 
                key={index}
                className="bg-tg-secondary rounded-lg p-4 text-center transition-all duration-300 hover:scale-105"
                style={{
                  animation: `slideIn 0.3s ease-out ${index * 0.1}s both`
                }}
              >
                <div className="text-2xl font-bold">{stat.value}</div>
                <div className="text-xs text-tg-hint mt-1">{stat.label}</div>
                {stat.subValue && (
                  <div className="text-xs text-green-500 mt-1">
                    {stat.subValue}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* График роста */}
          {stats.participantsGrowth.length > 0 && (
            <div className="bg-tg-secondary rounded-lg p-4">
              <h3 className="font-medium mb-3">📈 {t('growth.title')}</h3>
              <div className="flex items-end gap-1 h-24">
                {stats.participantsGrowth.map((day, i) => {
                  const maxCount = Math.max(...stats.participantsGrowth.map(d => d.count), 1);
                  const height = (day.count / maxCount) * 100;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center">
                      <div
                        className="w-full bg-tg-button rounded-t"
                        style={{ height: `${Math.max(height, 4)}%` }}
                      />
                      <div className="text-[10px] text-tg-hint mt-1">
                        {new Date(day.date).getDate()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Детали по билетам */}
          {(stats.ticketsFromInvites > 0 || stats.ticketsFromBoosts > 0 || stats.ticketsFromStories > 0) && (
            <div className="bg-tg-secondary rounded-lg p-4">
              <h3 className="font-medium mb-3">{t('stats.ticketsBreakdown')}</h3>
              <div className="space-y-2 text-sm">
                {stats.ticketsFromInvites > 0 && (
                  <div className="flex justify-between">
                    <span className="text-tg-hint">{t('stats.fromInvites')}:</span>
                    <span className="font-medium">{stats.ticketsFromInvites}</span>
                  </div>
                )}
                {stats.ticketsFromBoosts > 0 && (
                  <div className="flex justify-between">
                    <span className="text-tg-hint">{t('stats.fromBoosts')}:</span>
                    <span className="font-medium">{stats.ticketsFromBoosts}</span>
                  </div>
                )}
                {stats.ticketsFromStories > 0 && (
                  <div className="flex justify-between">
                    <span className="text-tg-hint">{t('stats.fromStories')}:</span>
                    <span className="font-medium">{stats.ticketsFromStories}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Сторис */}
          {(stats.storiesApproved > 0 || stats.storiesPending > 0) && (
            <div className="bg-tg-secondary rounded-lg p-4">
              <h3 className="font-medium mb-3">📺 {t('stats.stories')}</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-tg-hint">{t('stats.storiesApproved')}:</span>
                  <span className="font-medium text-green-500">{stats.storiesApproved}</span>
                </div>
                {stats.storiesPending > 0 && (
                  <div className="flex justify-between">
                    <span className="text-tg-hint">{t('stats.storiesPending')}:</span>
                    <span className="font-medium text-yellow-500">{stats.storiesPending}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="py-8 text-center text-tg-hint">
          {t('stats.noData')}
        </div>
      )}
    </BottomSheet>
  );
}
