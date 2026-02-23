'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { createPayment } from '@/lib/api';

// ============================================================================
// Types
// ============================================================================

type TierKey = 'plus' | 'pro' | 'business';
type TabKey = 'creators' | 'participants';

interface TierConfig {
  key: TierKey;
  productCode: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: string;
}

const TIERS: TierConfig[] = [
  {
    key: 'plus',
    productCode: 'SUBSCRIPTION_PLUS',
    color: 'text-blue-600',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    icon: '⭐',
  },
  {
    key: 'pro',
    productCode: 'SUBSCRIPTION_PRO',
    color: 'text-purple-600',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    icon: '🚀',
  },
  {
    key: 'business',
    productCode: 'SUBSCRIPTION_BUSINESS',
    color: 'text-amber-600',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    icon: '💼',
  },
];

// Фичи для каждого таба
const CREATOR_FEATURES = [
  'analytics',
  'mascot',
  'export',
  'liveness',
  'winners',
  'tasks',
] as const;

const PARTICIPANT_FEATURES = [
  'bonus',
  'catalog',
  'noCaptcha',
  'notifications',
] as const;

// Какие тарифы включают каждую фичу
const FEATURE_TIERS: Record<string, TierKey[]> = {
  analytics: ['plus', 'pro', 'business'],
  mascot: ['plus', 'pro', 'business'],
  export: ['plus', 'pro', 'business'],
  liveness: ['pro', 'business'],
  winners: ['plus', 'pro', 'business'],
  tasks: ['plus', 'pro', 'business'],
  bonus: ['plus', 'pro', 'business'],
  catalog: ['plus', 'pro', 'business'],
  noCaptcha: ['plus', 'pro', 'business'],
  notifications: ['plus', 'pro', 'business'],
};

// ============================================================================
// Sub-components
// ============================================================================

function TierBadge({ tier }: { tier: TierConfig }) {
  const t = useTranslations('subscription.tiers');
  return (
    <span
      className={`text-xs font-bold px-2 py-0.5 rounded-full ${tier.bgColor} ${tier.color}`}
    >
      {t(`${tier.key}.badge`)}
    </span>
  );
}

function FeatureRow({
  featureKey,
  namespace,
  selectedTier,
}: {
  featureKey: string;
  namespace: 'creators' | 'participants';
  selectedTier: TierKey;
}) {
  const t = useTranslations(`subscription.${namespace}`);
  const [expanded, setExpanded] = useState(false);
  const tiers = FEATURE_TIERS[featureKey] || [];
  const included = tiers.includes(selectedTier);

  return (
    <button
      className="w-full text-left"
      onClick={() => setExpanded(e => !e)}
    >
      <div className="flex items-start gap-3 py-2">
        <span className={`text-lg mt-0.5 ${included ? '' : 'opacity-40'}`}>
          {included ? '✅' : '🔒'}
        </span>
        <div className="flex-1 min-w-0">
          <div className={`font-medium text-sm ${included ? 'text-tg-text' : 'text-tg-hint'}`}>
            {t(`${featureKey}.title`)}
          </div>
          {expanded && (
            <div className="text-xs text-tg-hint mt-1 leading-relaxed">
              {t(`${featureKey}.description`)}
            </div>
          )}
        </div>
        <span className="text-tg-hint text-xs mt-0.5">{expanded ? '▲' : '▼'}</span>
      </div>
    </button>
  );
}

function TierCard({
  tier,
  isSelected,
  isCurrent,
  onSelect,
}: {
  tier: TierConfig;
  isSelected: boolean;
  isCurrent: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations('subscription');

  return (
    <button
      onClick={onSelect}
      className={`flex-1 rounded-xl p-3 border-2 transition-all text-center ${
        isSelected
          ? `${tier.borderColor} ${tier.bgColor}`
          : 'border-tg-secondary bg-tg-secondary'
      }`}
    >
      <div className="text-xl mb-1">{tier.icon}</div>
      <div className={`font-bold text-sm ${isSelected ? tier.color : 'text-tg-text'}`}>
        {t(`tiers.${tier.key}.name`)}
      </div>
      <div className="text-xs text-tg-hint mt-0.5">
        {t(`tiers.${tier.key}.price`)}
      </div>
      {isCurrent && (
        <div className="mt-1 text-xs text-green-600 font-medium">{t('current')}</div>
      )}
    </button>
  );
}

// ============================================================================
// Main component
// ============================================================================

interface SubscriptionBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Какой тариф сейчас активен у пользователя (чтобы не предлагать его снова) */
  currentTier?: TierKey | 'free' | null;
  /** Начальный выбранный таб */
  defaultTab?: TabKey;
  /** Начальный выбранный тариф */
  defaultTier?: TierKey;
}

export function SubscriptionBottomSheet({
  isOpen,
  onClose,
  currentTier = null,
  defaultTab = 'creators',
  defaultTier = 'plus',
}: SubscriptionBottomSheetProps) {
  const t = useTranslations('subscription');
  const tErrors = useTranslations('errors');

  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab);
  const [selectedTier, setSelectedTier] = useState<TierKey>(defaultTier);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTierConfig = TIERS.find(t => t.key === selectedTier)!;

  const handlePay = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const productCode = selectedTierConfig.productCode;
      const result = await createPayment({ productCode });

      if (result.ok && result.paymentUrl) {
        window.location.href = result.paymentUrl;
      } else {
        setError(result.error || t('error'));
      }
    } catch {
      setError(tErrors('connectionError'));
    } finally {
      setLoading(false);
    }
  }, [selectedTier, selectedTierConfig.productCode, t, tErrors]);

  const isCurrent = (tierKey: TierKey) =>
    currentTier === tierKey;

  const isAlreadySubscribed = currentTier === selectedTier;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={t('title')}
    >
      <div className="space-y-4">
        {/* Subtitle */}
        <p className="text-sm text-tg-hint text-center">{t('subtitle')}</p>

        {/* Tier selector */}
        <div className="flex gap-2">
          {TIERS.map(tier => (
            <TierCard
              key={tier.key}
              tier={tier}
              isSelected={selectedTier === tier.key}
              isCurrent={isCurrent(tier.key)}
              onSelect={() => setSelectedTier(tier.key)}
            />
          ))}
        </div>

        {/* Tab selector */}
        <div className="flex bg-tg-secondary rounded-xl p-1">
          {(['creators', 'participants'] as TabKey[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-tg-bg text-tg-text shadow-sm'
                  : 'text-tg-hint'
              }`}
            >
              {t(`tabs.${tab}`)}
            </button>
          ))}
        </div>

        {/* Features list */}
        <div className="space-y-0.5 divide-y divide-tg-secondary">
          {activeTab === 'creators'
            ? CREATOR_FEATURES.map(f => (
                <FeatureRow
                  key={f}
                  featureKey={f}
                  namespace="creators"
                  selectedTier={selectedTier}
                />
              ))
            : PARTICIPANT_FEATURES.map(f => (
                <FeatureRow
                  key={f}
                  featureKey={f}
                  namespace="participants"
                  selectedTier={selectedTier}
                />
              ))}
        </div>

        {/* Pricing */}
        <div className={`rounded-xl p-4 ${selectedTierConfig.bgColor} ${selectedTierConfig.borderColor} border`}>
          <div className="flex items-center justify-between">
            <div>
              <div className={`text-lg font-bold ${selectedTierConfig.color}`}>
                {selectedTierConfig.icon} {t(`tiers.${selectedTier}.name`)}
              </div>
              <div className="text-xs text-tg-hint">
                {t(`tiers.${selectedTier}.starsPrice`)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-tg-text">
                {t(`tiers.${selectedTier}.price`).split('/')[0]}
              </div>
              <div className="text-xs text-tg-hint">{t('perMonth')}</div>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-center">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        {/* Pay button */}
        {isAlreadySubscribed ? (
          <div className="w-full bg-green-500/10 border border-green-500/30 rounded-xl py-3 text-center">
            <p className="text-sm text-green-600 font-medium">✅ {t('alreadySubscribed')}</p>
          </div>
        ) : (
          <button
            onClick={handlePay}
            disabled={loading}
            className={`w-full rounded-xl py-3.5 px-4 font-semibold text-white transition-all ${
              loading ? 'opacity-60' : 'active:scale-95'
            } ${
              selectedTier === 'plus'
                ? 'bg-blue-500'
                : selectedTier === 'pro'
                ? 'bg-purple-500'
                : 'bg-amber-500'
            }`}
          >
            {loading
              ? t('loading')
              : t('payBtn', { price: t(`tiers.${selectedTier}.price`) })}
          </button>
        )}

        {/* Security note */}
        <p className="text-xs text-tg-hint text-center">{t('secure')}</p>
      </div>
    </BottomSheet>
  );
}
