'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
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

// Bot deep link for confirmation
const BOT_USERNAME = process.env.NEXT_PUBLIC_BOT_USERNAME || 'BeastRandomBot';

// Шаги wizard'а
const WIZARD_STEPS = ['TYPE', 'BASICS', 'SUBSCRIPTIONS', 'PUBLISH', 'RESULTS', 'DATES', 'WINNERS', 'PROTECTION', 'EXTRAS', 'REVIEW'] as const;
type WizardStep = (typeof WIZARD_STEPS)[number];

const STEP_LABELS: Record<WizardStep, string> = {
  TYPE: 'Тип',
  BASICS: 'Настройки',
  SUBSCRIPTIONS: 'Подписки',
  PUBLISH: 'Публикация',
  RESULTS: 'Итоги',
  DATES: 'Даты',
  WINNERS: 'Победители',
  PROTECTION: 'Защита',
  EXTRAS: 'Доп. билеты',
  REVIEW: 'Проверка',
};

// Лимиты для победителей (бесплатный аккаунт)
const MAX_WINNERS_FREE = 10;

// Лимиты для дополнительных билетов
const MAX_INVITES_FREE = 10;
const MAX_BOOST_CHANNELS = 5;

// Режимы капчи
const CAPTCHA_MODES = [
  { 
    value: 'OFF' as const, 
    label: 'Выключена', 
    icon: '🚫', 
    desc: 'Без проверки. Не рекомендуется.',
    recommended: false,
  },
  { 
    value: 'SUSPICIOUS_ONLY' as const, 
    label: 'Для подозрительных', 
    icon: '⚠️', 
    desc: 'Проверка только для подозрительных аккаунтов (новые, без фото и т.д.)',
    recommended: true,
  },
  { 
    value: 'ALL' as const, 
    label: 'Для всех', 
    icon: '✅', 
    desc: 'Обязательная проверка для всех участников',
    recommended: false,
  },
];

// Названия режимов капчи для отображения
const CAPTCHA_MODE_LABELS: Record<string, string> = {
  OFF: 'Выключена',
  SUSPICIOUS_ONLY: 'Для подозрительных',
  ALL: 'Для всех',
};

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

const GIVEAWAY_TYPES = [
  { value: 'STANDARD', label: '🎁 Стандартный', desc: 'Базовый розыгрыш с проверкой подписки' },
  { value: 'BOOST_REQUIRED', label: '🚀 С бустами', desc: 'Требует буст канала для участия' },
  { value: 'INVITE_REQUIRED', label: '👥 С инвайтами', desc: 'Бонусы за приглашение друзей' },
  { value: 'CUSTOM', label: '⚙️ Кастомный', desc: 'Гибкие условия и задания' },
] as const;

export default function GiveawayWizardPage() {
  const router = useRouter();
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
            buttonText: '🎁 Участвовать',
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
        setError('Не удалось загрузить данные');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

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
      await goToStep(WIZARD_STEPS[currentStepIndex + 1]);
    }
  }, [currentStepIndex, goToStep]);

  const goPrev = useCallback(async () => {
    if (currentStepIndex > 0) {
      await goToStep(WIZARD_STEPS[currentStepIndex - 1]);
    }
  }, [currentStepIndex, goToStep]);

  // Confirm giveaway
  const handleConfirm = useCallback(async () => {
    if (!draft) return;
    
    setConfirming(true);
    setError(null);
    
    try {
      const result = await confirmGiveaway(draft.id);
      
      if (result.ok && result.giveawayId) {
        // Store confirmed giveaway ID to show success screen
        setConfirmedGiveawayId(result.giveawayId);
      } else {
        // Build error message with details if available
        let errorMsg = result.error || 'Не удалось подтвердить розыгрыш';
        if (result.details && result.details.length > 0) {
          errorMsg = result.details.map(d => `• ${d.message}`).join('\n');
        }
        setError(errorMsg);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка подтверждения');
    } finally {
      setConfirming(false);
    }
  }, [draft]);

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
          <h1 className="text-2xl font-bold mb-2">Розыгрыш создан!</h1>
          <p className="text-tg-hint mb-6">
            Теперь подтвердите публикацию в боте. Вы сможете посмотреть превью и опубликовать розыгрыш в выбранные каналы.
          </p>
          
          <a
            href={botLink}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full bg-tg-button text-tg-button-text rounded-lg py-4 font-medium text-lg mb-4"
          >
            🤖 Открыть бота для подтверждения
          </a>
          
          <button
            onClick={() => router.push('/')}
            className="text-tg-hint text-sm underline"
          >
            Вернуться в меню
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
          <p className="text-tg-hint">Загрузка...</p>
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
            ← В меню
          </button>
          <h1 className="text-lg font-semibold">🎁 Новый розыгрыш</h1>
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
              title={STEP_LABELS[step]}
            />
          ))}
        </div>

        {/* Step Label */}
        <div className="text-center mb-6">
          <span className="text-xs text-tg-hint">
            Шаг {currentStepIndex + 1} из {WIZARD_STEPS.length}
          </span>
          <h2 className="text-xl font-semibold mt-1">{STEP_LABELS[currentStep]}</h2>
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
            <div className="space-y-3">
              {GIVEAWAY_TYPES.map(({ value, label, desc }) => (
                <button
                  key={value}
                  onClick={() => updatePayload({ type: value as GiveawayDraftPayload['type'] })}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                    payload.type === value
                      ? 'border-tg-button bg-tg-button/10'
                      : 'border-transparent bg-tg-bg'
                  }`}
                >
                  <div className="font-medium">{label}</div>
                  <div className="text-sm text-tg-hint mt-1">{desc}</div>
                </button>
              ))}
            </div>
          )}

          {/* Step 2: Basics */}
          {currentStep === 'BASICS' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-tg-hint mb-1">Название розыгрыша *</label>
                <input
                  type="text"
                  value={payload.title || ''}
                  onChange={(e) => updatePayload({ title: e.target.value })}
                  placeholder="Розыгрыш iPhone 15"
                  className="w-full bg-tg-bg rounded-lg px-4 py-3 text-tg-text placeholder:text-tg-hint/50"
                />
              </div>

              <div>
                <label className="block text-sm text-tg-hint mb-1">Язык</label>
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
                <label className="block text-sm text-tg-hint mb-1">Шаблон поста *</label>
                <select
                  value={payload.postTemplateId || ''}
                  onChange={(e) => updatePayload({ postTemplateId: e.target.value || null })}
                  className="w-full bg-tg-bg rounded-lg px-4 py-3 text-tg-text"
                >
                  <option value="">Выберите шаблон...</option>
                  {postTemplates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.mediaType !== 'NONE' ? (tpl.mediaType === 'PHOTO' ? '🖼️ ' : '🎬 ') : '📄 '}
                      {tpl.text.slice(0, 50)}...
                    </option>
                  ))}
                </select>
                {postTemplates.length === 0 && (
                  <p className="text-xs text-tg-hint mt-1">
                    Нет шаблонов. Создайте пост в боте → 📝 Посты
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm text-tg-hint mb-1">Текст кнопки *</label>
                <input
                  type="text"
                  value={payload.buttonText || ''}
                  onChange={(e) => updatePayload({ buttonText: e.target.value })}
                  placeholder="🎁 Участвовать"
                  className="w-full bg-tg-bg rounded-lg px-4 py-3 text-tg-text placeholder:text-tg-hint/50"
                />
              </div>
            </div>
          )}

          {/* Step 3: Subscriptions */}
          {currentStep === 'SUBSCRIPTIONS' && (
            <div>
              <p className="text-sm text-tg-hint mb-4">
                Выберите каналы, на которые участники должны подписаться:
              </p>
              {channels.length === 0 ? (
                <p className="text-center text-tg-hint py-8">
                  Нет каналов. Добавьте канал в боте → 📣 Мои каналы
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
              <p className="text-sm text-tg-hint mb-4">
                Выберите каналы для публикации розыгрыша (минимум 1):
              </p>
              {channels.length === 0 ? (
                <p className="text-center text-tg-hint py-8">
                  Нет каналов. Добавьте канал в боте → 📣 Мои каналы
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
                      Нет каналов, где бот является администратором
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 5: Results */}
          {currentStep === 'RESULTS' && (
            <div>
              <p className="text-sm text-tg-hint mb-4">
                Выберите каналы для публикации итогов:
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
                <label className="block text-sm text-tg-hint mb-3">Способ публикации итогов:</label>
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
                      <div className="font-medium">Отдельные посты</div>
                      <div className="text-xs text-tg-hint">Итоги будут опубликованы как новые сообщения</div>
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
                      <div className="font-medium">В стартовом посте</div>
                      <div className="text-xs text-tg-hint">Пост розыгрыша будет отредактирован</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Шаг 6: Даты */}
          {currentStep === 'DATES' && (
            <div className="space-y-4">
              {/* Тумблер "Начать сразу" */}
              <div className="flex items-center justify-between p-3 bg-tg-bg rounded-lg">
                <div>
                  <div className="font-medium">Начать сразу</div>
                  <div className="text-xs text-tg-hint">Розыгрыш стартует после подтверждения</div>
                </div>
                <button
                  onClick={() => updatePayload({ startAt: payload.startAt ? null : new Date().toISOString() })}
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
                  <label className="block text-sm text-tg-hint mb-1">Дата и время начала</label>
                  <input
                    type="datetime-local"
                    value={payload.startAt ? formatDateTimeLocal(payload.startAt) : ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        updatePayload({ startAt: new Date(e.target.value).toISOString() });
                      }
                    }}
                    min={getMinStartDateTime()}
                    className="w-full bg-tg-bg rounded-lg px-4 py-3 text-tg-text"
                  />
                </div>
              )}

              {/* Выбор даты окончания */}
              <div>
                <label className="block text-sm text-tg-hint mb-1">Дата и время окончания (опционально)</label>
                <input
                  type="datetime-local"
                  value={payload.endAt ? formatDateTimeLocal(payload.endAt) : ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      updatePayload({ endAt: new Date(e.target.value).toISOString() });
                    } else {
                      updatePayload({ endAt: null });
                    }
                  }}
                  min={getMinEndDateTime(payload.startAt)}
                  className="w-full bg-tg-bg rounded-lg px-4 py-3 text-tg-text"
                />
                {payload.endAt && (
                  <button
                    onClick={() => updatePayload({ endAt: null })}
                    className="text-xs text-tg-hint mt-1 underline"
                  >
                    Очистить дату окончания
                  </button>
                )}
              </div>

              <p className="text-xs text-tg-hint text-center">
                ⏰ Бот работает в Московском времени (GMT+3)
              </p>
            </div>
          )}

          {/* Шаг 7: Победители */}
          {currentStep === 'WINNERS' && (
            <div className="space-y-4">
              <div className="text-center mb-4">
                <span className="text-4xl">🏆</span>
                <h3 className="text-lg font-semibold mt-2">Количество победителей</h3>
              </div>

              <div>
                <label className="block text-sm text-tg-hint mb-1">Победителей:</label>
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
                <p className="mb-1">🎲 Победители будут выбраны случайным образом</p>
                <p>📊 Максимум для бесплатного аккаунта: <strong>{MAX_WINNERS_FREE}</strong></p>
              </div>
            </div>
          )}

          {/* Шаг 8: Защита */}
          {currentStep === 'PROTECTION' && (
            <div className="space-y-6">
              {/* Блок Капча */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">🔒</span>
                  <div>
                    <h3 className="font-semibold">Защита от ботов</h3>
                    <p className="text-xs text-tg-hint">Мы по умолчанию проверяем подозрительных пользователей</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {CAPTCHA_MODES.map((mode) => (
                    <button
                      key={mode.value}
                      onClick={() => updatePayload({ captchaMode: mode.value })}
                      className={`w-full text-left p-3 rounded-lg flex items-start gap-3 transition-all ${
                        payload.captchaMode === mode.value
                          ? 'bg-[#f2b6b6]/20 border-2 border-[#f2b6b6]'
                          : 'bg-tg-bg border-2 border-transparent hover:border-tg-secondary'
                      }`}
                    >
                      <span className="text-2xl">{mode.icon}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{mode.label}</span>
                          {mode.recommended && (
                            <span className="text-xs bg-green-500/20 text-green-600 px-2 py-0.5 rounded">
                              Рекомендуется
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-tg-hint mt-0.5">{mode.desc}</p>
                      </div>
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center ${
                        payload.captchaMode === mode.value
                          ? 'bg-[#f2b6b6] text-white'
                          : 'bg-tg-secondary'
                      }`}>
                        {payload.captchaMode === mode.value && '✓'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Блок Liveness Check */}
              <div className="border-t border-tg-bg pt-6">
                <div className="flex items-center justify-between p-4 bg-tg-bg rounded-lg">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">📸</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Liveness Check</span>
                        <span className="text-xs bg-purple-500/20 text-purple-600 px-2 py-0.5 rounded">
                          PRO
                        </span>
                      </div>
                      <p className="text-xs text-tg-hint mt-0.5">
                        Проверка участника с помощью камеры — защита близкая к 100%
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      // Показываем уведомление что это PRO фича
                      alert('🔒 Эта функция доступна в подписке PRO\n\nLiveness Check позволяет проверить что за экраном реальный человек, а не бот.');
                    }}
                    className="w-12 h-6 rounded-full bg-tg-secondary opacity-50 cursor-not-allowed relative"
                  >
                    <span className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full" />
                  </button>
                </div>
                <p className="text-xs text-tg-hint mt-2 text-center">
                  💎 Доступно в подписке PRO
                </p>
              </div>
            </div>
          )}

          {/* Шаг 9: Дополнительные билеты */}
          {currentStep === 'EXTRAS' && (
            <div className="space-y-6">
              <div className="text-center mb-4">
                <span className="text-4xl">🎫</span>
                <h3 className="text-lg font-semibold mt-2">Дополнительные билеты</h3>
                <p className="text-xs text-tg-hint mt-1">
                  Участники смогут увеличить свои шансы на победу
                </p>
              </div>

              {/* Блок: Приглашение друзей */}
              <div className="bg-tg-bg rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">👥</span>
                    <div>
                      <span className="font-medium">Приглашение друзей</span>
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
                  Пользователи смогут приглашать друзей и получать дополнительные билеты. Каждый приглашённый друг = +1 билет.
                </p>
                
                {payload.inviteEnabled && (
                  <div className="mt-3 pt-3 border-t border-tg-secondary">
                    <label className="block text-sm text-tg-hint mb-2">
                      Макс. количество приглашений на участника:
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
                      <span className="text-xs text-tg-hint">макс. {MAX_INVITES_FREE} для бесплатного аккаунта</span>
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
                      <span className="font-medium">Бусты каналов</span>
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
                  Участники смогут получить дополнительные билеты за буст каналов. Каждый буст = +1 билет (максимум 10 билетов).
                </p>
                
                {payload.boostEnabled && (
                  <div className="mt-3 pt-3 border-t border-tg-secondary">
                    <label className="block text-sm text-tg-hint mb-2">
                      Выберите каналы для буста (макс. {MAX_BOOST_CHANNELS}):
                    </label>
                    {channels.filter(c => c.type === 'CHANNEL').length === 0 ? (
                      <p className="text-xs text-tg-hint text-center py-2">
                        Нет каналов для буста. Добавьте канал в боте.
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
                        ⚠️ Выберите хотя бы один канал для бустов
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
                      <span className="font-medium">Постинг в сторис</span>
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
                  Участники получат дополнительный билет за публикацию розыгрыша в сторис.
                </p>
                {payload.storiesEnabled && (
                  <div className="mt-3 p-2 bg-blue-500/10 rounded-lg">
                    <p className="text-xs text-blue-600">
                      ℹ️ Требуется ручная проверка. Участник отправляет заявку, а вы проверяете его сторис и одобряете/отклоняете.
                    </p>
                    <p className="text-xs text-tg-hint mt-1">
                      Страница модерации: <span className="font-mono">/creator/giveaway/[id]/stories</span>
                    </p>
                    <p className="text-xs text-yellow-600 mt-1">
                      ⚠️ Постить сторис могут только пользователи с Telegram Premium.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Шаг 10: Проверка */}
          {currentStep === 'REVIEW' && (
            <div className="space-y-4">
              <div className="text-center mb-4">
                <span className="text-4xl">🎉</span>
                <h3 className="text-lg font-semibold mt-2">Проверьте данные</h3>
              </div>

              <div className="bg-tg-bg rounded-lg p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-tg-hint">Тип:</span>
                  <span>{GIVEAWAY_TYPES.find(t => t.value === payload.type)?.label || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">Название:</span>
                  <span className="truncate max-w-[200px]">{payload.title || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">Язык:</span>
                  <span>{payload.language?.toUpperCase() || 'RU'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">Кнопка:</span>
                  <span className="truncate max-w-[200px]">{payload.buttonText || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">Шаблон поста:</span>
                  <span>{payload.postTemplateId ? '✓ Выбран' : '❌ Не выбран'}</span>
                </div>
              </div>

              {/* Даты */}
              <div className="bg-tg-bg rounded-lg p-3 space-y-2 text-sm">
                <div className="text-tg-hint text-xs font-medium mb-1">📆 Даты</div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">Начало:</span>
                  <span>{payload.startAt ? formatDisplayDate(payload.startAt) : 'Сразу после подтверждения'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">Окончание:</span>
                  <span>{payload.endAt ? formatDisplayDate(payload.endAt) : 'Не указано'}</span>
                </div>
              </div>

              {/* Победители */}
              <div className="bg-tg-bg rounded-lg p-3 space-y-2 text-sm">
                <div className="text-tg-hint text-xs font-medium mb-1">🏆 Победители</div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">Количество:</span>
                  <span className="font-medium">{payload.winnersCount || 1}</span>
                </div>
              </div>

              {/* Каналы */}
              <div className="bg-tg-bg rounded-lg p-3 space-y-2 text-sm">
                <div className="text-tg-hint text-xs font-medium mb-1">📣 Каналы</div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">Подписок:</span>
                  <span>{(payload.requiredSubscriptionChannelIds || []).length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">Публикации:</span>
                  <span>{(payload.publishChannelIds || []).length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">Итогов:</span>
                  <span>{(payload.resultsChannelIds || []).length}</span>
                </div>
              </div>

              {/* Защита */}
              <div className="bg-tg-bg rounded-lg p-3 space-y-2 text-sm">
                <div className="text-tg-hint text-xs font-medium mb-1">🔒 Защита</div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">Капча:</span>
                  <span>{CAPTCHA_MODE_LABELS[payload.captchaMode || 'SUSPICIOUS_ONLY']}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">Liveness Check:</span>
                  <span>{payload.livenessEnabled ? '✅ Включена' : '❌ Выключена'}</span>
                </div>
              </div>

              {/* Дополнительные билеты */}
              <div className="bg-tg-bg rounded-lg p-3 space-y-2 text-sm">
                <div className="text-tg-hint text-xs font-medium mb-1">🎫 Дополнительные билеты</div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">Приглашения:</span>
                  <span>
                    {payload.inviteEnabled 
                      ? `✅ До ${payload.inviteMax || 10} друзей` 
                      : '❌ Выключено'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">Бусты:</span>
                  <span>
                    {payload.boostEnabled 
                      ? `✅ ${(payload.boostChannelIds || []).length} каналов` 
                      : '❌ Выключено'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">Сторис:</span>
                  <span>
                    {payload.storiesEnabled 
                      ? '✅ Включено (ручная модерация)' 
                      : '❌ Выключено'}
                  </span>
                </div>
              </div>

              {/* Validation warnings */}
              {(!payload.type || !payload.title || !payload.buttonText || !payload.postTemplateId || (payload.publishChannelIds || []).length === 0) && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-sm text-yellow-600">
                  ⚠️ Заполните обязательные поля:
                  <ul className="list-disc list-inside mt-1">
                    {!payload.type && <li>Тип розыгрыша</li>}
                    {!payload.title && <li>Название</li>}
                    {!payload.buttonText && <li>Текст кнопки</li>}
                    {!payload.postTemplateId && <li>Шаблон поста</li>}
                    {(payload.publishChannelIds || []).length === 0 && <li>Минимум 1 канал публикации</li>}
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
              ← Назад
            </button>
          )}
          
          {currentStep !== 'REVIEW' ? (
            <button
              onClick={goNext}
              disabled={saving}
              className="flex-1 bg-tg-button text-tg-button-text rounded-lg py-3 font-medium"
            >
              Далее →
            </button>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={confirming || !payload.type || !payload.title || !payload.buttonText || !payload.postTemplateId || (payload.publishChannelIds || []).length === 0}
              className="flex-1 bg-green-500 text-white rounded-lg py-3 font-medium disabled:opacity-50"
            >
              {confirming ? '⏳ Создание...' : '✅ Создать розыгрыш'}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
