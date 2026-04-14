'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import {
  getDraft,
  createDraft,
  updateDraft,
  discardDraft,
  getChannels,
  getPostTemplates,
  confirmGiveaway,
  Draft,
  Channel,
  PostTemplate,
  GiveawayDraftPayload,
  getChannelAvatarUrl,
} from '@/lib/api';
import { DateTimePicker } from '@/components/DateTimePicker';
import { PostsManager } from '@/components/PostsManager';
import { Mascot } from '@/components/Mascot';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ValidationMessage, useURLValidation } from '@/components/ui/ValidationMessage';
import { AppIcon } from '@/components/AppIcon';
import { hapticNavigation, hapticSuccess, hapticError, hapticToggle, hapticSelect } from '@/lib/haptic';
import { TIER_LIMITS } from '@randombeast/shared';
import { SubscriptionBottomSheet } from '@/components/SubscriptionBottomSheet';

const BOT_USERNAME = process.env.NEXT_PUBLIC_BOT_USERNAME || 'BeastRandomBot';

// Шаги wizard'а
const WIZARD_STEPS = ['TYPE', 'BASICS', 'SUBSCRIPTIONS', 'PUBLISH', 'RESULTS', 'DATES', 'WINNERS', 'PROTECTION', 'EXTRAS', 'MASCOT', 'CUSTOM_TASKS', 'REVIEW'] as const;
type WizardStep = (typeof WIZARD_STEPS)[number];



/**
 * Форматирует Date в строку для datetime-local input (локальное время)
 */
function toLocalDateTimeString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Форматирует ISO строку в формат для datetime-local input (локальное время)
 */
function formatDateTimeLocal(isoString: string): string {
  try {
    const date = new Date(isoString);
    // Используем локальное время, а не UTC
    return toLocalDateTimeString(date);
  } catch {
    return '';
  }
}

/**
 * Возвращает минимальную дату начала (сейчас + 5 минут)
 */
function getMinStartDateTime(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 5);
  return toLocalDateTimeString(now);
}

/**
 * Возвращает минимальную дату окончания (startAt + 1 час или сейчас + 1 час)
 */
function getMinEndDateTime(startAt: string | null | undefined): string {
  const base = startAt ? new Date(startAt) : new Date();
  base.setHours(base.getHours() + 1);
  return toLocalDateTimeString(base);
}

/**
 * Форматирует дату для отображения (DD.MM.YYYY, HH:mm)
 */
function formatDisplayDate(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export default function GiveawayWizardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // ?draft=<id> — загружаем конкретный черновик (после дублирования)
  const draftIdParam = searchParams.get('draft');
  const t = useTranslations('wizard');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [draft, setDraft] = useState<Draft | null>(null);
  const [payload, setPayload] = useState<GiveawayDraftPayload>({});
  const [currentStep, setCurrentStep] = useState<WizardStep>('TYPE');
  const [confirmedGiveawayId, setConfirmedGiveawayId] = useState<string | null>(null);
  
  const [channels, setChannels] = useState<Channel[]>([]);
  const [postTemplates, setPostTemplates] = useState<PostTemplate[]>([]);
  const [showPostsManager, setShowPostsManager] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // 14.2 Draft resume modal: показывается когда обнаружен существующий черновик
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [existingDraftId, setExistingDraftId] = useState<string | null>(null);
  
  // Subscription tier (fetched from API)
  const [userTier, setUserTier] = useState<'FREE' | 'PLUS' | 'PRO' | 'BUSINESS'>('FREE');

  useEffect(() => {
    fetch('/api/users/me/entitlements', { credentials: 'include' })
      .then(r => r.json())
      .then((d: { data?: { tier?: string } }) => {
        const tier = d?.data?.tier as string;
        if (tier && ['PLUS', 'PRO', 'BUSINESS'].includes(tier)) {
          setUserTier(tier as 'PLUS' | 'PRO' | 'BUSINESS');
        }
      })
      .catch(() => {});
  }, []);

  const userHasPremium = userTier !== 'FREE';
  const [showSubscription, setShowSubscription] = useState(false);
  const nextTier = userTier === 'FREE' ? 'plus' : userTier === 'PLUS' ? 'pro' : userTier === 'PRO' ? 'business' : 'business';
  const nextTierLabel = nextTier.toUpperCase();

  const subscriptionChannelLimit = TIER_LIMITS.maxChannelsPerGiveaway[userTier];
  const winnerLimit = TIER_LIMITS.maxWinners[userTier];
  const inviteLimit = TIER_LIMITS.maxInvites[userTier];
  const customTaskLimit = TIER_LIMITS.maxCustomTasks[userTier];
  const minParticipantsLimit = TIER_LIMITS.maxMinParticipants[userTier];
  const boostChannelLimit = TIER_LIMITS.maxBoostChannels[userTier];

  useEffect(() => {
    if (payload.inviteMax && payload.inviteMax > inviteLimit) {
      updatePayload({ inviteMax: inviteLimit });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteLimit]);

  // Set default minParticipants to tier limit when tier loads (if not already set from draft)
  useEffect(() => {
    if (payload.minParticipants == null || payload.minParticipants === 0) {
      const limit = TIER_LIMITS.maxMinParticipants[userTier];
      if (limit !== Infinity) {
        updatePayload({ minParticipants: limit });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userTier]);

  // Helper: валидация URL
  const isValidURL = (url: string): boolean => {
    if (!url) return true; // empty is valid
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };
  
  // Debounce save
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load draft and reference data
  useEffect(() => {
    async function loadData() {
      try {
        // Load channels and posts in parallel
        const [channelsRes, postsRes] = await Promise.all([
          getChannels(),
          getPostTemplates(),
        ]);

        if (channelsRes.ok && channelsRes.channels) {
          setChannels(channelsRes.channels);
        }
        if (postsRes.ok && postsRes.templates) {
          setPostTemplates(postsRes.templates);
        }

        // Load or create draft.
        // getDraft() возвращает последний DRAFT (по updatedAt desc).
        // После дублирования новый DRAFT будет самым свежим, поэтому getDraft вернёт его.
        const existingDraftRes = await getDraft();

        // Показываем модалку "Продолжить/Начать заново" только если:
        // - нет явного ?draft= (не пришли из дублирования)
        // - черновик реально был изменён (draftVersion > 1)
        const hasExistingDraft =
          !draftIdParam &&
          existingDraftRes.ok &&
          existingDraftRes.draft &&
          existingDraftRes.draft.draftVersion > 1;

        if (hasExistingDraft && existingDraftRes.draft) {
          setExistingDraftId(existingDraftRes.draft.id);
          setShowDraftModal(true);
          setLoading(false);
          return; // Ждём выбора пользователя
        }

        let draftRes = existingDraftRes;
        if (!draftRes.ok || !draftRes.draft) {
          draftRes = await createDraft('TYPE');
        }

        if (draftRes.ok && draftRes.draft) {
          setDraft(draftRes.draft);
          const draftPayload = (draftRes.draft.draftPayload || {}) as GiveawayDraftPayload;
          
          // Set defaults for required fields if not present
          const payloadWithDefaults: GiveawayDraftPayload = {
            language: 'ru',
            buttonText: tCommon('participate'),
            winnersCount: 1,
            publishResultsMode: 'SEPARATE_POSTS',
            captchaMode: 'SUSPICIOUS_ONLY',
            livenessEnabled: false,
            inviteEnabled: false,
            inviteMax: 3,
            boostEnabled: false,
            boostChannelIds: [],
            storiesEnabled: false,
            catalogEnabled: false,
            ...draftPayload,
          };
          setPayload(payloadWithDefaults);
          
          // Restore wizard step
          const step = draftRes.draft.wizardStep as WizardStep;
          if (step && WIZARD_STEPS.includes(step)) {
            setCurrentStep(step);
          }
          
          // Save defaults if they were missing (new draft)
          const needsDefaultsSave = !draftPayload.language || !draftPayload.buttonText;
          if (needsDefaultsSave) {
            // Save defaults immediately
            updateDraft(draftRes.draft.id, step || 'TYPE', payloadWithDefaults).catch(console.error);
          }
        }
      } catch (err) {
        console.error('Failed to load data:', err);
        setError(tErrors('loadFailed'));
      } finally {
        setLoading(false);
      }
    }

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tErrors]);

  // 14.2 Draft modal: "Продолжить" — восстанавливаем черновик
  const handleResumeDraft = useCallback(async () => {
    if (!existingDraftId) return;
    setShowDraftModal(false);
    setLoading(true);
    try {
      const draftRes = await getDraft();
      if (draftRes.ok && draftRes.draft) {
        setDraft(draftRes.draft);
        const draftPayload = (draftRes.draft.draftPayload || {}) as GiveawayDraftPayload;
        const payloadWithDefaults: GiveawayDraftPayload = {
          language: 'ru',
          buttonText: tCommon('participate'),
          winnersCount: 1,
          publishResultsMode: 'SEPARATE_POSTS',
          captchaMode: 'SUSPICIOUS_ONLY',
          livenessEnabled: false,
          inviteEnabled: false,
          inviteMax: 3,
          boostEnabled: false,
          boostChannelIds: [],
          storiesEnabled: false,
          catalogEnabled: false,
          ...draftPayload,
        };
        setPayload(payloadWithDefaults);
        const step = draftRes.draft.wizardStep as WizardStep;
        if (step && WIZARD_STEPS.includes(step)) {
          setCurrentStep(step);
        }
      }
    } catch (err) {
      console.error('Failed to resume draft:', err);
    } finally {
      setLoading(false);
    }
  }, [existingDraftId, tCommon]);

  // 14.2 Draft modal: "Начать заново" — отменяем черновик и создаём новый
  const handleDiscardAndNew = useCallback(async () => {
    if (!existingDraftId) return;
    setShowDraftModal(false);
    setLoading(true);
    try {
      await discardDraft(existingDraftId);
      const newDraftRes = await createDraft('TYPE');
      if (newDraftRes.ok && newDraftRes.draft) {
        setDraft(newDraftRes.draft);
        const defaults: GiveawayDraftPayload = {
          language: 'ru',
          buttonText: tCommon('participate'),
          winnersCount: 1,
          publishResultsMode: 'SEPARATE_POSTS',
          captchaMode: 'SUSPICIOUS_ONLY',
          livenessEnabled: false,
          inviteEnabled: false,
          inviteMax: 3,
          boostEnabled: false,
          boostChannelIds: [],
          storiesEnabled: false,
          catalogEnabled: false,
        };
        setPayload(defaults);
        setCurrentStep('TYPE');
      }
    } catch (err) {
      console.error('Failed to discard draft:', err);
    } finally {
      setLoading(false);
    }
  }, [existingDraftId, tCommon]);

  // Save draft with debounce
  const saveDraft = useCallback(async (newPayload: GiveawayDraftPayload, step: WizardStep, immediate = false) => {
    if (!draft) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    const doSave = async () => {
      setSaving(true);
      try {
        const result = await updateDraft(draft.id, step, newPayload);
        if (result.ok && result.draft) {
          setDraft(result.draft);
        }
      } catch (err) {
        console.error('Failed to save draft:', err);
      } finally {
        setSaving(false);
      }
    };

    if (immediate) {
      await doSave();
    } else {
      saveTimeoutRef.current = setTimeout(doSave, 400);
    }
  }, [draft]);

  // Update payload field
  const updatePayload = useCallback((updates: Partial<GiveawayDraftPayload>) => {
    setPayload(prev => {
      const newPayload = { ...prev, ...updates };
      saveDraft(newPayload, currentStep);
      return newPayload;
    });
  }, [currentStep, saveDraft]);

  // Navigate to step
  const goToStep = useCallback(async (step: WizardStep) => {
    await saveDraft(payload, step, true);
    setCurrentStep(step);
  }, [payload, saveDraft]);

  const visibleSteps = useMemo(() => {
    return WIZARD_STEPS.filter((step) => {
      // CUSTOM_TASKS: only for CUSTOM and MAXIMUM
      if (step === 'CUSTOM_TASKS' && payload.type !== 'CUSTOM' && payload.type !== 'MAXIMUM') return false;
      // EXTRAS: hidden for STANDARD and CUSTOM (they don't need bonus tickets)
      if (step === 'EXTRAS' && (payload.type === 'STANDARD' || payload.type === 'CUSTOM')) return false;
      return true;
    });
  }, [payload.type]);

  // Navigate next/prev
  const currentStepIndex = visibleSteps.indexOf(currentStep);
  
  const goNext = useCallback(async () => {
    if (currentStepIndex < visibleSteps.length - 1) {
      const nextStep = visibleSteps[currentStepIndex + 1];
      hapticNavigation();
      await goToStep(nextStep);
    }
  }, [currentStepIndex, goToStep, visibleSteps]);

  const goPrev = useCallback(async () => {
    if (currentStepIndex > 0) {
      const prevStep = visibleSteps[currentStepIndex - 1];
      hapticNavigation();
      await goToStep(prevStep);
    }
  }, [currentStepIndex, goToStep, visibleSteps]);

  // Confirm giveaway
  const handleConfirm = useCallback(async () => {
    if (!draft) return;
    
    setConfirming(true);
    setError(null);
    
    try {
      const result = await confirmGiveaway(draft.id);
      
      if (result.ok && result.giveawayId) {
        // Store confirmed giveaway ID to show success screen
        hapticSuccess(); // Haptic feedback при успехе
        setConfirmedGiveawayId(result.giveawayId);
      } else {
        // Build error message with details if available
        hapticError(); // Haptic feedback при ошибке
        let errorMsg = result.error || tErrors('confirmFailed');
        if (result.details && result.details.length > 0) {
          errorMsg = result.details.map(d => `• ${d.message}`).join('\n');
        }
        setError(errorMsg);
      }
    } catch (err) {
      hapticError(); // Haptic feedback при ошибке
      setError(err instanceof Error ? err.message : tErrors('confirmError'));
    } finally {
      setConfirming(false);
    }
  }, [draft, tErrors]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Show success screen after confirmation
  if (confirmedGiveawayId) {
    const botLink = `https://t.me/${BOT_USERNAME}?start=confirm_${confirmedGiveawayId}`;
    
    return (
      <main className="min-h-screen p-4 flex items-center justify-center">
        <div className="max-w-md w-full text-center">
          <div className="flex justify-center mb-2">
            <Mascot type="state-success" size={150} loop={false} autoplay />
          </div>
          <h1 className="text-2xl font-bold mb-2">{t('success.title')}</h1>
          <p className="text-tg-hint mb-6">
            {t('success.description')}
          </p>
          
          <button
            onClick={() => {
              const tg = window.Telegram?.WebApp;
              if (tg) {
                tg.openTelegramLink(botLink);
                setTimeout(() => tg.close(), 300);
              } else {
                window.open(botLink, '_blank');
              }
            }}
            className="block w-full bg-tg-button text-tg-button-text rounded-lg py-4 font-medium text-lg mb-4"
          >
            <AppIcon name="icon-shield" size={16} /> {t('success.openBot')}
          </button>
          
          <button
            onClick={() => router.push('/')}
            className="text-tg-hint text-sm underline"
          >
            {t('success.backToMenu')}
          </button>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-tg-button border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-tg-hint">{tCommon('loading')}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.push('/')}
            className="text-tg-hint text-sm"
          >
            <AppIcon name="icon-back" size={16} /> {t('header.backToMenu')}
          </button>
          <h1 className="text-lg font-semibold"><AppIcon name="icon-giveaway" size={16} /> {t('header.title')}</h1>
          <span className="text-xs text-tg-hint">
            <span className="inline-flex items-center justify-center w-5 h-5">
              <AnimatePresence mode="wait">
                <motion.span
                  key={saving ? 'saving' : 'saved'}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                >
                  {saving ? <AppIcon name="icon-save" size={14} /> : <AppIcon name="icon-success" size={14} />}
                </motion.span>
              </AnimatePresence>
            </span>
          </span>
        </div>

        {/* Progress */}
        <div className="flex gap-1 mb-6">
          {visibleSteps.map((step, i) => (
            <button
              key={step}
              onClick={() => goToStep(step)}
              className={`flex-1 h-1.5 rounded-full transition-colors ${
                i <= currentStepIndex ? 'bg-tg-button' : 'bg-tg-secondary'
              }`}
              title={t(`steps.${step}`)}
            />
          ))}
        </div>

        {/* Step Label */}
        <div className="text-center mb-6">
          <span className="text-xs text-tg-hint">
            {t('step', { current: currentStepIndex + 1, total: visibleSteps.length })}
          </span>
          <h2 className="text-xl font-semibold mt-1">{t(`steps.${currentStep}`)}</h2>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4 text-red-500 text-sm whitespace-pre-wrap">
            {error}
          </div>
        )}

        {/* Step Content */}
        <div className="bg-tg-secondary rounded-xl p-4 mb-6">
          <AnimatePresence mode="wait">
          {/* Step 1: Type */}
          {currentStep === 'TYPE' && (
            <motion.div
              key="TYPE"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="space-y-4"
            >
              {/* Mascot */}
              <div className="flex justify-center mb-4">
                <Mascot type="wizard-type" size={160} loop={true} autoplay={true} />
              </div>

              <div className="space-y-3">
              {(['STANDARD', 'BOOST_REQUIRED', 'INVITE_REQUIRED', 'CUSTOM', 'MAXIMUM'] as const).map((typeValue) => {
                const typeMascots: Record<string, string> = {
                  STANDARD: 'wizard-promotion',
                  BOOST_REQUIRED: 'wizard-boost',
                  INVITE_REQUIRED: 'wizard-invite',
                  CUSTOM: 'wizard-stories',
                  MAXIMUM: 'wizard-maximum',
                };
                return (
                  <button
                    key={typeValue}
                    onClick={() => updatePayload({ type: typeValue as GiveawayDraftPayload['type'] })}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-colors flex items-center gap-4 ${
                      payload.type === typeValue
                        ? 'border-tg-button bg-tg-button/10'
                        : 'border-transparent bg-tg-bg'
                    }`}
                  >
                    <div className="flex-shrink-0">
                      <Mascot type={typeMascots[typeValue]} size={50} loop autoplay />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{t(`types.${typeValue}.label`)}</div>
                      <div className="text-sm text-tg-hint mt-1">{t(`types.${typeValue}.desc`)}</div>
                    </div>
                  </button>
                );
              })}
              </div>
            </motion.div>
          )}

          {/* Step 2: Basics */}
          {currentStep === 'BASICS' && (
            <motion.div
              key="BASICS"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="space-y-4"
            >
              {/* Mascot */}
              <div className="flex justify-center mb-4">
                <Mascot type="wizard-settings" size={160} loop={true} autoplay={true} />
              </div>

              <div>
                <label className="block text-sm text-tg-hint mb-1"><AppIcon name="icon-giveaway" size={14} /> {t('basics.title')} *</label>
                <input
                  type="text"
                  value={payload.title || ''}
                  onChange={(e) => updatePayload({ title: e.target.value })}
                  placeholder={t('basics.titlePlaceholder')}
                  className="w-full bg-tg-bg rounded-lg px-4 py-3 text-tg-text placeholder:text-tg-hint/50"
                />
              </div>

              <div>
                <label className="block text-sm text-tg-hint mb-1"><AppIcon name="icon-language" size={14} /> {t('basics.language')}</label>
                <select
                  value={payload.language || 'ru'}
                  onChange={(e) => updatePayload({ language: e.target.value as 'ru' | 'en' | 'kk' })}
                  className="w-full bg-tg-bg rounded-lg px-4 py-3 text-tg-text"
                >
                  <option value="ru">🇷🇺 Русский</option>
                  <option value="en">🇬🇧 English</option>
                  <option value="kk">🇰🇿 Қазақша</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-tg-hint mb-1"><AppIcon name="icon-info" size={14} /> {t('basics.postTemplate')} *</label>
                <button
                  type="button"
                  onClick={() => setShowPostsManager(true)}
                  className="w-full bg-tg-bg rounded-lg px-4 py-3 text-left flex items-center justify-between hover:bg-tg-secondary/50 transition-colors"
                >
                  <span className="text-tg-text">
                    {payload.postTemplateId ? (
                      (() => {
                        const selectedPost = postTemplates.find(p => p.id === payload.postTemplateId);
                        return selectedPost ? (
                          <>
                            {selectedPost.mediaType !== 'NONE' ? (selectedPost.mediaType === 'PHOTO' ? <><AppIcon name="icon-camera" size={14} />{' '}</> : <><AppIcon name="icon-view" size={14} />{' '}</>) : <><AppIcon name="icon-edit" size={14} />{' '}</>}
                            {selectedPost.text.slice(0, 50)}...
                          </>
                        ) : t('basics.selectTemplate');
                      })()
                    ) : (
                      <span className="text-tg-hint/70">{t('basics.selectTemplate')}</span>
                    )}
                  </span>
                  <svg className="w-5 h-5 text-tg-hint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {postTemplates.length === 0 && (
                  <p className="text-xs text-tg-hint mt-1">
                    {t('basics.noTemplates')}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm text-tg-hint mb-1"><AppIcon name="icon-info" size={14} /> {t('basics.buttonText')} *</label>
                <input
                  type="text"
                  value={payload.buttonText || ''}
                  onChange={(e) => updatePayload({ buttonText: e.target.value })}
                  placeholder={t('basics.buttonPlaceholder')}
                  className="w-full bg-tg-bg rounded-lg px-4 py-3 text-tg-text placeholder:text-tg-hint/50"
                />
                {/* Пресеты текста кнопки */}
                <div className="flex flex-wrap gap-2 mt-2">
                  {(t.raw('basics.buttonPresets') as string[]).map((preset: string) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => updatePayload({ buttonText: preset })}
                      className={`text-xs px-3 py-1 rounded-full transition-colors ${
                        payload.buttonText === preset
                          ? 'bg-tg-button text-tg-button-text'
                          : 'bg-tg-bg text-tg-hint hover:text-tg-text'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Описание приза (опционально) */}
              <div>
                <label className="block text-sm text-tg-hint mb-1"><AppIcon name="icon-giveaway" size={14} /> {t('basics.prizeDescription')}</label>
                <textarea
                  value={payload.prizeDescription || ''}
                  onChange={(e) => updatePayload({ prizeDescription: e.target.value })}
                  placeholder={t('basics.prizeDescriptionPlaceholder')}
                  maxLength={500}
                  rows={3}
                  className="w-full bg-tg-bg rounded-lg px-4 py-3 text-tg-text placeholder:text-tg-hint/50 resize-none"
                />
                <p className="text-xs text-tg-hint mt-1">
                  {(payload.prizeDescription || '').length} / 500 {t('basics.characters')}
                </p>
              </div>

              {/* Способ получения приза */}
              <div>
                <label className="block text-sm text-tg-hint mb-1"><AppIcon name="icon-giveaway" size={14} /> {t('basics.prizeDeliveryMethod')}</label>
                <select
                  value={payload.prizeDeliveryMethod || 'CONTACT_ORGANIZER'}
                  onChange={(e) => updatePayload({ prizeDeliveryMethod: e.target.value as 'CONTACT_ORGANIZER' | 'INSTRUCTION' | 'FORM' })}
                  className="w-full bg-tg-bg rounded-lg px-4 py-3 text-tg-text"
                >
                  <option value="CONTACT_ORGANIZER">{t('basics.deliveryContact')}</option>
                  <option value="INSTRUCTION">{t('basics.deliveryInstruction')}</option>
                  <option value="FORM">{t('basics.deliveryForm')}</option>
                </select>

                {/* Если выбрана инструкция — добавить поле для текста инструкции */}
                {payload.prizeDeliveryMethod === 'INSTRUCTION' && (
                  <textarea
                    value={payload.prizeInstruction || ''}
                    onChange={(e) => updatePayload({ prizeInstruction: e.target.value })}
                    placeholder={t('basics.prizeInstructionPlaceholder')}
                    maxLength={1000}
                    rows={4}
                    className="w-full bg-tg-bg rounded-lg px-4 py-3 text-tg-text placeholder:text-tg-hint/50 resize-none mt-2"
                  />
                )}
              </div>
            </motion.div>
          )}

          {/* Step 3: Subscriptions */}
          {currentStep === 'SUBSCRIPTIONS' && (
            <motion.div
              key="SUBSCRIPTIONS"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {/* Mascot */}
              <div className="flex justify-center mb-4">
                <Mascot type="wizard-channels" size={160} loop={true} autoplay={true} />
              </div>

              <p className="text-sm text-tg-hint mb-4">
                <AppIcon name="icon-channel" size={14} /> {t('subscriptions.description')}
              </p>

              {/* Subscription channel limit banner */}
              <div className="mb-4 bg-tg-bg rounded-lg p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-tg-hint"><AppIcon name="icon-diamond" size={14} /> {t('subscriptions.channelLimit')}:</span>
                  <span className="font-medium text-tg-button">
                    {(payload.requiredSubscriptionChannelIds || []).length} / {subscriptionChannelLimit === Infinity ? '∞' : subscriptionChannelLimit}
                  </span>
                </div>
                {(payload.requiredSubscriptionChannelIds || []).length >= subscriptionChannelLimit && subscriptionChannelLimit !== Infinity && (
                  <p className="text-xs text-yellow-600 mt-1">
                    <AppIcon name="icon-warning" size={14} /> {t('subscriptions.limitReached')}
                  </p>
                )}
                {userTier === 'FREE' && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    <span className="text-[10px] bg-gray-500/20 text-gray-500 px-1.5 py-0.5 rounded">FREE: 1</span>
                    <span className="text-[10px] bg-blue-500/20 text-blue-600 px-1.5 py-0.5 rounded">PLUS: 3</span>
                    <span className="text-[10px] bg-purple-500/20 text-purple-600 px-1.5 py-0.5 rounded">PRO: 5</span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-600 px-1.5 py-0.5 rounded">BUSINESS: ∞</span>
                  </div>
                )}
              </div>

              {!userHasPremium && (
                <button
                  onClick={() => setShowSubscription(true)}
                  className="relative w-full rounded-xl py-3 px-4 font-medium hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white overflow-hidden text-sm mb-4"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 animate-[shimmer-delayed_5s_ease-in-out_2.5s_infinite]" />
                  <AppIcon name="icon-diamond" size={16} className="relative z-10" />
                  <span className="relative z-10">{t('protection.upgradeTo')} {nextTierLabel}</span>
                </button>
              )}

              {channels.length === 0 ? (
                <p className="text-center text-tg-hint py-8">
                  <AppIcon name="icon-channel" size={14} /> {t('subscriptions.noChannels')}
                </p>
              ) : (
                <div className="space-y-2">
                  {channels.map((channel) => {
                    const isSelected = (payload.requiredSubscriptionChannelIds || []).includes(channel.id);
                    return (
                      <button
                        key={channel.id}
                        onClick={() => {
                          const current = payload.requiredSubscriptionChannelIds || [];
                          const updated = isSelected
                            ? current.filter(id => id !== channel.id)
                            : [...current, channel.id];
                          updatePayload({ requiredSubscriptionChannelIds: updated });
                        }}
                        className={`w-full text-left p-3 rounded-lg flex items-center gap-3 ${
                          isSelected ? 'bg-tg-button/10 border border-tg-button' : 'bg-tg-bg'
                        }`}
                      >
                        <span className={`w-5 h-5 rounded flex items-center justify-center text-xs ${
                          isSelected ? 'bg-tg-button text-tg-button-text' : 'bg-tg-secondary'
                        }`}>
                          {isSelected ? <AppIcon name="icon-success" size={14} /> : ''}
                        </span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={getChannelAvatarUrl(channel.id)}
                          alt=""
                          className="w-10 h-10 rounded-full flex-shrink-0 bg-tg-secondary object-cover"
                          onError={(e) => { e.currentTarget.src = `/icons/brand/${channel.type === 'CHANNEL' ? 'icon-channel' : 'icon-group'}.webp`; }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{channel.title}</span>
                            <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              channel.type === 'CHANNEL' ? 'bg-blue-500/10 text-blue-500' : 'bg-violet-500/10 text-violet-500'
                            }`}>
                              {channel.type === 'CHANNEL' ? t('subscriptions.channelBadge') : t('subscriptions.groupBadge')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {channel.username && (
                              <span className="text-xs text-tg-hint">@{channel.username}</span>
                            )}
                            {channel.memberCount != null && channel.memberCount > 0 && (
                              <span className="text-xs text-tg-hint">· {channel.memberCount.toLocaleString()} {t('subscriptions.subscribers')}</span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* Step 4: Publish Channels */}
          {currentStep === 'PUBLISH' && (
            <motion.div
              key="PUBLISH"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {/* Mascot */}
              <div className="flex justify-center mb-4">
                <Mascot type="wizard-publish" size={160} loop={true} autoplay={true} />
              </div>

              <p className="text-sm text-tg-hint mb-4">
                <AppIcon name="icon-channel" size={14} /> {t('publish.description')}
              </p>

              {/* Publish channel limit banner */}
              <div className="mb-4 bg-tg-bg rounded-lg p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-tg-hint"><AppIcon name="icon-diamond" size={14} /> {t('publish.channelLimit')}:</span>
                  <span className="font-medium text-tg-button">
                    {(payload.publishChannelIds || []).length} / {subscriptionChannelLimit === Infinity ? '∞' : subscriptionChannelLimit}
                  </span>
                </div>
                {(payload.publishChannelIds || []).length >= subscriptionChannelLimit && subscriptionChannelLimit !== Infinity && (
                  <p className="text-xs text-yellow-600 mt-1">
                    <AppIcon name="icon-warning" size={14} /> {t('publish.limitReached')}
                  </p>
                )}
                {userTier === 'FREE' && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    <span className="text-[10px] bg-gray-500/20 text-gray-500 px-1.5 py-0.5 rounded">FREE: 1</span>
                    <span className="text-[10px] bg-blue-500/20 text-blue-600 px-1.5 py-0.5 rounded">PLUS: 3</span>
                    <span className="text-[10px] bg-purple-500/20 text-purple-600 px-1.5 py-0.5 rounded">PRO: 5</span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-600 px-1.5 py-0.5 rounded">BUSINESS: ∞</span>
                  </div>
                )}
              </div>

              {channels.length === 0 ? (
                <p className="text-center text-tg-hint py-8">
                  <AppIcon name="icon-channel" size={14} /> {t('publish.noChannels')}
                </p>
              ) : (
                <div className="space-y-2">
                  {channels.filter(c => c.botIsAdmin).map((channel) => {
                    const isSelected = (payload.publishChannelIds || []).includes(channel.id);
                    return (
                      <button
                        key={channel.id}
                        onClick={() => {
                          const current = payload.publishChannelIds || [];
                          const updated = isSelected
                            ? current.filter(id => id !== channel.id)
                            : [...current, channel.id];
                          updatePayload({ publishChannelIds: updated });
                        }}
                        className={`w-full text-left p-3 rounded-lg flex items-center gap-3 ${
                          isSelected ? 'bg-tg-button/10 border border-tg-button' : 'bg-tg-bg'
                        }`}
                      >
                        <span className={`w-5 h-5 rounded flex items-center justify-center text-xs ${
                          isSelected ? 'bg-tg-button text-tg-button-text' : 'bg-tg-secondary'
                        }`}>
                          {isSelected ? <AppIcon name="icon-success" size={14} /> : ''}
                        </span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={getChannelAvatarUrl(channel.id)}
                          alt=""
                          className="w-10 h-10 rounded-full flex-shrink-0 bg-tg-secondary object-cover"
                          onError={(e) => { e.currentTarget.src = `/icons/brand/${channel.type === 'CHANNEL' ? 'icon-channel' : 'icon-group'}.webp`; }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{channel.title}</span>
                            <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              channel.type === 'CHANNEL' ? 'bg-blue-500/10 text-blue-500' : 'bg-violet-500/10 text-violet-500'
                            }`}>
                              {channel.type === 'CHANNEL' ? t('subscriptions.channelBadge') : t('subscriptions.groupBadge')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {channel.username && (
                              <span className="text-xs text-tg-hint">@{channel.username}</span>
                            )}
                            {channel.memberCount != null && channel.memberCount > 0 && (
                              <span className="text-xs text-tg-hint">· {channel.memberCount.toLocaleString()} {t('subscriptions.subscribers')}</span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {channels.filter(c => c.botIsAdmin).length === 0 && (
                    <p className="text-center text-tg-hint py-4">
                      {t('publish.noBotAdmin')}
                    </p>
                  )}
                </div>
              )}

              {!userHasPremium && (
                <button
                  onClick={() => setShowSubscription(true)}
                  className="relative w-full rounded-xl py-3 px-4 font-medium hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white overflow-hidden text-sm mt-4"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 animate-[shimmer-delayed_5s_ease-in-out_2.5s_infinite]" />
                  <AppIcon name="icon-diamond" size={16} className="relative z-10" />
                  <span className="relative z-10">{t('protection.upgradeTo')} {nextTierLabel}</span>
                </button>
              )}
            </motion.div>
          )}

          {/* Step 5: Results */}
          {currentStep === 'RESULTS' && (
            <motion.div
              key="RESULTS"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {/* Mascot */}
              <div className="flex justify-center mb-4">
                <Mascot type="wizard-results" size={160} loop={true} autoplay={true} />
              </div>

              <p className="text-sm text-tg-hint mb-4">
                {t('resultsStep.description')}
              </p>
              
              <div className="space-y-2 mb-6">
                {channels.filter(c => c.botIsAdmin).map((channel) => {
                  const isSelected = (payload.resultsChannelIds || []).includes(channel.id);
                  return (
                    <button
                      key={channel.id}
                      onClick={() => {
                        const current = payload.resultsChannelIds || [];
                        const updated = isSelected
                          ? current.filter(id => id !== channel.id)
                          : [...current, channel.id];
                        updatePayload({ resultsChannelIds: updated });
                      }}
                      className={`w-full text-left p-3 rounded-lg flex items-center gap-3 ${
                        isSelected ? 'bg-tg-button/10 border border-tg-button' : 'bg-tg-bg'
                      }`}
                    >
                      <span className={`w-5 h-5 rounded flex items-center justify-center text-xs ${
                        isSelected ? 'bg-tg-button text-tg-button-text' : 'bg-tg-secondary'
                      }`}>
                        {isSelected ? <AppIcon name="icon-success" size={14} /> : ''}
                      </span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getChannelAvatarUrl(channel.id)}
                        alt=""
                        className="w-10 h-10 rounded-full flex-shrink-0 bg-tg-secondary object-cover"
                        onError={(e) => { e.currentTarget.src = `/icons/brand/${channel.type === 'CHANNEL' ? 'icon-channel' : 'icon-group'}.webp`; }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{channel.title}</span>
                          <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            channel.type === 'CHANNEL' ? 'bg-blue-500/10 text-blue-500' : 'bg-violet-500/10 text-violet-500'
                          }`}>
                            {channel.type === 'CHANNEL' ? t('subscriptions.channelBadge') : t('subscriptions.groupBadge')}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="border-t border-tg-bg pt-4">
                <label className="block text-sm text-tg-hint mb-3">{t('resultsStep.publishModeLabel')}</label>
                <div className="space-y-2">
                  <button
                    onClick={() => updatePayload({ publishResultsMode: 'SEPARATE_POSTS' })}
                    className={`w-full text-left p-3 rounded-lg flex items-center gap-3 ${
                      (payload.publishResultsMode || 'SEPARATE_POSTS') === 'SEPARATE_POSTS'
                        ? 'bg-tg-button/10 border border-tg-button'
                        : 'bg-tg-bg'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                      (payload.publishResultsMode || 'SEPARATE_POSTS') === 'SEPARATE_POSTS'
                        ? 'bg-tg-button text-tg-button-text'
                        : 'bg-tg-secondary'
                    }`}>
                      {(payload.publishResultsMode || 'SEPARATE_POSTS') === 'SEPARATE_POSTS' ? '●' : ''}
                    </span>
                    <div>
                      <div className="font-medium"><AppIcon name="icon-winner" size={14} /> {t('resultsStep.separatePosts')}</div>
                      <div className="text-xs text-tg-hint">{t('resultsStep.separatePostsHint')}</div>
                    </div>
                  </button>
                  <button
                    onClick={() => updatePayload({ publishResultsMode: 'EDIT_START_POST' })}
                    className={`w-full text-left p-3 rounded-lg flex items-center gap-3 ${
                      payload.publishResultsMode === 'EDIT_START_POST'
                        ? 'bg-tg-button/10 border border-tg-button'
                        : 'bg-tg-bg'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                      payload.publishResultsMode === 'EDIT_START_POST'
                        ? 'bg-tg-button text-tg-button-text'
                        : 'bg-tg-secondary'
                    }`}>
                      {payload.publishResultsMode === 'EDIT_START_POST' ? '●' : ''}
                    </span>
                    <div>
                      <div className="font-medium"><AppIcon name="icon-winner" size={14} /> {t('resultsStep.editStartPost')}</div>
                      <div className="text-xs text-tg-hint">{t('resultsStep.editStartPostHint')}</div>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      if (userTier === 'BUSINESS') {
                        updatePayload({ publishResultsMode: 'RANDOMIZER' });
                      } else {
                        setShowSubscription(true);
                      }
                    }}
                    className={`w-full text-left p-3 rounded-lg flex items-center gap-3 ${
                      payload.publishResultsMode === 'RANDOMIZER'
                        ? 'bg-tg-button/10 border border-tg-button'
                        : userTier !== 'BUSINESS' ? 'bg-tg-bg opacity-60' : 'bg-tg-bg'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                      payload.publishResultsMode === 'RANDOMIZER'
                        ? 'bg-tg-button text-tg-button-text'
                        : 'bg-tg-secondary'
                    }`}>
                      {payload.publishResultsMode === 'RANDOMIZER' ? '●' : ''}
                    </span>
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        <AppIcon name="icon-winner" size={14} /> {t('resultsStep.randomizer')}
                        <span className="text-xs bg-amber-500/20 text-amber-600 px-2 py-0.5 rounded">BUSINESS</span>
                      </div>
                      <div className="text-xs text-tg-hint">{t('resultsStep.randomizerHint')}</div>
                    </div>
                  </button>
                </div>

                {userTier !== 'BUSINESS' && (
                  <button
                    onClick={() => setShowSubscription(true)}
                    className="relative w-full rounded-xl py-3 px-4 font-medium hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white overflow-hidden text-sm mt-4"
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 animate-[shimmer-delayed_5s_ease-in-out_2.5s_infinite]" />
                    <AppIcon name="icon-diamond" size={16} className="relative z-10" />
                    <span className="relative z-10">{t('protection.upgradeTo')} BUSINESS</span>
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {/* Шаг 6: Даты */}
          {currentStep === 'DATES' && (
            <motion.div
              key="DATES"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="space-y-4"
            >
              {/* Mascot */}
              <div className="flex justify-center mb-4">
                <Mascot type="wizard-calendar" size={200} loop={true} autoplay={true} />
              </div>

              {/* Тумблер "Начать сразу" */}
              <div className="flex items-center justify-between p-3 bg-tg-bg rounded-lg">
                <div>
                  <div className="font-medium">{t('dates.startNow')}</div>
                  <div className="text-xs text-tg-hint">{t('dates.startNowHint')}</div>
                </div>
                <button
                  onClick={() => {
                    if (payload.startAt) {
                      // Включаем "Начать сразу" — убираем дату
                      updatePayload({ startAt: null });
                    } else {
                      // Выключаем "Начать сразу" — ставим дату через 10 минут от текущего момента
                      const d = new Date();
                      d.setMinutes(d.getMinutes() + 10);
                      updatePayload({ startAt: d.toISOString() });
                    }
                  }}
                  className={`w-12 h-6 rounded-full transition-colors relative ${
                    !payload.startAt ? 'bg-tg-button' : 'bg-tg-secondary'
                  }`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    !payload.startAt ? 'left-7' : 'left-1'
                  }`} />
                </button>
              </div>

              {/* Выбор даты начала */}
              {payload.startAt && (
                <div>
                  <label className="block text-sm text-tg-hint mb-1">{t('dates.startDateTime')}</label>
                  <DateTimePicker
                    value={payload.startAt}
                    onChange={(iso) => {
                      if (iso) updatePayload({ startAt: iso });
                    }}
                    min={(() => { const d = new Date(); d.setMinutes(d.getMinutes() + 5); return d; })()}
                    placeholder={t('dates.startDateTime')}
                  />
                </div>
              )}

              {/* Выбор даты окончания */}
              <div>
                <label className="block text-sm text-tg-hint mb-1"><AppIcon name="icon-calendar" size={14} /> {t('dates.endDateTime')}</label>
                <DateTimePicker
                  value={payload.endAt || null}
                  onChange={(iso) => updatePayload({ endAt: iso })}
                  min={(() => { const d = payload.startAt ? new Date(payload.startAt) : new Date(); d.setHours(d.getHours() + 1); return d; })()}
                  placeholder={t('dates.endDateTime')}
                />
                {payload.endAt && (
                  <button
                    onClick={() => updatePayload({ endAt: null })}
                    className="text-xs text-tg-hint mt-1 underline"
                  >
                    {t('dates.clearEndDate')}
                  </button>
                )}
              </div>

              <p className="text-xs text-tg-hint text-center">
                <AppIcon name="icon-calendar" size={14} /> {t('dates.timezoneHint')}
              </p>
            </motion.div>
          )}

          {/* Шаг 7: Победители */}
          {currentStep === 'WINNERS' && (
            <motion.div
              key="WINNERS"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="space-y-4"
            >
              {/* Mascot */}
              <div className="flex justify-center mb-4">
                <Mascot type="wizard-winners" size={160} loop={true} autoplay={true} />
              </div>

              <div>
                <label className="block text-sm text-tg-hint mb-1"><AppIcon name="icon-group" size={14} /> {t('winners.count')}:</label>
                <input
                  type="number"
                  min={1}
                  max={winnerLimit}
                  value={payload.winnersCount ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') {
                      updatePayload({ winnersCount: undefined as unknown as number });
                      return;
                    }
                    const val = parseInt(raw);
                    if (!isNaN(val)) {
                      updatePayload({ winnersCount: Math.min(Math.max(1, val), winnerLimit) });
                    }
                  }}
                  onBlur={() => {
                    if (!payload.winnersCount || payload.winnersCount < 1) {
                      updatePayload({ winnersCount: 1 });
                    }
                  }}
                  className="w-full bg-tg-bg rounded-lg px-4 py-3 text-tg-text text-center text-2xl font-bold"
                />
              </div>

              {/* Быстрый выбор */}
              <div className="flex gap-2 justify-center flex-wrap">
                {[1, 3, 5, 10, ...(userTier !== 'FREE' ? [25, 50] : []), ...(userTier === 'PRO' || userTier === 'BUSINESS' ? [100] : [])].map(n => (
                  <button
                    key={n}
                    onClick={() => updatePayload({ winnersCount: Math.min(n, winnerLimit) })}
                    className={`w-12 h-12 rounded-lg font-medium ${
                      payload.winnersCount === n
                        ? 'bg-tg-button text-tg-button-text'
                        : 'bg-tg-bg text-tg-text'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>

              <div className="bg-tg-bg rounded-lg p-3 text-sm text-tg-hint">
                <p className="mb-1"><AppIcon name="icon-winner" size={14} /> {t('winners.randomHint')}</p>
                <p><AppIcon name="icon-diamond" size={14} /> {t('winners.maxFree', { max: winnerLimit })}</p>
                {userTier === 'FREE' && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    <span className="text-[10px] bg-gray-500/20 text-gray-500 px-1.5 py-0.5 rounded">FREE: 5</span>
                    <span className="text-[10px] bg-blue-500/20 text-blue-600 px-1.5 py-0.5 rounded">PLUS: 10</span>
                    <span className="text-[10px] bg-purple-500/20 text-purple-600 px-1.5 py-0.5 rounded">PRO: 20</span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-600 px-1.5 py-0.5 rounded">BUSINESS: 200</span>
                  </div>
                )}
              </div>

              {!userHasPremium && (
                <button
                  onClick={() => setShowSubscription(true)}
                  className="relative w-full rounded-xl py-3 px-4 font-medium hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white overflow-hidden text-sm"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 animate-[shimmer-delayed_5s_ease-in-out_2.5s_infinite]" />
                  <AppIcon name="icon-diamond" size={16} className="relative z-10" />
                  <span className="relative z-10">{t('protection.upgradeTo')} {nextTierLabel}</span>
                </button>
              )}

              {/* Минимальное количество участников */}
              <div className="border-t border-tg-bg pt-4 mt-4">
                <label className="block text-sm text-tg-hint mb-2"><AppIcon name="icon-group" size={14} /> {t('winners.minParticipants')}</label>

                {/* BUSINESS: toggle "Без ограничений" */}
                {userTier === 'BUSINESS' && (
                  <button
                    onClick={() => {
                      const isUnlimited = payload.minParticipants === 0;
                      updatePayload({ minParticipants: isUnlimited ? TIER_LIMITS.maxMinParticipants.PRO : 0 });
                    }}
                    className={`w-full text-left p-3 rounded-lg flex items-center gap-3 mb-3 ${
                      payload.minParticipants === 0 ? 'bg-amber-500/10 border border-amber-500' : 'bg-tg-bg'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded flex items-center justify-center text-xs ${
                      payload.minParticipants === 0 ? 'bg-amber-500 text-white' : 'bg-tg-secondary'
                    }`}>
                      {payload.minParticipants === 0 ? <AppIcon name="icon-success" size={14} /> : ''}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{t('winners.unlimitedParticipants')}</div>
                      <div className="text-xs text-tg-hint">{t('winners.unlimitedParticipantsHint')}</div>
                    </div>
                  </button>
                )}

                <input
                  type="number"
                  min={1}
                  max={minParticipantsLimit === Infinity ? 999999 : minParticipantsLimit}
                  value={payload.minParticipants || ''}
                  disabled={userTier === 'BUSINESS' && payload.minParticipants === 0}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') return;
                    const val = parseInt(raw);
                    if (!isNaN(val)) {
                      const maxVal = minParticipantsLimit === Infinity ? 999999 : minParticipantsLimit;
                      updatePayload({ minParticipants: Math.min(Math.max(1, val), maxVal) });
                    }
                  }}
                  onBlur={() => {
                    if (!payload.minParticipants || payload.minParticipants < 1) {
                      const limit = minParticipantsLimit === Infinity ? 5000 : minParticipantsLimit;
                      updatePayload({ minParticipants: limit });
                    }
                  }}
                  placeholder={String(minParticipantsLimit === Infinity ? 5000 : minParticipantsLimit)}
                  className={`w-full bg-tg-bg rounded-lg px-4 py-3 text-tg-text text-center ${
                    userTier === 'BUSINESS' && payload.minParticipants === 0 ? 'opacity-40 cursor-not-allowed' : ''
                  }`}
                />
                <p className="text-xs text-tg-hint mt-2">
                  {t('winners.minParticipantsHint')}
                </p>
                {userTier !== 'BUSINESS' && (
                  <p className="text-xs text-tg-hint mt-1">
                    <AppIcon name="icon-diamond" size={14} /> {t('winners.minParticipantsMax', { max: minParticipantsLimit === Infinity ? '∞' : minParticipantsLimit.toLocaleString() })}
                  </p>
                )}
                {userTier === 'FREE' && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    <span className="text-[10px] bg-gray-500/20 text-gray-500 px-1.5 py-0.5 rounded">FREE: 1 000</span>
                    <span className="text-[10px] bg-blue-500/20 text-blue-600 px-1.5 py-0.5 rounded">PLUS: 3 000</span>
                    <span className="text-[10px] bg-purple-500/20 text-purple-600 px-1.5 py-0.5 rounded">PRO: 5 000</span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-600 px-1.5 py-0.5 rounded">BUSINESS: ∞</span>
                  </div>
                )}

                {/* Cancel / auto-extend settings — always shown since minParticipants is always > 0 */}
                {(payload.minParticipants || 0) > 0 && (
                  <div className="mt-4 space-y-3">
                    {/* Отменить если не набралось */}
                    <button
                      onClick={() => updatePayload({ cancelIfNotEnough: !payload.cancelIfNotEnough })}
                      className={`w-full text-left p-3 rounded-lg flex items-center gap-3 ${
                        payload.cancelIfNotEnough ? 'bg-red-500/10 border border-red-500' : 'bg-tg-bg'
                      }`}
                    >
                      <span className={`w-5 h-5 rounded flex items-center justify-center text-xs ${
                        payload.cancelIfNotEnough ? 'bg-red-500 text-white' : 'bg-tg-secondary'
                      }`}>
                        {payload.cancelIfNotEnough ? <AppIcon name="icon-success" size={14} /> : ''}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{t('winners.cancelIfNotEnough')}</div>
                        <div className="text-xs text-tg-hint">{t('winners.cancelIfNotEnoughHint')}</div>
                      </div>
                    </button>

                    {/* Автопродление если не отменяется */}
                    {!payload.cancelIfNotEnough && (
                      <div>
                        <label className="block text-sm text-tg-hint mb-2">{t('winners.autoExtendDays')}</label>
                        <div className="flex items-center gap-3">
                          <input
                            type="number"
                            min={0}
                            max={30}
                            value={payload.autoExtendDays || 0}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              updatePayload({ autoExtendDays: Math.min(Math.max(0, val), 30) });
                            }}
                            className="w-24 bg-tg-bg rounded-lg px-3 py-2 text-tg-text text-center"
                          />
                          <span className="text-sm text-tg-hint">{t('winners.daysLabel')}</span>
                        </div>
                        <p className="text-xs text-tg-hint mt-2">
                          {t('winners.autoExtendHint')}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Шаг 8: Защита */}
          {currentStep === 'PROTECTION' && (
            <motion.div
              key="PROTECTION"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="space-y-6"
            >
              {/* Mascot */}
              <div className="flex justify-center mb-4">
                <Mascot type="wizard-protection" size={160} loop={true} autoplay={true} />
              </div>

              {/* Блок Капча */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <AppIcon name="icon-verify" size={14} />
                  <div>
                    <h3 className="font-semibold">{t('protection.botProtection')}</h3>
                    <p className="text-xs text-tg-hint">{t('protection.defaultHint')}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {(['OFF', 'SUSPICIOUS_ONLY', 'ALL'] as const).map((modeValue) => {
                    const isRecommended = modeValue === 'ALL';
                    const isLockedForFree = modeValue === 'ALL' && userTier === 'FREE';
                    return (
                      <button
                        key={modeValue}
                        onClick={() => {
                          if (isLockedForFree) {
                            setShowSubscription(true);
                            return;
                          }
                          updatePayload({ captchaMode: modeValue });
                        }}
                        className={`w-full text-left p-3 rounded-lg flex items-start gap-3 transition-all ${
                          payload.captchaMode === modeValue
                            ? 'bg-[#f2b6b6]/20 border-2 border-[#f2b6b6]'
                            : isLockedForFree
                            ? 'bg-tg-bg border-2 border-transparent opacity-60'
                            : 'bg-tg-bg border-2 border-transparent hover:border-tg-secondary'
                        }`}
                      >
                        <span className="flex-shrink-0 mt-0.5">{modeValue === 'OFF' ? <AppIcon name="icon-cancelled" size={14} /> : modeValue === 'SUSPICIOUS_ONLY' ? <AppIcon name="icon-group" size={14} /> : <AppIcon name="icon-success" size={14} />}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{t(`protection.captcha.${modeValue}.label`)}</span>
                            {isRecommended && (
                              <span className="text-xs bg-green-500/20 text-green-600 px-2 py-0.5 rounded">
                                {t('protection.recommended')}
                              </span>
                            )}
                            {isLockedForFree && (
                              <span className="text-xs bg-blue-500/20 text-blue-600 px-2 py-0.5 rounded">
                                PLUS
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-tg-hint mt-0.5">{t(`protection.captcha.${modeValue}.desc`)}</p>
                        </div>
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center ${
                          payload.captchaMode === modeValue
                            ? 'bg-[#f2b6b6] text-white'
                            : 'bg-tg-secondary'
                        }`}>
                          {payload.captchaMode === modeValue && <AppIcon name="icon-success" size={14} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Блок Liveness Check */}
              <div className="border-t border-tg-bg pt-6">
                <div className="flex items-center justify-between p-4 bg-tg-bg rounded-lg">
                  <div className="flex items-start gap-3">
                    <AppIcon name="icon-view" size={14} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{t('protection.livenessTitle')}</span>
                        <span className="text-xs bg-amber-500/20 text-amber-600 px-2 py-0.5 rounded">
                          BUSINESS
                        </span>
                      </div>
                      <p className="text-xs text-tg-hint mt-0.5">
                        {t('protection.livenessHint')}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowSubscription(true)}
                    className="w-12 h-6 rounded-full bg-tg-secondary opacity-50 cursor-not-allowed relative"
                  >
                    <span className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full" />
                  </button>
                </div>
              </div>

              {/* Upgrade button */}
              {!userHasPremium && (
                <button
                  onClick={() => setShowSubscription(true)}
                  className="relative w-full rounded-xl py-3 px-4 font-medium hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white overflow-hidden text-sm"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 animate-[shimmer-delayed_5s_ease-in-out_2.5s_infinite]" />
                  <AppIcon name="icon-diamond" size={16} className="relative z-10" />
                  <span className="relative z-10">{t('protection.upgradeTo')} {nextTierLabel}</span>
                </button>
              )}
            </motion.div>
          )}

          {/* Шаг 9: Дополнительные билеты */}
          {currentStep === 'EXTRAS' && (
            <motion.div
              key="EXTRAS"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="space-y-6"
            >
              {/* Mascot */}
              <div className="flex justify-center mb-4">
                <Mascot type="wizard-invite" size={200} loop={true} autoplay={true} />
              </div>

              {/* Блок: Приглашение друзей (INVITE_REQUIRED, MAXIMUM) */}
              {(payload.type === 'INVITE_REQUIRED' || payload.type === 'MAXIMUM') && (
              <div className="bg-tg-bg rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <AppIcon name="icon-group" size={14} />
                    <div>
                      <span className="font-medium">{t('extras.inviteFriends')}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => updatePayload({ inviteEnabled: !payload.inviteEnabled })}
                    className={`w-12 h-6 rounded-full transition-colors relative ${
                      payload.inviteEnabled ? 'bg-tg-button' : 'bg-tg-secondary'
                    }`}
                  >
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      payload.inviteEnabled ? 'left-7' : 'left-1'
                    }`} />
                  </button>
                </div>
                <p className="text-xs text-tg-hint mb-3">
                  {t('extras.inviteDescription')}
                </p>
                
                {payload.inviteEnabled && (
                  <div className="mt-3 pt-3 border-t border-tg-secondary">
                    <label className="block text-sm text-tg-hint mb-2">
                      {t('extras.maxInvites')}:
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min={1}
                        max={inviteLimit}
                        value={payload.inviteMax ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === '') {
                            updatePayload({ inviteMax: undefined as unknown as number });
                            return;
                          }
                          const val = parseInt(raw);
                          if (!isNaN(val)) {
                            updatePayload({ inviteMax: Math.min(Math.max(1, val), inviteLimit) });
                          }
                        }}
                        onBlur={() => {
                          if (!payload.inviteMax) {
                            updatePayload({ inviteMax: 1 });
                          }
                        }}
                        placeholder="1"
                        className="w-24 bg-tg-secondary rounded-lg px-3 py-2 text-tg-text text-center"
                      />
                      <span className="text-xs text-tg-hint">{t('extras.maxInvitesFree', { max: inviteLimit })}</span>
                    </div>
                    {userTier === 'FREE' && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        <span className="text-[10px] bg-gray-500/20 text-gray-500 px-1.5 py-0.5 rounded">FREE: 3</span>
                        <span className="text-[10px] bg-blue-500/20 text-blue-600 px-1.5 py-0.5 rounded">PLUS: 10</span>
                        <span className="text-[10px] bg-purple-500/20 text-purple-600 px-1.5 py-0.5 rounded">PRO: 20</span>
                        <span className="text-[10px] bg-amber-500/20 text-amber-600 px-1.5 py-0.5 rounded">BUSINESS: 10 000</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              )}

              {/* Блок: Бусты каналов (BOOST_REQUIRED, MAXIMUM) */}
              {(payload.type === 'BOOST_REQUIRED' || payload.type === 'MAXIMUM') && (
              <div className="bg-tg-bg rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <AppIcon name="icon-boost" size={14} />
                    <div>
                      <span className="font-medium">{t('extras.channelBoosts')}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => updatePayload({ boostEnabled: !payload.boostEnabled })}
                    className={`w-12 h-6 rounded-full transition-colors relative ${
                      payload.boostEnabled ? 'bg-tg-button' : 'bg-tg-secondary'
                    }`}
                  >
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      payload.boostEnabled ? 'left-7' : 'left-1'
                    }`} />
                  </button>
                </div>
                <p className="text-xs text-tg-hint mb-3">
                  {t('extras.boostDescription')}
                </p>
                
                {payload.boostEnabled && (
                  <div className="mt-3 pt-3 border-t border-tg-secondary">
                    <label className="block text-sm text-tg-hint mb-2">
                      {t('extras.selectBoostChannels', { max: boostChannelLimit })}:
                    </label>
                    {channels.filter(c => c.type === 'CHANNEL').length === 0 ? (
                      <p className="text-xs text-tg-hint text-center py-2">
                        {t('extras.noBoostChannels')}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {channels.filter(c => c.type === 'CHANNEL').map((channel) => {
                          const isSelected = (payload.boostChannelIds || []).includes(channel.id);
                          const canSelect = isSelected || (payload.boostChannelIds || []).length < boostChannelLimit;
                          return (
                            <button
                              key={channel.id}
                              onClick={() => {
                                if (!canSelect) return;
                                const current = payload.boostChannelIds || [];
                                const updated = isSelected
                                  ? current.filter(id => id !== channel.id)
                                  : [...current, channel.id];
                                updatePayload({ boostChannelIds: updated });
                              }}
                              disabled={!canSelect}
                              className={`w-full text-left p-2 rounded-lg flex items-center gap-2 text-sm ${
                                isSelected 
                                  ? 'bg-tg-button/10 border border-tg-button' 
                                  : canSelect 
                                    ? 'bg-tg-secondary' 
                                    : 'bg-tg-secondary opacity-50'
                              }`}
                            >
                              <span className={`w-5 h-5 rounded flex items-center justify-center text-xs ${
                                isSelected ? 'bg-tg-button text-tg-button-text' : 'bg-tg-bg'
                              }`}>
                                {isSelected ? <AppIcon name="icon-success" size={14} /> : ''}
                              </span>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={getChannelAvatarUrl(channel.id)}
                                alt=""
                                className="w-8 h-8 rounded-full flex-shrink-0 bg-tg-secondary object-cover"
                                onError={(e) => { e.currentTarget.src = `/icons/brand/icon-channel.webp`; }}
                              />
                              <div className="flex-1 min-w-0">
                                <span className="truncate block">{channel.title}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-600">{t('subscriptions.channelBadge')}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {payload.boostEnabled && (payload.boostChannelIds || []).length === 0 && channels.filter(c => c.type === 'CHANNEL').length > 0 && (
                      <p className="text-xs text-yellow-600 mt-2 flex items-center gap-1.5">
                        <AppIcon name="icon-info" size={14} /> {t('extras.selectAtLeastOneBoost')}
                      </p>
                    )}
                    {userTier === 'FREE' && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        <span className="text-[10px] bg-gray-500/20 text-gray-500 px-1.5 py-0.5 rounded">FREE: 1</span>
                        <span className="text-[10px] bg-blue-500/20 text-blue-600 px-1.5 py-0.5 rounded">PLUS: 3</span>
                        <span className="text-[10px] bg-purple-500/20 text-purple-600 px-1.5 py-0.5 rounded">PRO: 5</span>
                        <span className="text-[10px] bg-amber-500/20 text-amber-600 px-1.5 py-0.5 rounded">BUSINESS: 10</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              )}

              {/* Блок: Сторис — только MAXIMUM и PLUS+ */}
              {payload.type === 'MAXIMUM' && (
              <div className="bg-tg-bg rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <AppIcon name="icon-story" size={14} />
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{t('extras.stories')}</span>
                      {!userHasPremium && (
                        <span className="text-xs bg-blue-500/20 text-blue-600 px-2 py-0.5 rounded">PLUS</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (!userHasPremium) {
                        setShowSubscription(true);
                        return;
                      }
                      updatePayload({ storiesEnabled: !payload.storiesEnabled });
                    }}
                    className={`w-12 h-6 rounded-full transition-colors relative ${
                      !userHasPremium ? 'bg-tg-secondary opacity-50 cursor-not-allowed' :
                      payload.storiesEnabled ? 'bg-tg-button' : 'bg-tg-secondary'
                    }`}
                  >
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      payload.storiesEnabled && userHasPremium ? 'left-7' : 'left-1'
                    }`} />
                  </button>
                </div>
                <p className="text-xs text-tg-hint">
                  {t('extras.storiesDescription')}
                </p>
                {!userHasPremium && (
                  <p className="text-xs text-blue-600 mt-2 flex items-center gap-1">
                    <AppIcon name="icon-diamond" size={14} /> {t('extras.storiesRequiresPremium')}
                  </p>
                )}
                {payload.storiesEnabled && userHasPremium && (
                  <div className="mt-3 p-2 bg-blue-500/10 rounded-lg">
                    <p className="text-xs text-blue-600">
                      <AppIcon name="icon-info" size={14} /> {t('extras.storiesManualCheck')}
                    </p>
                    <p className="text-xs text-yellow-600 mt-1 flex items-center gap-1">
                      <AppIcon name="icon-error" size={14} /> {t('extras.storiesPremiumOnly')}
                    </p>
                  </div>
                )}
              </div>
              )}

              {/* Продвижение в каталоге — включено в PLUS+ */}
              <div className="bg-tg-secondary rounded-xl p-4 relative overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <AppIcon name="icon-channel" size={14} />
                    <span className="font-medium">{t('extras.catalogPromotion')}</span>
                    <span className="text-xs bg-blue-500/20 text-blue-600 px-2 py-0.5 rounded-full">
                      PLUS
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      if (!userHasPremium) {
                        setShowSubscription(true);
                        return;
                      }
                      updatePayload({ catalogEnabled: !payload.catalogEnabled });
                    }}
                    className={`w-12 h-6 rounded-full transition-colors relative ${
                      !userHasPremium ? 'bg-tg-secondary border border-tg-hint opacity-50 cursor-not-allowed' :
                      payload.catalogEnabled ? 'bg-tg-button' : 'bg-tg-secondary'
                    }`}
                  >
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      payload.catalogEnabled && userHasPremium ? 'left-7' : 'left-1'
                    }`} />
                  </button>
                </div>
                <p className="text-xs text-tg-hint">
                  {t('extras.catalogDescription')}
                </p>
              </div>

              {/* Upgrade button for EXTRAS */}
              {!userHasPremium && (
                <button
                  onClick={() => setShowSubscription(true)}
                  className="relative w-full rounded-xl py-3 px-4 font-medium hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white overflow-hidden text-sm"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 animate-[shimmer-delayed_5s_ease-in-out_2.5s_infinite]" />
                  <AppIcon name="icon-diamond" size={16} className="relative z-10" />
                  <span className="relative z-10">{t('protection.upgradeTo')} {nextTierLabel}</span>
                </button>
              )}
            </motion.div>
          )}

          {/* Шаг 10: Маскот розыгрыша */}
          {currentStep === 'MASCOT' && (
            <motion.div
              key="MASCOT"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="space-y-4"
            >
              {/* Mascot */}
              <div className="flex justify-center mb-4">
                <Mascot type="wizard-mascot" size={200} loop={true} autoplay={true} />
              </div>

              <p className="text-sm text-tg-hint mb-4 text-center">
                {t('mascot.description')}
              </p>

              {/* Сетка выбора маскотов */}
              <div className="grid grid-cols-3 gap-3">
                {/* Бесплатный маскот */}
                <button
                  onClick={() => updatePayload({ mascotId: 'mascot-free-default' })}
                  className={`p-3 rounded-lg transition-all ${
                    payload.mascotId === 'mascot-free-default'
                      ? 'bg-tg-button ring-2 ring-tg-button scale-105'
                      : 'bg-tg-bg hover:bg-tg-secondary'
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <Mascot type="mascot-free-default" size={80} loop={false} autoplay={false} />
                    <span className={`text-xs ${payload.mascotId === 'mascot-free-default' ? 'text-tg-button-text' : ''}`}><AppIcon name="icon-giveaway" size={14} /> Талисман</span>
                  </div>
                </button>

                {/* Премиум маскоты */}
                {[1, 2, 3, 4, 5].map((num) => {
                  const mascotId = `mascot-paid-${num}` as const;
                  const isLocked = !userHasPremium; // TODO: check user subscription
                  
                  return (
                    <button
                      key={mascotId}
                      onClick={() => !isLocked && updatePayload({ mascotId })}
                      disabled={isLocked}
                      className={`p-3 rounded-lg transition-all relative ${
                        payload.mascotId === mascotId
                          ? 'bg-tg-button ring-2 ring-tg-button scale-105'
                          : isLocked
                          ? 'bg-tg-bg opacity-50'
                          : 'bg-tg-bg hover:bg-tg-secondary'
                      }`}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <Mascot type={mascotId} size={80} loop={false} autoplay={false} />
                        <span className={`text-xs ${payload.mascotId === mascotId ? 'text-tg-button-text' : ''}`}>
                          {isLocked ? <AppIcon name="icon-lock" size={14} /> : <AppIcon name="icon-star" size={14} />} {['Везунчик', 'Фортуна', 'Шанс', 'Джекпот', 'Триумф'][num - 1]}
                        </span>
                      </div>
                      {isLocked && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
                          <AppIcon name="icon-lock" size={28} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Превью выбранного маскота */}
              {payload.mascotId && (
                <div className="bg-tg-bg rounded-lg p-4">
                  <div className="flex flex-col items-center gap-3">
                    <Mascot 
                      type={payload.mascotId as any} 
                      size={200} 
                      loop={true} 
                      autoplay={true} 
                    />
                    <p className="text-sm text-tg-hint text-center">
                      {t('mascot.preview')}
                    </p>
                  </div>
                </div>
              )}

              {/* Mascot availability by tier */}
              <div className="bg-tg-bg rounded-lg p-3 text-sm space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-gray-500/20 text-gray-500 px-1.5 py-0.5 rounded shrink-0">FREE</span>
                  <span className="text-xs text-tg-hint">— Талисман</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-blue-500/20 text-blue-600 px-1.5 py-0.5 rounded shrink-0">PLUS</span>
                  <span className="text-xs text-tg-hint">— Талисман, Везунчик, Фортуна</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-purple-500/20 text-purple-600 px-1.5 py-0.5 rounded shrink-0">PRO</span>
                  <span className="text-xs text-tg-hint">— {t('mascot.allMascots')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-amber-500/20 text-amber-600 px-1.5 py-0.5 rounded shrink-0">BUSINESS</span>
                  <span className="text-xs text-tg-hint">— {t('mascot.allMascots')}</span>
                </div>
              </div>

              {/* Upgrade button for mascot */}
              {!userHasPremium && (
                <button
                  onClick={() => setShowSubscription(true)}
                  className="relative w-full rounded-xl py-3 px-4 font-medium hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white overflow-hidden text-sm"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 animate-[shimmer-delayed_5s_ease-in-out_2.5s_infinite]" />
                  <AppIcon name="icon-diamond" size={16} className="relative z-10" />
                  <span className="relative z-10">{t('protection.upgradeTo')} {nextTierLabel}</span>
                </button>
              )}
            </motion.div>
          )}

          {/* Шаг 11: Свои задания (CUSTOM и MAXIMUM) */}
          {currentStep === 'CUSTOM_TASKS' && (payload.type === 'CUSTOM' || payload.type === 'MAXIMUM') && (
            <motion.div
              key="CUSTOM_TASKS"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="space-y-4"
            >
              {/* Mascot */}
              <div className="flex justify-center mb-4">
                <Mascot type="wizard-tasks" size={160} loop={true} autoplay={true} />
              </div>

              <p className="text-sm text-tg-hint mb-4 text-center">
                {t('customTasks.description')}
              </p>

              {/* Список заданий */}
              <div className="space-y-3">
                {(payload.customTasks || []).map((task, idx) => (
                  <div key={idx} className="bg-tg-bg rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">
                        {t('customTasks.task')} #{idx + 1}
                      </span>
                      <button
                        onClick={() => {
                          const tasks = [...(payload.customTasks || [])];
                          tasks.splice(idx, 1);
                          updatePayload({ customTasks: tasks });
                        }}
                        className="text-red-500 text-xs"
                      >
                        <AppIcon name="icon-delete" size={14} /> {t('customTasks.remove')}
                      </button>
                    </div>

                    {/* Описание задания */}
                    <textarea
                      value={task.description || ''}
                      onChange={(e) => {
                        const tasks = [...(payload.customTasks || [])];
                        tasks[idx] = { ...task, description: e.target.value };
                        updatePayload({ customTasks: tasks });
                      }}
                      placeholder={t('customTasks.descriptionPlaceholder')}
                      maxLength={300}
                      rows={2}
                      className="w-full bg-tg-secondary rounded-lg px-3 py-2 text-sm text-tg-text placeholder:text-tg-hint/50 resize-none"
                    />

                    {/* URL (опционально) */}
                    <div>
                      <input
                        type="url"
                        value={task.url || ''}
                        onChange={(e) => {
                          const tasks = [...(payload.customTasks || [])];
                          tasks[idx] = { ...task, url: e.target.value };
                          updatePayload({ customTasks: tasks });
                        }}
                        placeholder={t('customTasks.urlPlaceholder')}
                        className={`w-full bg-tg-secondary rounded-lg px-3 py-2 text-sm text-tg-text placeholder:text-tg-hint/50 ${
                          task.url && task.url.length > 0 && !isValidURL(task.url)
                            ? 'border-2 border-red-500'
                            : ''
                        }`}
                      />
                      {task.url && task.url.length > 0 && !isValidURL(task.url) && (
                        <ValidationMessage 
                          message="Введите корректный URL (например: https://example.com)" 
                          type="error"
                        />
                      )}
                    </div>

                    {/* Дополнительные билеты за задание */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-tg-hint">{t('customTasks.extraTickets')}:</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={task.tickets || 1}
                        onChange={(e) => {
                          const tasks = [...(payload.customTasks || [])];
                          tasks[idx] = { ...task, tickets: Math.max(0, parseInt(e.target.value) || 1) };
                          updatePayload({ customTasks: tasks });
                        }}
                        className="w-20 bg-tg-secondary rounded-lg px-3 py-1 text-sm text-tg-text text-center"
                      />
                      <span className="text-xs text-tg-hint"><AppIcon name="icon-ticket" size={14} /></span>
                    </div>
                  </div>
                ))}

                {/* Добавить задание */}
                {(payload.customTasks || []).length < customTaskLimit && (
                  <button
                    onClick={() => {
                      const tasks = [...(payload.customTasks || [])];
                      tasks.push({ title: '', description: '', url: '', tickets: 1 });
                      updatePayload({ customTasks: tasks });
                    }}
                    className="w-full py-3 border-2 border-dashed border-tg-hint/30 rounded-lg text-tg-hint hover:border-tg-button hover:text-tg-button transition-colors"
                  >
                    <AppIcon name="icon-create" size={14} /> {t('customTasks.addTask')}
                  </button>
                )}
              </div>

              {/* Подсказка с лимитами */}
              <div className="bg-tg-bg rounded-lg p-3">
                <p className="text-xs text-tg-hint">
                  <AppIcon name="icon-info" size={14} /> {t('customTasks.hint')}
                </p>
                <p className="text-xs text-tg-hint mt-1">
                  <AppIcon name="icon-diamond" size={14} /> {t('customTasks.limit', { max: customTaskLimit })}
                </p>
                {userTier === 'FREE' && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    <span className="text-[10px] bg-gray-500/20 text-gray-500 px-1.5 py-0.5 rounded">FREE: 1</span>
                    <span className="text-[10px] bg-blue-500/20 text-blue-600 px-1.5 py-0.5 rounded">PLUS: 3</span>
                    <span className="text-[10px] bg-purple-500/20 text-purple-600 px-1.5 py-0.5 rounded">PRO: 5</span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-600 px-1.5 py-0.5 rounded">BUSINESS: 10</span>
                  </div>
                )}
              </div>

              {!userHasPremium && (
                <button
                  onClick={() => setShowSubscription(true)}
                  className="relative w-full rounded-xl py-3 px-4 font-medium hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white overflow-hidden text-sm"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 animate-[shimmer-delayed_5s_ease-in-out_2.5s_infinite]" />
                  <AppIcon name="icon-diamond" size={16} className="relative z-10" />
                  <span className="relative z-10">{t('protection.upgradeTo')} {nextTierLabel}</span>
                </button>
              )}
            </motion.div>
          )}

          {/* Шаг 12: Проверка */}
          {currentStep === 'REVIEW' && (
            <motion.div
              key="REVIEW"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="space-y-4"
            >
              {/* Mascot */}
              <div className="flex justify-center mb-4">
                <Mascot type="wizard-review" size={200} loop={true} autoplay={true} />
              </div>

              {/* Основное + кнопка Edit */}
              <div className="bg-tg-bg rounded-lg p-3 space-y-2 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-tg-hint text-xs font-medium"><AppIcon name="icon-edit" size={14} /> {t('review.basics')}</span>
                  <button onClick={() => { hapticNavigation(); goToStep('BASICS'); }} className="text-xs text-tg-button"><AppIcon name="icon-edit" size={14} /> {t('review.edit')}</button>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">{t('review.type')}:</span>
                  <span>{payload.type ? t(`types.${payload.type}.label`) : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">{t('review.name')}:</span>
                  <span className="truncate max-w-[200px]">{payload.title || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">{t('review.language')}:</span>
                  <span>{payload.language?.toUpperCase() || 'RU'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">{t('review.button')}:</span>
                  <span className="truncate max-w-[200px]">{payload.buttonText || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">{t('review.postTemplate')}:</span>
                  <span>{payload.postTemplateId ? <><AppIcon name="icon-success" size={14} /> {t('review.selected')}</> : <><AppIcon name="icon-cancelled" size={14} /> {t('review.notSelected')}</>}</span>
                </div>
                {payload.prizeDescription && (
                  <div className="flex justify-between">
                    <span className="text-tg-hint">{t('review.prize')}:</span>
                    <span className="truncate max-w-[200px]">{payload.prizeDescription}</span>
                  </div>
                )}
              </div>

              {/* Даты */}
              <div className="bg-tg-bg rounded-lg p-3 space-y-2 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-tg-hint text-xs font-medium"><AppIcon name="icon-calendar" size={14} /> {t('review.dates')}</span>
                  <button onClick={() => { hapticNavigation(); goToStep('DATES'); }} className="text-xs text-tg-button"><AppIcon name="icon-edit" size={14} /> {t('review.edit')}</button>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">{t('review.start')}:</span>
                  <span>{payload.startAt ? formatDisplayDate(payload.startAt) : t('review.afterConfirmation')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">{t('review.end')}:</span>
                  <span>{payload.endAt ? formatDisplayDate(payload.endAt) : t('review.notSpecified')}</span>
                </div>
              </div>

              {/* Победители */}
              <div className="bg-tg-bg rounded-lg p-3 space-y-2 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-tg-hint text-xs font-medium"><AppIcon name="icon-winner" size={14} /> {t('review.winners')}</span>
                  <button onClick={() => { hapticNavigation(); goToStep('WINNERS'); }} className="text-xs text-tg-button"><AppIcon name="icon-edit" size={14} /> {t('review.edit')}</button>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">{t('review.count')}:</span>
                  <span className="font-medium">{payload.winnersCount || 1}</span>
                </div>
                {(payload.minParticipants || 0) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-tg-hint">{t('review.minParticipants')}:</span>
                    <span>{payload.minParticipants}</span>
                  </div>
                )}
              </div>

              {/* Каналы */}
              <div className="bg-tg-bg rounded-lg p-3 space-y-2 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-tg-hint text-xs font-medium"><AppIcon name="icon-channel" size={14} /> {t('review.channels')}</span>
                  <button onClick={() => { hapticNavigation(); goToStep('SUBSCRIPTIONS'); }} className="text-xs text-tg-button"><AppIcon name="icon-edit" size={14} /> {t('review.edit')}</button>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">{t('review.subscriptions')}:</span>
                  <span>{(payload.requiredSubscriptionChannelIds || []).length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">{t('review.publication')}:</span>
                  <span>{(payload.publishChannelIds || []).length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">{t('review.results')}:</span>
                  <span>{(payload.resultsChannelIds || []).length}</span>
                </div>
              </div>

              {/* Защита */}
              <div className="bg-tg-bg rounded-lg p-3 space-y-2 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-tg-hint text-xs font-medium"><AppIcon name="icon-lock" size={14} /> {t('review.protection')}</span>
                  <button onClick={() => { hapticNavigation(); goToStep('PROTECTION'); }} className="text-xs text-tg-button"><AppIcon name="icon-edit" size={14} /> {t('review.edit')}</button>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">{t('review.captcha')}:</span>
                  <span>{t(`protection.captcha.${payload.captchaMode || 'SUSPICIOUS_ONLY'}.label`)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">Liveness Check:</span>
                  <span>{payload.livenessEnabled ? <><AppIcon name="icon-success" size={14} /> {t('review.enabled')}</> : <><AppIcon name="icon-cancelled" size={14} /> {t('review.disabled')}</>}</span>
                </div>
              </div>

              {/* Дополнительные билеты */}
              <div className="bg-tg-bg rounded-lg p-3 space-y-2 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-tg-hint text-xs font-medium"><AppIcon name="icon-ticket" size={14} /> {t('review.extraTickets')}</span>
                  <button onClick={() => { hapticNavigation(); goToStep('EXTRAS'); }} className="text-xs text-tg-button"><AppIcon name="icon-edit" size={14} /> {t('review.edit')}</button>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">{t('review.invites')}:</span>
                  <span>
                    {payload.inviteEnabled
                      ? <><AppIcon name="icon-success" size={14} /> {t('review.upToFriends', { count: Math.min(payload.inviteMax || inviteLimit, inviteLimit) })}</>
                      : <><AppIcon name="icon-cancelled" size={14} /> {t('review.disabled')}</>}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">{t('review.boosts')}:</span>
                  <span>
                    {payload.boostEnabled 
                      ? <><AppIcon name="icon-success" size={14} /> {t('review.channelsCount', { count: (payload.boostChannelIds || []).length })}</> 
                      : <><AppIcon name="icon-cancelled" size={14} /> {t('review.disabled')}</>}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">{t('review.stories')}:</span>
                  <span>
                    {payload.storiesEnabled 
                      ? <><AppIcon name="icon-success" size={14} /> {t('review.enabledManual')}</> 
                      : <><AppIcon name="icon-cancelled" size={14} /> {t('review.disabled')}</>}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">{t('review.catalog')}:</span>
                  <span className="text-yellow-600"><AppIcon name="icon-lock" size={14} /> PRO</span>
                </div>
              </div>

              {/* Свои задания (CUSTOM и MAXIMUM) */}
              {(payload.type === 'CUSTOM' || payload.type === 'MAXIMUM') && (payload.customTasks || []).length > 0 && (
                <div className="bg-tg-bg rounded-lg p-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-tg-hint text-xs font-medium"><AppIcon name="icon-success" size={14} /> {t('review.customTasks')}</span>
                    <button onClick={() => { hapticNavigation(); goToStep('CUSTOM_TASKS'); }} className="text-xs text-tg-button"><AppIcon name="icon-edit" size={14} /> {t('review.edit')}</button>
                  </div>
                  {(payload.customTasks || []).map((task, idx) => (
                    <div key={idx} className="flex justify-between items-start gap-2">
                      <span className="text-tg-hint text-xs">#{idx + 1}</span>
                      <span className="flex-1 text-xs truncate">{task.description || '—'}</span>
                      {task.tickets && <span className="text-xs text-tg-button">+{task.tickets} <AppIcon name="icon-ticket" size={14} /></span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Маскот розыгрыша */}
              {payload.mascotId && (
                <div className="bg-tg-bg rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-tg-hint text-xs font-medium"><AppIcon name="icon-star" size={14} /> {t('review.mascot')}</span>
                    <button onClick={() => { hapticNavigation(); goToStep('MASCOT'); }} className="text-xs text-tg-button"><AppIcon name="icon-edit" size={14} /> {t('review.edit')}</button>
                  </div>
                  <div className="mt-1 text-xs">
                    {payload.mascotId === 'mascot-free-default'
                      ? 'Талисман'
                      : (() => {
                          const num = parseInt(payload.mascotId.replace('mascot-paid-', ''), 10);
                          return ['Везунчик', 'Фортуна', 'Шанс', 'Джекпот', 'Триумф'][num - 1] || payload.mascotId;
                        })()
                    }
                  </div>
                </div>
              )}

              {/* Кнопка отмены черновика */}
              <button
                onClick={() => { hapticError(); setShowExitConfirm(true); }}
                className="w-full py-2 text-sm text-red-500 hover:text-red-600 transition-colors"
              >
                <AppIcon name="icon-cancelled" size={14} /> {t('review.cancelDraft')}
              </button>

              {/* Validation warnings */}
              {(!payload.type || !payload.title || !payload.buttonText || !payload.postTemplateId || (payload.publishChannelIds || []).length === 0) && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-sm text-yellow-600">
                  <AppIcon name="icon-info" size={14} /> {t('review.fillRequired')}:
                  <ul className="list-disc list-inside mt-1">
                    {!payload.type && <li>{t('review.required.type')}</li>}
                    {!payload.title && <li>{t('review.required.title')}</li>}
                    {!payload.buttonText && <li>{t('review.required.buttonText')}</li>}
                    {!payload.postTemplateId && <li>{t('review.required.postTemplate')}</li>}
                    {(payload.publishChannelIds || []).length === 0 && <li>{t('review.required.publishChannel')}</li>}
                  </ul>
                </div>
              )}
            </motion.div>
          )}
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="flex gap-3">
          {currentStepIndex > 0 && (
            <button
              onClick={goPrev}
              disabled={saving}
              className="flex-1 bg-tg-secondary text-tg-text rounded-lg py-3 font-medium"
            >
              <AppIcon name="icon-back" size={16} /> {t('nav.back')}
            </button>
          )}
          
          {currentStep !== 'REVIEW' ? (
            <button
              onClick={goNext}
              disabled={saving}
              className="flex-1 bg-tg-button text-tg-button-text rounded-lg py-3 font-medium"
            >
              {t('nav.next')} <AppIcon name="icon-back" size={16} className="rotate-180" />
            </button>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={confirming || !payload.type || !payload.title || !payload.buttonText || !payload.postTemplateId || (payload.publishChannelIds || []).length === 0}
              className="flex-1 bg-green-500 text-white rounded-lg py-3 font-medium disabled:opacity-50"
            >
              {confirming ? <><AppIcon name="icon-pending" size={14} /> {t('nav.creating')}</> : <><AppIcon name="icon-success" size={14} /> {t('nav.create')}</>}
            </button>
          )}
        </div>

        {/* PostsManager BottomSheet */}
        <PostsManager
          isOpen={showPostsManager}
          onClose={() => setShowPostsManager(false)}
          mode="select"
          selectedId={payload.postTemplateId}
          onSelect={(post) => {
            updatePayload({ postTemplateId: post.id });
            setPostTemplates(prev => {
              const exists = prev.find(p => p.id === post.id);
              return exists ? prev : [...prev, post];
            });
            setShowPostsManager(false);
          }}
        />

        {/* Exit Confirmation Dialog */}
        <ConfirmDialog
          isOpen={showExitConfirm}
          onClose={() => setShowExitConfirm(false)}
          onConfirm={() => {
            setShowExitConfirm(false);
            router.back();
          }}
          title={t('exitConfirm.title')}
          description={t('exitConfirm.description')}
          confirmText={t('exitConfirm.confirm')}
          cancelText={t('exitConfirm.cancel')}
          variant="warning"
        />

        {/* 14.2 Draft Resume Modal */}
        {showDraftModal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm bg-tg-bg rounded-2xl shadow-xl p-6 animate-in slide-in-from-bottom-4">
              <div className="text-center mb-5">
                <span className="text-4xl block mb-3"><AppIcon name="icon-edit" size={14} /></span>
                <h2 className="text-lg font-bold mb-1">{tCommon('statusDraft')}</h2>
                <p className="text-sm text-tg-hint">
                  У вас есть несохранённый черновик. Хотите продолжить редактирование или начать заново?
                </p>
              </div>
              <div className="space-y-3">
                <button
                  onClick={handleResumeDraft}
                  className="w-full py-3 px-4 bg-tg-button text-tg-button-text rounded-xl font-semibold text-sm transition-opacity hover:opacity-90"
                >
                  <AppIcon name="icon-edit" size={14} /> Продолжить редактирование
                </button>
                <button
                  onClick={handleDiscardAndNew}
                  className="w-full py-3 px-4 bg-tg-secondary text-tg-text rounded-xl font-semibold text-sm transition-opacity hover:opacity-90"
                >
                  <AppIcon name="icon-create" size={14} /> Начать заново
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <SubscriptionBottomSheet
        isOpen={showSubscription}
        onClose={() => setShowSubscription(false)}
        defaultTier={nextTier as 'plus' | 'pro' | 'business'}
      />
    </main>
  );
}
