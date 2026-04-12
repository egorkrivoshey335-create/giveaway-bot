'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { createPayment } from '@/lib/api';
import { AppIcon } from '@/components/AppIcon';
import { Mascot } from '@/components/Mascot';

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
  mascot: 'tier-plus' | 'tier-pro' | 'tier-business';
}

const TIERS: TierConfig[] = [
  {
    key: 'plus',
    productCode: 'SUBSCRIPTION_PLUS',
    color: 'text-blue-600',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    mascot: 'tier-plus',
  },
  {
    key: 'pro',
    productCode: 'SUBSCRIPTION_PRO',
    color: 'text-purple-600',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    mascot: 'tier-pro',
  },
  {
    key: 'business',
    productCode: 'SUBSCRIPTION_BUSINESS',
    color: 'text-amber-600',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    mascot: 'tier-business',
  },
];

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
      <div className="flex items-start gap-3 py-2.5">
        <span className={`mt-0.5 ${included ? '' : 'opacity-40'}`}>
          {included ? (
            <AppIcon name="icon-back" size={16} className="rotate-180 text-green-500" />
          ) : (
            <AppIcon name="icon-lock" size={16} />
          )}
        </span>
        <div className="flex-1 min-w-0">
          <div className={`font-medium text-sm ${included ? 'text-tg-text' : 'text-tg-hint'}`}>
            {t(`${featureKey}.title`)}
          </div>
          <div
            className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
          >
            <div className="overflow-hidden">
              <div className="text-xs text-tg-hint mt-1 leading-relaxed">
                {t(`${featureKey}.description`)}
              </div>
            </div>
          </div>
        </div>
        <AppIcon
          name="icon-back"
          size={14}
          className={`text-tg-hint mt-0.5 transition-transform duration-200 ${expanded ? 'rotate-90' : '-rotate-90'}`}
        />
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
      <div className="flex justify-center mb-1">
        <Mascot type={tier.mascot} size={48} loop autoplay />
      </div>
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
  currentTier?: TierKey | 'free' | null;
  defaultTab?: TabKey;
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
  }, [selectedTierConfig.productCode, t, tErrors]);

  const isCurrent = (tierKey: TierKey) =>
    currentTier === tierKey;

  const isAlreadySubscribed = currentTier === selectedTier;

  const features = activeTab === 'creators' ? CREATOR_FEATURES : PARTICIPANT_FEATURES;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={t('title')}
    >
      <div className="px-4 pb-6 space-y-4">
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

        {/* Features list with smooth transition */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="space-y-0.5 divide-y divide-tg-secondary"
          >
            {features.map(f => (
              <FeatureRow
                key={f}
                featureKey={f}
                namespace={activeTab}
                selectedTier={selectedTier}
              />
            ))}
          </motion.div>
        </AnimatePresence>

        {/* Pricing */}
        <div className={`rounded-xl p-4 ${selectedTierConfig.bgColor} ${selectedTierConfig.borderColor} border`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Mascot type={selectedTierConfig.mascot} size={36} loop autoplay />
              <div>
                <div className={`text-lg font-bold ${selectedTierConfig.color}`}>
                  {t(`tiers.${selectedTier}.name`)}
                </div>
                <div className="text-xs text-tg-hint">
                  {t(`tiers.${selectedTier}.starsPrice`)}
                </div>
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
            <p className="text-sm text-green-600 font-medium flex items-center justify-center gap-1.5">
              <AppIcon name="icon-success" size={16} />
              {t('alreadySubscribed')}
            </p>
          </div>
        ) : (
          <button
            onClick={handlePay}
            disabled={loading}
            className={`catalog-btn relative w-full rounded-2xl py-4 px-5 font-semibold hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2.5 overflow-hidden ${
              loading ? 'opacity-60' : ''
            }`}
          >
            <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 animate-[shimmer_3s_ease-in-out_infinite]" />
            {loading ? (
              <span className="relative z-10 flex items-center gap-2">
                <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                {t('loading')}
              </span>
            ) : (
              <>
                <AppIcon name="icon-diamond" size={20} className="relative z-10 drop-shadow-sm" />
                <span className="relative z-10 text-[15px]">
                  {t('payBtn', { price: t(`tiers.${selectedTier}.price`) })}
                </span>
              </>
            )}
          </button>
        )}

        {/* Security note */}
        <p className="text-xs text-tg-hint text-center">{t('secure')}</p>
      </div>
    </BottomSheet>
  );
}
