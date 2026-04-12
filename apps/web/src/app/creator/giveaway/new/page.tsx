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
} from '@/lib/api';
import { DateTimePicker } from '@/components/DateTimePicker';
import { PostsManager } from '@/components/PostsManager';
import { Mascot } from '@/components/Mascot';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ValidationMessage, useURLValidation } from '@/components/ui/ValidationMessage';
import { AppIcon } from '@/components/AppIcon';
import { hapticNavigation, hapticSuccess, hapticError, hapticToggle, hapticSelect } from '@/lib/haptic';

// Bot deep link for confirmation
const BOT_USERNAME = process.env.NEXT_PUBLIC_BOT_USERNAME || 'BeastRandomBot';

// Шаги wizard'а
const WIZARD_STEPS = ['TYPE', 'BASICS', 'SUBSCRIPTIONS', 'PUBLISH', 'RESULTS', 'DATES', 'WINNERS', 'PROTECTION', 'EXTRAS', 'MASCOT', 'CUSTOM_TASKS', 'REVIEW'] as const;
type WizardStep = (typeof WIZARD_STEPS)[number];

// Лимиты для победителей (бесплатный аккаунт)
const MAX_WINNERS_FREE = 10;

// Лимиты для дополнительных билетов
const MAX_INVITES_FREE = 10;
const MAX_BOOST_CHANNELS = 5;


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

  // Channel limit by tier
  const subscriptionChannelLimit = userTier === 'BUSINESS' ? Infinity : userTier === 'PRO' ? 30 : userTier === 'PLUS' ? 10 : 3;
  // Winner limit by tier
  const winnerLimit = userTier === 'BUSINESS' ? 200 : userTier === 'PRO' ? 100 : userTier === 'PLUS' ? 50 : 10;

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
            inviteMax: 10,
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
          inviteMax: 10,
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
          inviteMax: 10,
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
      if (step === 'CUSTOM_TASKS' && payload.type !== 'CUSTOM') return false;
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
          
          <a
            href={botLink}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full bg-tg-button text-tg-button-text rounded-lg py-4 font-medium text-lg mb-4"
          >
            <AppIcon name="icon-shield" size={16} /> {t('success.openBot')}
          </a>
          
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
              {(['STANDARD', 'BOOST_REQUIRED', 'INVITE_REQUIRED', 'CUSTOM'] as const).map((typeValue) => {
                const typeMascots: Record<string, string> = {
                  STANDARD: 'wizard-promotion',
                  BOOST_REQUIRED: 'wizard-boost',
                  INVITE_REQUIRED: 'wizard-invite',
                  CUSTOM: 'wizard-stories',
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
                      <Mascot type={typeMascots[typeValue]} size={70} loop={payload.type === typeValue} autoplay={payload.type === typeValue} />
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
                            {selectedPost.mediaType !== 'NONE' ? (selectedPost.mediaType === 'PHOTO' ? <><AppIcon name="icon-image" size={14} />{' '}</> : <><AppIcon name="icon-camera" size={14} />{' '}</>) : <><AppIcon name="icon-edit" size={14} />{' '}</>}
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
                  <p className="text-xs text-tg-hint mt-1">
                    FREE: 3 · PLUS: 10 · PRO: 30 · BUSINESS: ∞
                  </p>
                )}
              </div>

              {channels.length === 0 ? (
                <p className="text-center text-tg-hint py-8">
                  <AppIcon name="icon-channel" size={16} /> {t('subscriptions.noChannels')}
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
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {channel.type === 'CHANNEL' ? <AppIcon name="icon-channel" size={14} /> : <AppIcon name="icon-group" size={14} />} {channel.title}
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
              {channels.length === 0 ? (
                <p className="text-center text-tg-hint py-8">
                  <AppIcon name="icon-channel" size={16} /> {t('publish.noChannels')}
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
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {channel.type === 'CHANNEL' ? <AppIcon name="icon-channel" size={14} /> : <AppIcon name="icon-group" size={14} />} {channel.title}
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
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {channel.type === 'CHANNEL' ? <AppIcon name="icon-channel" size={14} /> : <AppIcon name="icon-group" size={14} />} {channel.title}
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
                    onClick={() => updatePayload({ publishResultsMode: 'RANDOMIZER' })}
                    className={`w-full text-left p-3 rounded-lg flex items-center gap-3 ${
                      payload.publishResultsMode === 'RANDOMIZER'
                        ? 'bg-tg-button/10 border border-tg-button'
                        : 'bg-tg-bg'
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
                      <div className="font-medium"><AppIcon name="icon-winner" size={14} /> {t('resultsStep.randomizer')}</div>
                      <div className="text-xs text-tg-hint">{t('resultsStep.randomizerHint')}</div>
                    </div>
                  </button>
                </div>
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
                <AppIcon name="icon-calendar" size={16} /> {t('dates.timezoneHint')}
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
                  value={payload.winnersCount || 1}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 1;
                    updatePayload({ winnersCount: Math.min(Math.max(1, val), winnerLimit) });
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
                  <p className="mt-1 text-xs">FREE: 10 · PLUS: 50 · PRO: 100 · BUSINESS: 200</p>
                )}
              </div>

              {/* Минимальное количество участников */}
              <div className="border-t border-tg-bg pt-4 mt-4">
                <label className="block text-sm text-tg-hint mb-2"><AppIcon name="icon-group" size={14} /> {t('winners.minParticipants')}</label>
                <input
                  type="number"
                  min={0}
                  max={10000}
                  value={payload.minParticipants || 0}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    updatePayload({ minParticipants: Math.max(0, val) });
                  }}
                  placeholder="0"
                  className="w-full bg-tg-bg rounded-lg px-4 py-3 text-tg-text text-center"
                />
                <p className="text-xs text-tg-hint mt-2">
                  {t('winners.minParticipantsHint')}
                </p>

                {/* Если указан минимум — показать дополнительные настройки */}
                {(payload.minParticipants || 0) > 0 && (
                  <div className="mt-4 space-y-3">
                    {/* Отменить если не набралось */}
                    <div className="flex items-center justify-between p-3 bg-tg-bg rounded-lg">
                      <div>
                        <div className="font-medium text-sm">{t('winners.cancelIfNotEnough')}</div>
                        <div className="text-xs text-tg-hint">{t('winners.cancelIfNotEnoughHint')}</div>
                      </div>
                      <button
                        onClick={() => updatePayload({ cancelIfNotEnough: !payload.cancelIfNotEnough })}
                        className={`w-12 h-6 rounded-full transition-colors relative ${
                          payload.cancelIfNotEnough ? 'bg-red-500' : 'bg-tg-secondary'
                        }`}
                      >
                        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                          payload.cancelIfNotEnough ? 'left-7' : 'left-1'
                        }`} />
                      </button>
                    </div>

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
                  <AppIcon name="icon-verify" size={18} />
                  <div>
                    <h3 className="font-semibold">{t('protection.botProtection')}</h3>
                    <p className="text-xs text-tg-hint">{t('protection.defaultHint')}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {(['OFF', 'SUSPICIOUS_ONLY', 'ALL'] as const).map((modeValue) => {
                    const isRecommended = modeValue === 'SUSPICIOUS_ONLY';
                    return (
                      <button
                        key={modeValue}
                        onClick={() => updatePayload({ captchaMode: modeValue })}
                        className={`w-full text-left p-3 rounded-lg flex items-start gap-3 transition-all ${
                          payload.captchaMode === modeValue
                            ? 'bg-[#f2b6b6]/20 border-2 border-[#f2b6b6]'
                            : 'bg-tg-bg border-2 border-transparent hover:border-tg-secondary'
                        }`}
                      >
                        <span className="flex-shrink-0 mt-0.5">{modeValue === 'OFF' ? <AppIcon name="icon-cancelled" size={18} /> : modeValue === 'SUSPICIOUS_ONLY' ? <AppIcon name="icon-group" size={18} /> : <AppIcon name="icon-success" size={18} />}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{t(`protection.captcha.${modeValue}.label`)}</span>
                            {isRecommended && (
                              <span className="text-xs bg-green-500/20 text-green-600 px-2 py-0.5 rounded">
                                {t('protection.recommended')}
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
                    <AppIcon name="icon-view" size={18} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{t('protection.livenessTitle')}</span>
                        <span className="text-xs bg-purple-500/20 text-purple-600 px-2 py-0.5 rounded">
                          PRO
                        </span>
                      </div>
                      <p className="text-xs text-tg-hint mt-0.5">
                        {t('protection.livenessHint')}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      // Показываем уведомление что это PRO фича
                      alert(t('protection.livenessProAlert'));
                    }}
                    className="w-12 h-6 rounded-full bg-tg-secondary opacity-50 cursor-not-allowed relative"
                  >
                    <span className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full" />
                  </button>
                </div>
                <p className="text-xs text-tg-hint mt-2 text-center">
                  <AppIcon name="icon-diamond" size={14} /> {t('protection.availableInPro')}
                </p>
              </div>
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

              {/* Блок: Приглашение друзей */}
              <div className="bg-tg-bg rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <AppIcon name="icon-group" size={18} />
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
                        max={MAX_INVITES_FREE}
                        value={payload.inviteMax || 10}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 1;
                          updatePayload({ inviteMax: Math.min(Math.max(1, val), MAX_INVITES_FREE) });
                        }}
                        className="w-24 bg-tg-secondary rounded-lg px-3 py-2 text-tg-text text-center"
                      />
                      <span className="text-xs text-tg-hint">{t('extras.maxInvitesFree', { max: MAX_INVITES_FREE })}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Блок: Бусты каналов */}
              <div className="bg-tg-bg rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <AppIcon name="icon-boost" size={18} />
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
                      {t('extras.selectBoostChannels', { max: MAX_BOOST_CHANNELS })}:
                    </label>
                    {channels.filter(c => c.type === 'CHANNEL').length === 0 ? (
                      <p className="text-xs text-tg-hint text-center py-2">
                        {t('extras.noBoostChannels')}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {channels.filter(c => c.type === 'CHANNEL').map((channel) => {
                          const isSelected = (payload.boostChannelIds || []).includes(channel.id);
                          const canSelect = isSelected || (payload.boostChannelIds || []).length < MAX_BOOST_CHANNELS;
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
                              <span className={`w-4 h-4 rounded flex items-center justify-center text-xs ${
                                isSelected ? 'bg-tg-button text-tg-button-text' : 'bg-tg-bg'
                              }`}>
                                {isSelected ? <AppIcon name="icon-success" size={14} /> : ''}
                              </span>
                              <span className="truncate"><AppIcon name="icon-channel" size={14} /> {channel.title}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {payload.boostEnabled && (payload.boostChannelIds || []).length === 0 && channels.filter(c => c.type === 'CHANNEL').length > 0 && (
                      <p className="text-xs text-yellow-600 mt-2">
                        <AppIcon name="icon-warning" size={14} /> {t('extras.selectAtLeastOneBoost')}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Блок: Сторис */}
              <div className="bg-tg-bg rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <AppIcon name="icon-story" size={18} />
                    <div>
                      <span className="font-medium">{t('extras.stories')}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => updatePayload({ storiesEnabled: !payload.storiesEnabled })}
                    className={`w-12 h-6 rounded-full transition-colors relative ${
                      payload.storiesEnabled ? 'bg-tg-button' : 'bg-tg-secondary'
                    }`}
                  >
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      payload.storiesEnabled ? 'left-7' : 'left-1'
                    }`} />
                  </button>
                </div>
                <p className="text-xs text-tg-hint">
                  {t('extras.storiesDescription')}
                </p>
                {payload.storiesEnabled && (
                  <div className="mt-3 p-2 bg-blue-500/10 rounded-lg">
                    <p className="text-xs text-blue-600">
                      <AppIcon name="icon-info" size={14} /> {t('extras.storiesManualCheck')}
                    </p>
                    <p className="text-xs text-tg-hint mt-1">
                      {t('extras.moderationPage')}: <span className="font-mono">/creator/giveaway/[id]/stories</span>
                    </p>
                    <p className="text-xs text-yellow-600 mt-1">
                      <AppIcon name="icon-warning" size={14} /> {t('extras.storiesPremiumOnly')}
                    </p>
                  </div>
                )}
              </div>

              {/* Продвижение в каталоге — платная функция */}
              <div className="bg-tg-secondary rounded-xl p-4 relative overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <AppIcon name="icon-channel" size={18} />
                    <span className="font-medium">{t('extras.catalogPromotion')}</span>
                    <span className="text-xs bg-yellow-500/20 text-yellow-600 px-2 py-0.5 rounded-full">
                      PRO
                    </span>
                  </div>
                  <button
                    disabled
                    className="w-12 h-6 rounded-full transition-colors relative bg-tg-secondary border border-tg-hint opacity-50 cursor-not-allowed"
                  >
                    <span className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full" />
                  </button>
                </div>
                <p className="text-xs text-tg-hint">
                  {t('extras.catalogDescription')}
                </p>
                <div className="mt-3 p-2 bg-yellow-500/10 rounded-lg">
                  <p className="text-xs text-yellow-600">
                    <AppIcon name="icon-diamond" size={14} /> {t('extras.comingSoon')}
                  </p>
                </div>
              </div>
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
                    <span className={`text-xs ${payload.mascotId === 'mascot-free-default' ? 'text-tg-button-text' : ''}`}><AppIcon name="icon-giveaway" size={16} /> Талисман</span>
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

              {/* Уведомление для бесплатных пользователей */}
              {!userHasPremium && (
                <div className="bg-yellow-500/10 rounded-lg p-3">
                  <p className="text-sm text-yellow-600">
                    <AppIcon name="icon-diamond" size={14} /> {t('mascot.premiumHint')}
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {/* Шаг 11: Свои задания (только для CUSTOM) */}
          {currentStep === 'CUSTOM_TASKS' && payload.type === 'CUSTOM' && (
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
                {(payload.customTasks || []).length < 10 && (
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

              {/* Подсказка */}
              <div className="bg-tg-bg rounded-lg p-3">
                <p className="text-xs text-tg-hint">
                  <AppIcon name="icon-info" size={14} /> {t('customTasks.hint')}
                </p>
              </div>
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
                      ? <><AppIcon name="icon-success" size={14} /> {t('review.upToFriends', { count: payload.inviteMax || 10 })}</> 
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

              {/* Свои задания (только для CUSTOM типа) */}
              {payload.type === 'CUSTOM' && (payload.customTasks || []).length > 0 && (
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
                  <AppIcon name="icon-info" size={16} /> {t('review.fillRequired')}:
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
    </main>
  );
}
