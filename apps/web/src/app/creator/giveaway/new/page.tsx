'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  getDraft,
  createDraft,
  updateDraft,
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
  
  // TODO: TASKS-6 - проверка подписки пользователя
  const userHasPremium = false;

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

        // Load or create draft
        let draftRes = await getDraft();
        
        if (!draftRes.ok || !draftRes.draft) {
          // Create new draft
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
            // Дополнительные билеты - по умолчанию выключены
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

  // Navigate next/prev
  const currentStepIndex = WIZARD_STEPS.indexOf(currentStep);
  
  const goNext = useCallback(async () => {
    if (currentStepIndex < WIZARD_STEPS.length - 1) {
      let nextIndex = currentStepIndex + 1;
      let nextStep = WIZARD_STEPS[nextIndex];
      
      // Пропустить CUSTOM_TASKS если тип не CUSTOM
      if (nextStep === 'CUSTOM_TASKS' && payload.type !== 'CUSTOM') {
        nextIndex++;
        nextStep = WIZARD_STEPS[nextIndex];
      }
      
      hapticNavigation(); // Haptic feedback при переходе
      await goToStep(nextStep);
    }
  }, [currentStepIndex, goToStep, payload.type]);

  const goPrev = useCallback(async () => {
    if (currentStepIndex > 0) {
      let prevIndex = currentStepIndex - 1;
      let prevStep = WIZARD_STEPS[prevIndex];
      
      // Пропустить CUSTOM_TASKS если тип не CUSTOM
      if (prevStep === 'CUSTOM_TASKS' && payload.type !== 'CUSTOM') {
        prevIndex--;
        prevStep = WIZARD_STEPS[prevIndex];
      }
      
      hapticNavigation(); // Haptic feedback при переходе назад
      await goToStep(prevStep);
    }
  }, [currentStepIndex, goToStep, payload.type]);

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
          <div className="text-6xl mb-4">🎉</div>
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
            🤖 {t('success.openBot')}
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
            ← {t('header.backToMenu')}
          </button>
          <h1 className="text-lg font-semibold">🎁 {t('header.title')}</h1>
          <span className="text-xs text-tg-hint">
            {saving ? '💾...' : '✓'}
          </span>
        </div>

        {/* Progress */}
        <div className="flex gap-1 mb-6">
          {WIZARD_STEPS.map((step, i) => (
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
            {t('step', { current: currentStepIndex + 1, total: WIZARD_STEPS.length })}
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
          {/* Step 1: Type */}
          {currentStep === 'TYPE' && (
            <div className="space-y-4">
              {/* Mascot */}
              <div className="flex justify-center mb-4">
                <Mascot type="wizard-type" size={160} loop={true} autoplay={true} />
              </div>

              <div className="space-y-3">
              {(['STANDARD', 'BOOST_REQUIRED', 'INVITE_REQUIRED', 'CUSTOM'] as const).map((typeValue) => (
                <button
                  key={typeValue}
                  onClick={() => updatePayload({ type: typeValue as GiveawayDraftPayload['type'] })}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                    payload.type === typeValue
                      ? 'border-tg-button bg-tg-button/10'
                      : 'border-transparent bg-tg-bg'
                  }`}
                >
                  <div className="font-medium">{t(`types.${typeValue}.label`)}</div>
                  <div className="text-sm text-tg-hint mt-1">{t(`types.${typeValue}.desc`)}</div>
                </button>
              ))}
              </div>
            </div>
          )}

          {/* Step 2: Basics */}
          {currentStep === 'BASICS' && (
            <div className="space-y-4">
              {/* Mascot */}
              <div className="flex justify-center mb-4">
                <Mascot type="wizard-settings" size={160} loop={true} autoplay={true} />
              </div>

              <div>
                <label className="block text-sm text-tg-hint mb-1">{t('basics.title')} *</label>
                <input
                  type="text"
                  value={payload.title || ''}
                  onChange={(e) => updatePayload({ title: e.target.value })}
                  placeholder={t('basics.titlePlaceholder')}
                  className="w-full bg-tg-bg rounded-lg px-4 py-3 text-tg-text placeholder:text-tg-hint/50"
                />
              </div>

              <div>
                <label className="block text-sm text-tg-hint mb-1">{t('basics.language')}</label>
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
                <label className="block text-sm text-tg-hint mb-1">{t('basics.postTemplate')} *</label>
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
                            {selectedPost.mediaType !== 'NONE' ? (selectedPost.mediaType === 'PHOTO' ? '🖼️ ' : '🎬 ') : '📄 '}
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
                <label className="block text-sm text-tg-hint mb-1">{t('basics.buttonText')} *</label>
                <input
                  type="text"
                  value={payload.buttonText || ''}
                  onChange={(e) => updatePayload({ buttonText: e.target.value })}
                  placeholder={t('basics.buttonPlaceholder')}
                  className="w-full bg-tg-bg rounded-lg px-4 py-3 text-tg-text placeholder:text-tg-hint/50"
                />
              </div>

              {/* Описание приза (опционально) */}
              <div>
                <label className="block text-sm text-tg-hint mb-1">{t('basics.prizeDescription')}</label>
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
                <label className="block text-sm text-tg-hint mb-1">{t('basics.prizeDeliveryMethod')}</label>
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
            </div>
          )}

          {/* Step 3: Subscriptions */}
          {currentStep === 'SUBSCRIPTIONS' && (
            <div>
              {/* Mascot */}
              <div className="flex justify-center mb-4">
                <Mascot type="wizard-channels" size={160} loop={true} autoplay={true} />
              </div>

              <p className="text-sm text-tg-hint mb-4">
                {t('subscriptions.description')}
              </p>
              {channels.length === 0 ? (
                <p className="text-center text-tg-hint py-8">
                  {t('subscriptions.noChannels')}
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
                          {isSelected ? '✓' : ''}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {channel.type === 'CHANNEL' ? '📢' : '👥'} {channel.title}
                          </div>
                          {channel.username && (
                            <div className="text-xs text-tg-hint">@{channel.username}</div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 4: Publish Channels */}
          {currentStep === 'PUBLISH' && (
            <div>
              {/* Mascot */}
              <div className="flex justify-center mb-4">
                <Mascot type="wizard-publish" size={160} loop={true} autoplay={true} />
              </div>

              <p className="text-sm text-tg-hint mb-4">
                {t('publish.description')}
              </p>
              {channels.length === 0 ? (
                <p className="text-center text-tg-hint py-8">
                  {t('publish.noChannels')}
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
                          {isSelected ? '✓' : ''}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {channel.type === 'CHANNEL' ? '📢' : '👥'} {channel.title}
                          </div>
                          {channel.username && (
                            <div className="text-xs text-tg-hint">@{channel.username}</div>
                          )}
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
            </div>
          )}

          {/* Step 5: Results */}
          {currentStep === 'RESULTS' && (
            <div>
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
                        {isSelected ? '✓' : ''}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {channel.type === 'CHANNEL' ? '📢' : '👥'} {channel.title}
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
                      <div className="font-medium">{t('resultsStep.separatePosts')}</div>
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
                      <div className="font-medium">{t('resultsStep.editStartPost')}</div>
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
                      <div className="font-medium">{t('resultsStep.randomizer')}</div>
                      <div className="text-xs text-tg-hint">{t('resultsStep.randomizerHint')}</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Шаг 6: Даты */}
          {currentStep === 'DATES' && (
            <div className="space-y-4">
              {/* Mascot */}
              <div className="flex justify-center mb-4">
                <Mascot type="wizard-calendar" size={160} loop={true} autoplay={true} />
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
                <label className="block text-sm text-tg-hint mb-1">{t('dates.endDateTime')}</label>
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
                ⏰ {t('dates.timezoneHint')}
              </p>
            </div>
          )}

          {/* Шаг 7: Победители */}
          {currentStep === 'WINNERS' && (
            <div className="space-y-4">
              {/* Mascot */}
              <div className="flex justify-center mb-4">
                <Mascot type="wizard-winners" size={160} loop={true} autoplay={true} />
              </div>

              <div>
                <label className="block text-sm text-tg-hint mb-1">{t('winners.count')}:</label>
                <input
                  type="number"
                  min={1}
                  max={MAX_WINNERS_FREE}
                  value={payload.winnersCount || 1}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 1;
                    updatePayload({ winnersCount: Math.min(Math.max(1, val), MAX_WINNERS_FREE) });
                  }}
                  className="w-full bg-tg-bg rounded-lg px-4 py-3 text-tg-text text-center text-2xl font-bold"
                />
              </div>

              {/* Быстрый выбор */}
              <div className="flex gap-2 justify-center">
                {[1, 3, 5, 10].map(n => (
                  <button
                    key={n}
                    onClick={() => updatePayload({ winnersCount: n })}
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
                <p className="mb-1">🎲 {t('winners.randomHint')}</p>
                <p>📊 {t('winners.maxFree', { max: MAX_WINNERS_FREE })}</p>
              </div>

              {/* Минимальное количество участников */}
              <div className="border-t border-tg-bg pt-4 mt-4">
                <label className="block text-sm text-tg-hint mb-2">{t('winners.minParticipants')}</label>
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
            </div>
          )}

          {/* Шаг 8: Защита */}
          {currentStep === 'PROTECTION' && (
            <div className="space-y-6">
              {/* Mascot */}
              <div className="flex justify-center mb-4">
                <Mascot type="wizard-protection" size={160} loop={true} autoplay={true} />
              </div>

              {/* Блок Капча */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">🔒</span>
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
                        <span className="text-2xl">{modeValue === 'OFF' ? '🚫' : modeValue === 'SUSPICIOUS_ONLY' ? '⚠️' : '✅'}</span>
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
                          {payload.captchaMode === modeValue && '✓'}
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
                    <span className="text-2xl">📸</span>
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
                  💎 {t('protection.availableInPro')}
                </p>
              </div>
            </div>
          )}

          {/* Шаг 9: Дополнительные билеты */}
          {currentStep === 'EXTRAS' && (
            <div className="space-y-6">
              {/* Mascot */}
              <div className="flex justify-center mb-4">
                <Mascot type="wizard-invite" size={160} loop={true} autoplay={true} />
              </div>

              {/* Блок: Приглашение друзей */}
              <div className="bg-tg-bg rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">👥</span>
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
                    <span className="text-2xl">⚡</span>
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
                                {isSelected ? '✓' : ''}
                              </span>
                              <span className="truncate">📢 {channel.title}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {payload.boostEnabled && (payload.boostChannelIds || []).length === 0 && channels.filter(c => c.type === 'CHANNEL').length > 0 && (
                      <p className="text-xs text-yellow-600 mt-2">
                        ⚠️ {t('extras.selectAtLeastOneBoost')}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Блок: Сторис */}
              <div className="bg-tg-bg rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">📺</span>
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
                      ℹ️ {t('extras.storiesManualCheck')}
                    </p>
                    <p className="text-xs text-tg-hint mt-1">
                      {t('extras.moderationPage')}: <span className="font-mono">/creator/giveaway/[id]/stories</span>
                    </p>
                    <p className="text-xs text-yellow-600 mt-1">
                      ⚠️ {t('extras.storiesPremiumOnly')}
                    </p>
                  </div>
                )}
              </div>

              {/* Продвижение в каталоге — платная функция */}
              <div className="bg-tg-secondary rounded-xl p-4 relative overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">📣</span>
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
                    🔒 {t('extras.comingSoon')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Шаг 10: Маскот розыгрыша */}
          {currentStep === 'MASCOT' && (
            <div className="space-y-4">
              {/* Mascot */}
              <div className="flex justify-center mb-4">
                <Mascot type="wizard-mascot" size={160} loop={true} autoplay={true} />
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
                    <span className="text-xs">🎁 {t('mascot.free')}</span>
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
                        <span className="text-xs">
                          {isLocked ? '🔒' : '✨'} #{num}
                        </span>
                      </div>
                      {isLocked && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
                          <span className="text-2xl">🔒</span>
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
                    ⭐ {t('mascot.premiumHint')}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Шаг 11: Свои задания (только для CUSTOM) */}
          {currentStep === 'CUSTOM_TASKS' && payload.type === 'CUSTOM' && (
            <div className="space-y-4">
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
                        🗑️ {t('customTasks.remove')}
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
                      <span className="text-xs text-tg-hint">🎫</span>
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
                    ➕ {t('customTasks.addTask')}
                  </button>
                )}
              </div>

              {/* Подсказка */}
              <div className="bg-tg-bg rounded-lg p-3">
                <p className="text-xs text-tg-hint">
                  💡 {t('customTasks.hint')}
                </p>
              </div>
            </div>
          )}

          {/* Шаг 12: Проверка */}
          {currentStep === 'REVIEW' && (
            <div className="space-y-4">
              {/* Mascot */}
              <div className="flex justify-center mb-4">
                <Mascot type="wizard-review" size={160} loop={true} autoplay={true} />
              </div>

              <div className="bg-tg-bg rounded-lg p-3 space-y-2 text-sm">
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
                  <span>{payload.postTemplateId ? t('review.selected') : t('review.notSelected')}</span>
                </div>
              </div>

              {/* Даты */}
              <div className="bg-tg-bg rounded-lg p-3 space-y-2 text-sm">
                <div className="text-tg-hint text-xs font-medium mb-1">📆 {t('review.dates')}</div>
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
                <div className="text-tg-hint text-xs font-medium mb-1">🏆 {t('review.winners')}</div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">{t('review.count')}:</span>
                  <span className="font-medium">{payload.winnersCount || 1}</span>
                </div>
              </div>

              {/* Каналы */}
              <div className="bg-tg-bg rounded-lg p-3 space-y-2 text-sm">
                <div className="text-tg-hint text-xs font-medium mb-1">📣 {t('review.channels')}</div>
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
                <div className="text-tg-hint text-xs font-medium mb-1">🔒 {t('review.protection')}</div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">{t('review.captcha')}:</span>
                  <span>{t(`protection.captcha.${payload.captchaMode || 'SUSPICIOUS_ONLY'}.label`)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">Liveness Check:</span>
                  <span>{payload.livenessEnabled ? t('review.enabled') : t('review.disabled')}</span>
                </div>
              </div>

              {/* Дополнительные билеты */}
              <div className="bg-tg-bg rounded-lg p-3 space-y-2 text-sm">
                <div className="text-tg-hint text-xs font-medium mb-1">🎫 {t('review.extraTickets')}</div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">{t('review.invites')}:</span>
                  <span>
                    {payload.inviteEnabled 
                      ? `✅ ${t('review.upToFriends', { count: payload.inviteMax || 10 })}` 
                      : t('review.disabled')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">{t('review.boosts')}:</span>
                  <span>
                    {payload.boostEnabled 
                      ? `✅ ${t('review.channelsCount', { count: (payload.boostChannelIds || []).length })}` 
                      : t('review.disabled')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">{t('review.stories')}:</span>
                  <span>
                    {payload.storiesEnabled 
                      ? `✅ ${t('review.enabledManual')}` 
                      : t('review.disabled')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">{t('review.catalog')}:</span>
                  <span className="text-yellow-600">🔒 PRO</span>
                </div>
              </div>

              {/* Validation warnings */}
              {(!payload.type || !payload.title || !payload.buttonText || !payload.postTemplateId || (payload.publishChannelIds || []).length === 0) && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-sm text-yellow-600">
                  ⚠️ {t('review.fillRequired')}:
                  <ul className="list-disc list-inside mt-1">
                    {!payload.type && <li>{t('review.required.type')}</li>}
                    {!payload.title && <li>{t('review.required.title')}</li>}
                    {!payload.buttonText && <li>{t('review.required.buttonText')}</li>}
                    {!payload.postTemplateId && <li>{t('review.required.postTemplate')}</li>}
                    {(payload.publishChannelIds || []).length === 0 && <li>{t('review.required.publishChannel')}</li>}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex gap-3">
          {currentStepIndex > 0 && (
            <button
              onClick={goPrev}
              disabled={saving}
              className="flex-1 bg-tg-secondary text-tg-text rounded-lg py-3 font-medium"
            >
              ← {t('nav.back')}
            </button>
          )}
          
          {currentStep !== 'REVIEW' ? (
            <button
              onClick={goNext}
              disabled={saving}
              className="flex-1 bg-tg-button text-tg-button-text rounded-lg py-3 font-medium"
            >
              {t('nav.next')} →
            </button>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={confirming || !payload.type || !payload.title || !payload.buttonText || !payload.postTemplateId || (payload.publishChannelIds || []).length === 0}
              className="flex-1 bg-green-500 text-white rounded-lg py-3 font-medium disabled:opacity-50"
            >
              {confirming ? `⏳ ${t('nav.creating')}` : `✅ ${t('nav.create')}`}
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
      </div>
    </main>
  );
}
