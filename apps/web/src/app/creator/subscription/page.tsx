'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  getCurrentSubscription,
  cancelSubscription,
  getPaymentHistory,
  type PaymentHistoryItem,
} from '@/lib/api';
import { SubscriptionBottomSheet } from '@/components/SubscriptionBottomSheet';
import { haptic } from '@/lib/haptic';
import { motion, AnimatePresence } from 'framer-motion';
import { AppIcon } from '@/components/AppIcon';

// ============================================================================
// Types
// ============================================================================

type TierKey = 'plus' | 'pro' | 'business' | 'free';

const TIER_PRIORITY: Record<string, number> = {
  'tier.business': 4,
  'tier.pro': 3,
  'tier.plus': 2,
  'tier.free': 1,
};

const ENTITLEMENT_TO_TIER: Record<string, TierKey> = {
  'tier.business': 'business',
  'tier.pro': 'pro',
  'tier.plus': 'plus',
};

const TIER_ICONS: Record<TierKey, React.ReactNode> = {
  plus: <AppIcon name="icon-star" size={14} />,
  pro: <AppIcon name="icon-boost" size={14} />,
  business: <AppIcon name="icon-crown" size={14} />,
  free: null,
};

const TIER_COLORS: Record<TierKey, string> = {
  plus: 'text-blue-500',
  pro: 'text-purple-500',
  business: 'text-amber-500',
  free: 'text-tg-hint',
};

const TIER_BG: Record<TierKey, string> = {
  plus: 'bg-blue-500/10 border-blue-500/30',
  pro: 'bg-purple-500/10 border-purple-500/30',
  business: 'bg-amber-500/10 border-amber-500/30',
  free: 'bg-tg-secondary border-tg-secondary',
};

// Лимиты тарифов
const TIER_LIMITS: Record<TierKey, { maxWinners: number; maxInvites: number; maxGiveaways: number }> = {
  plus: { maxWinners: 50, maxInvites: 5, maxGiveaways: 5 },
  pro: { maxWinners: 100, maxInvites: 10, maxGiveaways: 20 },
  business: { maxWinners: 200, maxInvites: 20, maxGiveaways: -1 },
  free: { maxWinners: 3, maxInvites: 3, maxGiveaways: 1 },
};

// ============================================================================
// Sub-components
// ============================================================================

function StatusBadge({ status }: { status: PaymentHistoryItem['status'] }) {
  const t = useTranslations('creatorSubscription');
  const styles: Record<string, string> = {
    COMPLETED: 'bg-green-500/10 text-green-600',
    PENDING: 'bg-yellow-500/10 text-yellow-600',
    FAILED: 'bg-red-500/10 text-red-500',
    REFUNDED: 'bg-gray-500/10 text-tg-hint',
  };
  const labels: Record<string, string> = {
    COMPLETED: t('statusCompleted'),
    PENDING: t('statusPending'),
    FAILED: t('statusFailed'),
    REFUNDED: t('statusRefunded'),
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status] || ''}`}>
      {labels[status] || status}
    </span>
  );
}

function PaymentHistoryRow({ item }: { item: PaymentHistoryItem }) {
  const t = useTranslations('creatorSubscription');
  const date = item.paidAt
    ? new Date(item.paidAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
    : new Date(item.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-tg-text truncate">{item.productTitle}</p>
        <p className="text-xs text-tg-hint">{date}</p>
      </div>
      <div className="flex items-center gap-2 ml-2">
        <StatusBadge status={item.status} />
        {item.status === 'COMPLETED' && (
          <span className="text-sm font-semibold text-tg-text">
            {t('amount', { amount: (item.amount / 100).toFixed(0) })}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main page
// ============================================================================

export default function CreatorSubscriptionPage() {
  const t = useTranslations('creatorSubscription');
  const router = useRouter();

  const [currentTier, setCurrentTier] = useState<TierKey>('free');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [autoRenew, setAutoRenew] = useState(false);
  const [history, setHistory] = useState<PaymentHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [showSubscriptionSheet, setShowSubscriptionSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sub, hist] = await Promise.all([
        getCurrentSubscription(),
        getPaymentHistory(),
      ]);

      if (sub.ok && sub.tier && sub.tier !== 'FREE') {
        const tierKey = sub.tier.toLowerCase() as TierKey;
        setCurrentTier(tierKey);
        setExpiresAt(sub.expiresAt || null);
        setAutoRenew(sub.autoRenew || false);
      } else {
        setCurrentTier('free');
      }

      if (hist.ok && hist.items) {
        setHistory(hist.items);
      }
    } catch {
      setError('Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCancel = useCallback(async () => {
    setCancelLoading(true);
    setError(null);
    try {
      const result = await cancelSubscription();
      if (result.ok) {
        haptic('success');
        setAutoRenew(false);
        setShowConfirmCancel(false);
        await loadData();
      } else {
        setError(result.error || 'Ошибка отмены подписки');
        haptic('error');
      }
    } catch {
      setError('Ошибка отмены подписки');
    } finally {
      setCancelLoading(false);
    }
  }, [loadData]);

  const limits = TIER_LIMITS[currentTier];
  const expiryDate = expiresAt
    ? new Date(expiresAt).toLocaleDateString('ru-RU', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : null;

  return (
    <div className="min-h-screen bg-tg-bg pb-8">
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
            <div className="animate-pulse text-4xl"><AppIcon name="icon-star" size={14} /></div>
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
      <div className="sticky top-0 z-10 bg-tg-bg border-b border-tg-secondary">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-lg hover:bg-tg-secondary transition-colors"
          >
            <AppIcon name="icon-back" size={20} />
          </button>
          <h1 className="text-lg font-bold text-tg-text">{t('title')}</h1>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 space-y-4 mt-4">
        {/* Current plan card */}
        <div className={`rounded-2xl p-5 border ${TIER_BG[currentTier]}`}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-tg-hint uppercase tracking-wide font-medium mb-1">
                {t('currentPlan')}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{TIER_ICONS[currentTier]}</span>
                <span className={`text-2xl font-bold ${TIER_COLORS[currentTier]}`}>
                  {currentTier === 'free' ? t('free') : currentTier.toUpperCase()}
                </span>
              </div>
            </div>
            {currentTier !== 'free' && (
              <div className="text-right">
                <div className="text-xs text-tg-hint">{t('autoRenew')}</div>
                <div className={`text-sm font-medium ${autoRenew ? 'text-green-600' : 'text-tg-hint'}`}>
                  {autoRenew ? t('autoRenewOn') : t('autoRenewOff')}
                </div>
              </div>
            )}
          </div>

          {expiryDate && (
            <p className="text-sm text-tg-hint">
              {t('activeTill', { date: expiryDate })}
            </p>
          )}
        </div>

        {/* Plan limits */}
        <div className="bg-tg-secondary rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-tg-text mb-3">{t('tierLimits.title')}</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-tg-hint"><AppIcon name="icon-winner" size={14} /> {t('tierLimits.maxWinners', { count: limits.maxWinners })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-tg-hint"><AppIcon name="icon-channel" size={14} /> {t('tierLimits.maxInvites', { count: limits.maxInvites })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-tg-hint">
                <AppIcon name="icon-giveaway" size={16} /> {t('tierLimits.maxGiveaways', {
                  count: limits.maxGiveaways === -1 ? '∞' : limits.maxGiveaways,
                })}
              </span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="space-y-2">
          <button
            onClick={() => setShowSubscriptionSheet(true)}
            className="w-full bg-tg-button text-tg-button-text rounded-xl py-3.5 px-4 font-semibold text-sm active:scale-95 transition-transform"
          >
            {currentTier === 'free' ? t('upgradePlan') : t('changePlan')} <AppIcon name="icon-star" size={14} />
          </button>

          {currentTier !== 'free' && !showConfirmCancel && (
            <button
              onClick={() => setShowConfirmCancel(true)}
              className="w-full border border-tg-secondary text-red-500 rounded-xl py-3 px-4 text-sm font-medium active:scale-95 transition-transform"
            >
              {t('cancelSubscription')}
            </button>
          )}

          {showConfirmCancel && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 space-y-3">
              <p className="text-sm text-tg-text text-center">{t('cancelConfirm')}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowConfirmCancel(false)}
                  className="flex-1 border border-tg-secondary rounded-lg py-2 text-sm text-tg-hint"
                >
                  Нет
                </button>
                <button
                  onClick={handleCancel}
                  disabled={cancelLoading}
                  className="flex-1 bg-red-500 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-60"
                >
                  {cancelLoading ? '...' : 'Да, отменить'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-center">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        {/* Payment history */}
        <div>
          <h3 className="text-base font-bold text-tg-text mb-2">{t('history')}</h3>
          {history.length === 0 ? (
            <p className="text-sm text-tg-hint text-center py-6">{t('noHistory')}</p>
          ) : (
            <div className="bg-tg-secondary rounded-2xl px-4 divide-y divide-tg-secondary">
              {history.map(item => (
                <PaymentHistoryRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Subscription BottomSheet */}
      <SubscriptionBottomSheet
        isOpen={showSubscriptionSheet}
        onClose={() => setShowSubscriptionSheet(false)}
        currentTier={currentTier === 'free' ? null : currentTier}
      />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
