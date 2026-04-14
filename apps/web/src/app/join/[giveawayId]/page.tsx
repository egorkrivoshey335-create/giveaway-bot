'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Script from 'next/script';
import { syncLocaleFromDb } from '@/hooks/useLocale';
import { CountdownTimer } from '@/components/ui/CountdownTimer';
import { ConfettiOverlay } from '@/components/ui/ConfettiOverlay';
import { Mascot } from '@/components/Mascot';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Tabs } from '@/components/ui/Tabs';
import {
  getPublicGiveaway,
  checkSubscription,
  joinGiveaway,
  generateCaptcha,
  verifyCaptcha,
  getCurrentUser,
  authenticateWithTelegram,
  getMyReferral,
  getMyInvites,
  getMyBoosts,
  verifyBoost,
  submitStory,
  getMyStoryRequest,
  getCustomTasks,
  completeCustomTask,
  getMyCustomTaskCompletions,
  uploadLivenessPhoto,
  PublicGiveaway,
  Participation,
  InvitedFriend,
  BoostChannel,
  StoryRequestStatus,
  CustomTask,
} from '@/lib/api';
import { AppIcon } from '@/components/AppIcon';

// Состояния экрана
type ScreenState = 
  | 'loading'
  | 'auth_required'
  | 'info'
  | 'check_subscription'
  | 'captcha'
  | 'liveness_upload'
  | 'success'
  | 'already_joined'
  | 'finished'
  | 'scheduled'
  | 'cancelled'
  | 'error';

// Название бота для ссылок
const BOT_USERNAME = process.env.NEXT_PUBLIC_BOT_USERNAME || 'BeastRandomBot';

/**
 * Форматирование оставшегося времени
 */
function formatTimeRemaining(endAt: string | null): string {
  if (!endAt) return '';
  
  const end = new Date(endAt);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  
  if (diff <= 0) return 'Завершён';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (days > 0) return `${days}д ${hours}ч`;
  if (hours > 0) return `${hours}ч ${minutes}м`;
  return `${minutes}м`;
}

export default function JoinGiveawayPage() {
  const params = useParams();
  const router = useRouter();
  const giveawayId = params.giveawayId as string;
  
  // Переводы
  const t = useTranslations('join');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');

  // State
  const [screen, setScreen] = useState<ScreenState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [giveaway, setGiveaway] = useState<PublicGiveaway | null>(null);
  const [participation, setParticipation] = useState<Participation | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Подписки
  const [subscriptionStatus, setSubscriptionStatus] = useState<
    Array<{ id: string; title: string; username: string | null; subscribed: boolean }>
  >([]);
  const [checkingSubscription, setCheckingSubscription] = useState(false);

  // Капча
  const [captchaQuestion, setCaptchaQuestion] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const [captchaPassed, setCaptchaPassed] = useState(false);

  // Turnstile
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReady, setTurnstileReady] = useState(false);
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetId = useRef<string | null>(null);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

  // Joining
  const [joining, setJoining] = useState(false);

  // Referrer (из URL)
  const [referrerUserId, setReferrerUserId] = useState<string | null>(null);

  // Реферальная система
  const [referralLink, setReferralLink] = useState<string>('');
  const [invitedCount, setInvitedCount] = useState(0);
  const [inviteMax, setInviteMax] = useState(10);
  const [invites, setInvites] = useState<InvitedFriend[]>([]);
  const [linkCopied, setLinkCopied] = useState(false);

  // Бусты каналов
  const [boostChannels, setBoostChannels] = useState<BoostChannel[]>([]);
  const [ticketsFromBoosts, setTicketsFromBoosts] = useState(0);
  const [verifyingBoost, setVerifyingBoost] = useState<string | null>(null);
  const [boostMessage, setBoostMessage] = useState<string | null>(null);

  // Сторис
  const [storyRequestStatus, setStoryRequestStatus] = useState<StoryRequestStatus | null>(null);
  const [storyRejectReason, setStoryRejectReason] = useState<string | null>(null);
  const [submittingStory, setSubmittingStory] = useState(false);
  const [storiesMessage, setStoriesMessage] = useState<string | null>(null);
  const [showStoriesInstructions, setShowStoriesInstructions] = useState(false);
  const [storyLinkCopied, setStoryLinkCopied] = useState(false);

  // Анимации
  const [showConfetti, setShowConfetti] = useState(false);

  // BottomSheet для "Увеличить шансы"
  const [showExtrasSheet, setShowExtrasSheet] = useState(false);
  const [activeExtrasTab, setActiveExtrasTab] = useState<'invites' | 'boosts' | 'stories' | 'tasks'>('invites');

  // Кастомные задания
  const [customTasks, setCustomTasks] = useState<CustomTask[]>([]);
  const [customTaskCompletions, setCustomTaskCompletions] = useState<Map<string, boolean>>(new Map());
  const [completingTask, setCompletingTask] = useState<string | null>(null);

  // Liveness check (10.19)
  const [livenessRequired, setLivenessRequired] = useState(false);
  const [livenessPhoto, setLivenessPhoto] = useState<File | null>(null);
  const [livenessUploading, setLivenessUploading] = useState(false);
  const [livenessStatus, setLivenessStatus] = useState<'idle' | 'pending' | 'approved' | 'rejected'>('idle');
  const [livenessMessage, setLivenessMessage] = useState<string | null>(null);

  // Авторизация и загрузка данных
  useEffect(() => {
    async function init() {
      try {
        // Проверяем авторизацию
        const userRes = await getCurrentUser();
        
        if (!userRes.ok || !userRes.id) {
          const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp;
          
          if (tg?.initData) {
            const authRes = await authenticateWithTelegram(tg.initData);
            if (!authRes.ok) {
              setScreen('auth_required');
              return;
            }
            const freshUser = await getCurrentUser();
            if (freshUser.ok && freshUser.language) {
              syncLocaleFromDb(freshUser.language);
            }
          } else {
            setScreen('auth_required');
            return;
          }
        } else if (userRes.language) {
          syncLocaleFromDb(userRes.language);
        }
        
        setIsAuthenticated(true);

        // Парсим referrer из URL
        const urlParams = new URLSearchParams(window.location.search);
        const ref = urlParams.get('ref');
        if (ref) {
          setReferrerUserId(ref);
        }

        // Загружаем информацию о розыгрыше
        const res = await getPublicGiveaway(giveawayId);

        if (!res.ok || !res.giveaway) {
          setError(res.error || tErrors('giveawayNotFound'));
          setScreen('error');
          return;
        }

        setGiveaway(res.giveaway);

        // Проверяем статус
        if (res.giveaway.status === 'FINISHED') {
          setScreen('finished');
          return;
        }

        if (res.giveaway.status === 'SCHEDULED') {
          setScreen('scheduled');
          return;
        }

        if (res.giveaway.status === 'CANCELLED') {
          setScreen('cancelled');
          return;
        }

        if (res.giveaway.status !== 'ACTIVE') {
          setError(tErrors('giveawayNotFound'));
          setScreen('error');
          return;
        }

        // Проверяем участие
        if (res.participation) {
          setParticipation(res.participation);
          // Загружаем реферальные данные и бусты
          await Promise.all([loadReferralData(), loadBoostData(), loadStoryRequestStatus()]);
          setScreen('already_joined');
          return;
        }

        // Показываем информацию
        setScreen('info');
      } catch (err) {
        console.error('Init error:', err);
        setError(tErrors('loadFailed'));
        setScreen('error');
      }
    }

    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [giveawayId, tErrors]);

  // Загрузка реферальных данных
  const loadReferralData = useCallback(async () => {
    try {
      // Загружаем реферальную ссылку и статистику
      const referralRes = await getMyReferral(giveawayId);
      if (referralRes.ok) {
        setReferralLink(referralRes.referralLink || '');
        setInvitedCount(referralRes.invitedCount || 0);
        setInviteMax(referralRes.inviteMax || 10);
      }

      // Загружаем список приглашённых
      const invitesRes = await getMyInvites(giveawayId);
      if (invitesRes.ok && invitesRes.invites) {
        setInvites(invitesRes.invites);
      }
    } catch (err) {
      console.error('Failed to load referral data:', err);
    }
  }, [giveawayId]);

  // Загрузка данных о бустах
  const loadBoostData = useCallback(async () => {
    try {
      const res = await getMyBoosts(giveawayId);
      if (res.ok) {
        setBoostChannels(res.channels || []);
        setTicketsFromBoosts(res.ticketsFromBoosts || 0);
      }
    } catch (err) {
      console.error('Failed to load boost data:', err);
    }
  }, [giveawayId]);

  // Проверка буста для канала
  const handleVerifyBoost = useCallback(async (channelId: string) => {
    setVerifyingBoost(channelId);
    setBoostMessage(null);

    try {
      const res = await verifyBoost(giveawayId, channelId);
      
      if (res.ok) {
        if (res.newBoosts && res.newBoosts > 0) {
          setBoostMessage(t('extras.boostSuccess', { tickets: res.ticketsAdded ?? 0 }));
          // Перезагружаем данные о бустах
          await loadBoostData();
        } else {
          setBoostMessage(t('extras.boostNotFound'));
        }
      } else {
        setBoostMessage(res.error || tErrors('error'));
      }
    } catch (err) {
      console.error('Verify boost error:', err);
      setBoostMessage(tErrors('error'));
    } finally {
      setVerifyingBoost(null);
      // Скрыть сообщение через 3 секунды
      setTimeout(() => setBoostMessage(null), 3000);
    }
  }, [giveawayId, loadBoostData, t, tErrors]);

  // Открыть страницу буста канала
  const openBoostLink = useCallback((channel: BoostChannel) => {
    if (!channel.username) return;
    
    const boostUrl = `https://t.me/${channel.username.replace('@', '')}?boost`;
    
    // Используем Telegram WebApp API если доступен
    const tg = (window as unknown as { Telegram?: { WebApp?: { openTelegramLink?: (url: string) => void } } }).Telegram?.WebApp;
    
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(boostUrl);
    } else {
      window.open(boostUrl, '_blank');
    }
  }, []);

  // Загрузить статус заявки на сторис
  const loadStoryRequestStatus = useCallback(async () => {
    try {
      const res = await getMyStoryRequest(giveawayId);
      if (res.ok && res.hasRequest) {
        setStoryRequestStatus(res.status || null);
        setStoryRejectReason(res.rejectReason || null);
      } else {
        setStoryRequestStatus(null);
        setStoryRejectReason(null);
      }
    } catch (err) {
      console.error('Failed to load story request status:', err);
    }
  }, [giveawayId]);

  // Загрузить кастомные задания
  const loadCustomTasks = useCallback(async () => {
    try {
      const [tasksRes, completionsRes] = await Promise.all([
        getCustomTasks(giveawayId),
        getMyCustomTaskCompletions(giveawayId),
      ]);

      if (tasksRes.ok && tasksRes.tasks) {
        setCustomTasks(tasksRes.tasks);
      }

      if (completionsRes.ok && completionsRes.completions) {
        const completionsMap = new Map<string, boolean>();
        completionsRes.completions.forEach((c) => {
          completionsMap.set(c.taskId, c.completed);
        });
        setCustomTaskCompletions(completionsMap);
      }
    } catch (err) {
      console.error('Failed to load custom tasks:', err);
    }
  }, [giveawayId]);

  // Выполнить кастомное задание
  const handleCompleteCustomTask = useCallback(async (taskId: string, linkUrl: string) => {
    // Открываем ссылку
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
      (window as any).Telegram.WebApp.openLink(linkUrl);
    } else {
      window.open(linkUrl, '_blank');
    }

    // Отмечаем задание как выполненное
    setCompletingTask(taskId);
    try {
      const res = await completeCustomTask(giveawayId, taskId);
      if (res.ok && res.completed) {
        setCustomTaskCompletions((prev) => {
          const next = new Map(prev);
          next.set(taskId, true);
          return next;
        });
        // Обновляем данные участия
        await loadCustomTasks();
      }
    } catch (err) {
      console.error('Failed to complete custom task:', err);
    } finally {
      setCompletingTask(null);
    }
  }, [giveawayId, loadCustomTasks]);

  // Получить ссылку для сторис
  const getStoryLink = useCallback(() => {
    return `https://t.me/${BOT_USERNAME}/participate?startapp=join_${giveawayId}`;
  }, [giveawayId]);

  // Скопировать ссылку для сторис
  const handleCopyStoryLink = useCallback(() => {
    const link = getStoryLink();
    navigator.clipboard.writeText(link);
    setStoryLinkCopied(true);
    setTimeout(() => setStoryLinkCopied(false), 2000);
  }, [getStoryLink]);

  // Отправить заявку на проверку сторис
  const handleSubmitStory = useCallback(async () => {
    setSubmittingStory(true);
    setStoriesMessage(null);

    try {
      const res = await submitStory(giveawayId);
      
      if (res.ok) {
        setStoryRequestStatus('PENDING');
        setStoriesMessage(t('extras.storySubmitted'));
        setShowStoriesInstructions(false);
      } else if (res.error === 'ALREADY_PENDING') {
        setStoryRequestStatus('PENDING');
        setStoriesMessage(t('extras.storyAlreadyPending'));
      } else if (res.error === 'ALREADY_APPROVED') {
        setStoryRequestStatus('APPROVED');
        setStoriesMessage(t('extras.storyAlreadyApproved'));
      } else {
        setStoriesMessage(res.message || tErrors('error'));
      }
    } catch (err) {
      console.error('Submit story error:', err);
      setStoriesMessage(tErrors('error'));
    } finally {
      setSubmittingStory(false);
      setTimeout(() => setStoriesMessage(null), 3000);
    }
  }, [giveawayId, t, tErrors]);

  // Проверка подписок
  const handleCheckSubscription = useCallback(async () => {
    if (!giveaway) return;

    setCheckingSubscription(true);

    try {
      const res = await checkSubscription(giveawayId);

      if (!res.ok) {
        setError(res.error || tErrors('subscriptionRequired'));
        return;
      }

      setSubscriptionStatus(res.channels || []);

      if (res.subscribed) {
        // Все подписки выполнены - переходим к капче или участию
        if (giveaway.conditions.captchaMode !== 'OFF') {
          await loadCaptcha();
          setScreen('captcha');
        } else {
          await handleJoin(true);
        }
      }
    } catch (err) {
      console.error('Check subscription error:', err);
      setError(tErrors('subscriptionRequired'));
    } finally {
      setCheckingSubscription(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [giveaway, giveawayId, tErrors]);

  // Загрузка капчи
  const loadCaptcha = useCallback(async () => {
    try {
      const res = await generateCaptcha();
      if (res.ok && res.question && res.token) {
        setCaptchaQuestion(res.question);
        setCaptchaToken(res.token);
        setCaptchaAnswer('');
        setCaptchaError(null);
      }
    } catch (err) {
      console.error('Load captcha error:', err);
    }
  }, []);

  // Render Turnstile widget when captcha screen is shown and captchaMode is ALL
  const renderTurnstile = useCallback(() => {
    if (!turnstileSiteKey || !turnstileContainerRef.current || turnstileWidgetId.current) return;
    const w = window as any;
    if (!w.turnstile) return;

    turnstileWidgetId.current = w.turnstile.render(turnstileContainerRef.current, {
      sitekey: turnstileSiteKey,
      theme: 'light',
      callback: (token: string) => {
        setTurnstileToken(token);
      },
      'expired-callback': () => {
        setTurnstileToken(null);
      },
      'error-callback': () => {
        setTurnstileToken(null);
        turnstileWidgetId.current = null;
      },
    });
  }, [turnstileSiteKey]);

  useEffect(() => {
    if (screen === 'captcha' && giveaway?.conditions.captchaMode === 'ALL' && turnstileSiteKey && turnstileReady) {
      renderTurnstile();
    }
    return () => {
      if (turnstileWidgetId.current) {
        const w = window as any;
        if (w.turnstile) {
          try { w.turnstile.remove(turnstileWidgetId.current); } catch {}
        }
        turnstileWidgetId.current = null;
      }
    };
  }, [screen, giveaway?.conditions.captchaMode, turnstileSiteKey, turnstileReady, renderTurnstile]);

  // Проверка капчи
  const handleVerifyCaptcha = useCallback(async () => {
    const answer = parseInt(captchaAnswer, 10);
    if (isNaN(answer)) {
      setCaptchaError(t('captcha.invalidNumber'));
      return;
    }

    // For ALL mode: require Turnstile
    if (giveaway?.conditions.captchaMode === 'ALL' && turnstileSiteKey && !turnstileToken) {
      setCaptchaError(t('captcha.turnstileRequired'));
      return;
    }

    try {
      const res = await verifyCaptcha(captchaToken, answer);
      if (res.ok) {
        setCaptchaPassed(true);
        await handleJoin(true);
      } else {
        setCaptchaError(res.error || t('captcha.wrong'));
        await loadCaptcha();
      }
    } catch (err) {
      console.error('Verify captcha error:', err);
      setCaptchaError(tErrors('error'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captchaAnswer, captchaToken, giveaway?.conditions.captchaMode, turnstileSiteKey, turnstileToken, loadCaptcha, t, tErrors]);

  // Участие в розыгрыше
  const handleJoin = useCallback(async (withCaptcha: boolean) => {
    setJoining(true);

    try {
      const res = await joinGiveaway(giveawayId, {
        captchaPassed: withCaptcha || captchaPassed,
        turnstileToken: turnstileToken || undefined,
        referrerUserId: referrerUserId || undefined,
        sourceTag: 'mini_app',
      });

      if (res.ok && res.participation) {
        setParticipation(res.participation);
        // Загружаем реферальные данные, бусты и кастомные задания
        await Promise.all([loadReferralData(), loadBoostData(), loadStoryRequestStatus(), loadCustomTasks()]);
        // 10.19 Liveness: если требуется — сначала показываем экран загрузки фото
        if (res.livenessRequired) {
          setLivenessRequired(true);
          setScreen('liveness_upload');
        } else {
          setScreen('success');
          // Запускаем конфетти при успешном участии
          setShowConfetti(true);
        }
      } else if (res.code === 'SUBSCRIPTION_REQUIRED') {
        setError(res.error || tErrors('subscriptionRequired'));
        setScreen('check_subscription');
      } else if (res.code === 'CAPTCHA_REQUIRED') {
        await loadCaptcha();
        setScreen('captcha');
      } else if (res.code === 'TURNSTILE_REQUIRED' || res.code === 'TURNSTILE_FAILED') {
        await loadCaptcha();
        setScreen('captcha');
        setCaptchaError(t('captcha.turnstileRequired'));
      } else {
        setError(res.error || tErrors('error'));
      }
    } catch (err) {
      console.error('Join error:', err);
      setError(tErrors('error'));
    } finally {
      setJoining(false);
    }
  }, [giveawayId, captchaPassed, turnstileToken, referrerUserId, loadCaptcha, loadReferralData, loadBoostData, loadStoryRequestStatus, loadCustomTasks, t, tErrors]);

  // Начать участие (кнопка)
  const handleStartParticipation = useCallback(() => {
    if (!giveaway) return;

    // Если есть обязательные подписки - проверяем
    if (giveaway.conditions.requiredSubscriptions.length > 0) {
      setScreen('check_subscription');
      handleCheckSubscription();
    } else if (giveaway.conditions.captchaMode !== 'OFF') {
      // Если есть капча - показываем
      loadCaptcha();
      setScreen('captcha');
    } else {
      // Иначе сразу участвуем
      handleJoin(false);
    }
  }, [giveaway, handleCheckSubscription, loadCaptcha, handleJoin]);

  // Копирование реферальной ссылки
  const handleCopyLink = useCallback(async () => {
    if (!referralLink) return;
    
    try {
      await navigator.clipboard.writeText(referralLink);
      setLinkCopied(true);
      // Сбросить через 2 секунды
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [referralLink]);

  // Поделиться в Telegram
  const handleShareToTelegram = useCallback(() => {
    if (!referralLink || !giveaway) return;
    
    const text = `Участвуй в розыгрыше "${giveaway.title}"! 🎁`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(text)}`;
    
    // Используем Telegram WebApp API если доступен
    const tg = (window as unknown as { Telegram?: { WebApp?: { openTelegramLink?: (url: string) => void } } }).Telegram?.WebApp;
    
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(shareUrl);
    } else {
      window.open(shareUrl, '_blank');
    }
  }, [referralLink, giveaway]);

  // ========== RENDER ==========

  // Загрузка
  if (screen === 'loading') {
    return (
      <main className="min-h-screen p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-3 border-tg-button border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-tg-hint">{tCommon('loading')}</p>
        </div>
      </main>
    );
  }

  // Требуется авторизация
  if (screen === 'auth_required') {
    return (
      <main className="min-h-screen p-4 flex items-center justify-center">
        <div className="max-w-md w-full text-center">
          <div className="text-6xl mb-4"><AppIcon name="icon-lock" size={14} /></div>
          <h1 className="text-xl font-bold mb-2">{t('auth.title')}</h1>
          <p className="text-tg-hint mb-6">
            {t('auth.description')}
          </p>
          <a
            href={`https://t.me/${BOT_USERNAME}/participate?startapp=join_${giveawayId}`}
            className="block bg-tg-button text-tg-button-text rounded-lg py-3 font-medium"
          >
            {t('auth.openInTelegram')}
          </a>
        </div>
      </main>
    );
  }

  // Ошибка
  if (screen === 'error') {
    return (
      <main className="min-h-screen p-4 flex items-center justify-center">
        <div className="max-w-md w-full text-center">
          <div className="flex justify-center mb-2">
            <Mascot type="state-error" size={120} loop autoplay />
          </div>
          <h1 className="text-xl font-bold mb-2">{t('error.title')}</h1>
          <p className="text-tg-hint mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="bg-tg-secondary text-tg-text rounded-lg px-6 py-3"
          >
            {t('error.goHome')}
          </button>
        </div>
      </main>
    );
  }

  // Розыгрыш завершён
  if (screen === 'finished') {
    return (
      <main className="min-h-screen p-4 flex items-center justify-center">
        <div className="max-w-md w-full text-center">
          <div className="flex justify-center mb-2">
            <Mascot type="state-empty" size={120} loop autoplay />
          </div>
          <h1 className="text-xl font-bold mb-2">{t('finished.title')}</h1>
          <p className="text-tg-hint mb-6">
            {giveaway?.title}
          </p>
          <button
            onClick={() => router.push('/')}
            className="bg-tg-secondary text-tg-text rounded-lg px-6 py-3"
          >
            {t('finished.goHome')}
          </button>
        </div>
      </main>
    );
  }

  // Розыгрыш ещё не начался (SCHEDULED)
  if (screen === 'scheduled' && giveaway) {
    const startDate = giveaway.startAt ? new Date(giveaway.startAt) : null;
    
    return (
      <main className="min-h-screen p-4 flex items-center justify-center">
        <div className="max-w-md w-full text-center">
          {/* Маскот ожидания */}
          {giveaway.mascotType && (
            <div className="mb-4 flex justify-center">
              <Mascot 
                type={giveaway.mascotType as any} 
                size={120}
                className="mx-auto"
              />
            </div>
          )}
          
          <div className="text-6xl mb-4">⏳</div>
          <h1 className="text-xl font-bold mb-2">{t('scheduled.title')}</h1>
          <p className="text-tg-hint mb-4">
            {giveaway.title}
          </p>
          
          {/* Дата начала */}
          {startDate && (
            <div className="bg-tg-secondary rounded-xl p-4 mb-6">
              <div className="text-sm text-tg-hint mb-2">{t('scheduled.startsAt')}</div>
              <div className="text-lg font-semibold">
                {startDate.toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
          )}
          
          <p className="text-sm text-tg-hint mb-6">
            {t('scheduled.description')}
          </p>
          
          {/* TODO: Кнопка "Напомнить" требует Block 14 (Reminders) */}
          <button
            onClick={() => {
              // TODO: Интеграция с Block 14 для уведомлений
              alert('Напоминание о начале розыгрыша будет реализовано в Block 14');
            }}
            className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg py-3 mb-3 font-medium"
          >
            🔔 {t('scheduled.remindMe')}
          </button>
          
          <button
            onClick={() => router.push('/')}
            className="w-full bg-tg-secondary text-tg-text rounded-lg py-3"
          >
            {t('scheduled.goHome')}
          </button>
        </div>
      </main>
    );
  }

  // Розыгрыш отменён (CANCELLED)
  if (screen === 'cancelled' && giveaway) {
    return (
      <main className="min-h-screen p-4 flex items-center justify-center">
        <div className="max-w-md w-full text-center">
          {/* Грустный маскот */}
          {giveaway.mascotType && (
            <div className="mb-4 flex justify-center">
              <Mascot 
                type={giveaway.mascotType as any} 
                size={120}
                className="mx-auto"
              />
            </div>
          )}
          
          <div className="text-6xl mb-4"><AppIcon name="icon-error" size={14} /></div>
          <h1 className="text-xl font-bold mb-2">{t('cancelled.title')}</h1>
          <p className="text-tg-hint mb-6">
            {giveaway.title}
          </p>
          <p className="text-sm text-tg-hint mb-6">
            {t('cancelled.description')}
          </p>
          <button
            onClick={() => router.push('/catalog')}
            className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg py-3 mb-3 font-medium"
          >
            <AppIcon name="icon-giveaway" size={16} /> {t('cancelled.moreCatalog')}
          </button>
          <button
            onClick={() => router.push('/')}
            className="w-full bg-tg-secondary text-tg-text rounded-lg py-3"
          >
            {t('cancelled.goHome')}
          </button>
        </div>
      </main>
    );
  }

  // Информация о розыгрыше
  if (screen === 'info' && giveaway) {
    return (
      <main className="min-h-screen p-4">
        <div className="max-w-md mx-auto">
          {/* Заголовок */}
          <div className="text-center mb-6">
            <div className="flex justify-center mb-2">
              <Mascot type="state-loading" size={150} loop autoplay />
            </div>
            <h1 className="text-xl font-bold">{giveaway.title}</h1>
          </div>

          {/* Сообщение о приглашении */}
          {referrerUserId && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-4 text-center">
              <span className="text-blue-600">👋 {t('info.invitedByFriend')}</span>
            </div>
          )}

          {/* Статистика */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-tg-secondary rounded-lg p-3 text-center">
              <div className="text-2xl font-bold">{giveaway.participantsCount}</div>
              <div className="text-xs text-tg-hint">{t('info.participants')}</div>
            </div>
            <div className="bg-tg-secondary rounded-lg p-3 text-center">
              <div className="text-2xl font-bold">{giveaway.winnersCount}</div>
              <div className="text-xs text-tg-hint">{t('info.winners')}</div>
            </div>
            <div className="bg-tg-secondary rounded-lg p-3 text-center">
              <div className="text-2xl font-bold">{formatTimeRemaining(giveaway.endAt)}</div>
              <div className="text-xs text-tg-hint">{t('info.timeLeft')}</div>
            </div>
          </div>

          {/* Условия */}
          {giveaway.conditions.requiredSubscriptions.length > 0 && (
            <div className="bg-tg-secondary rounded-lg p-4 mb-4">
              <h2 className="font-medium mb-3"><AppIcon name="icon-channel" size={14} /> {t('info.conditions')}:</h2>
              <div className="space-y-2">
                {giveaway.conditions.requiredSubscriptions.map((channel) => (
                  <a
                    key={channel.id}
                    href={channel.username ? `https://t.me/${channel.username.replace('@', '')}` : '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-2 bg-tg-bg rounded-lg"
                  >
                    <span className="text-lg"><AppIcon name="icon-channel" size={14} /></span>
                    <span className="flex-1">{channel.title}</span>
                    <span className="text-xs text-tg-hint">{channel.username}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Описание */}
          {giveaway.postTemplate && (
            <div className="bg-tg-secondary rounded-lg p-4 mb-6">
              <h2 className="font-medium mb-2"><AppIcon name="icon-edit" size={14} /> {t('info.aboutGiveaway')}:</h2>
              <p className="text-sm text-tg-hint whitespace-pre-wrap line-clamp-5">
                {giveaway.postTemplate.text}
              </p>
            </div>
          )}

          {/* Кнопка участия */}
          <button
            onClick={handleStartParticipation}
            disabled={joining}
            className="w-full bg-tg-button text-tg-button-text rounded-lg py-4 font-medium text-lg disabled:opacity-50"
          >
            {joining ? tCommon('loading') : giveaway.buttonText || t('info.buttonText')}
          </button>
        </div>
      </main>
    );
  }

  // Проверка подписок
  if (screen === 'check_subscription' && giveaway) {
    return (
      <main className="min-h-screen p-4">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-6">
            <div className="flex justify-center mb-2">
              <Mascot type="state-locked" size={120} loop autoplay />
            </div>
            <h1 className="text-xl font-bold">{t('checkSubscription.title')}</h1>
            <p className="text-tg-hint mt-2">{t('checkSubscription.description')}</p>
          </div>

          {/* Список каналов */}
          <div className="space-y-3 mb-6">
            {(subscriptionStatus.length > 0 ? subscriptionStatus : giveaway.conditions.requiredSubscriptions.map(c => ({ ...c, subscribed: false }))).map((channel) => (
              <div
                key={channel.id}
                className={`p-4 rounded-lg flex items-center gap-3 ${
                  channel.subscribed ? 'bg-green-500/10 border border-green-500/30' : 'bg-tg-secondary'
                }`}
              >
                <span className="text-2xl">{channel.subscribed ? <AppIcon name="icon-success" size={14} /> : <AppIcon name="icon-channel" size={14} />}</span>
                <div className="flex-1">
                  <div className="font-medium">{channel.title}</div>
                  {channel.username && (
                    <div className="text-xs text-tg-hint">{channel.username}</div>
                  )}
                </div>
                {!channel.subscribed && (
                  <a
                    href={channel.username ? `https://t.me/${channel.username.replace('@', '')}` : '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-tg-button text-tg-button-text text-sm px-3 py-1.5 rounded-lg"
                  >
                    {t('checkSubscription.subscribe')}
                  </a>
                )}
              </div>
            ))}
          </div>

          {/* Кнопка проверки */}
          <button
            onClick={handleCheckSubscription}
            disabled={checkingSubscription}
            className="w-full bg-tg-button text-tg-button-text rounded-lg py-4 font-medium disabled:opacity-50"
          >
            {checkingSubscription ? <>⏳ {tCommon('loading')}</> : <><AppIcon name="icon-refresh" size={14} /> {t('checkSubscription.checkButton')}</>}
          </button>
        </div>
      </main>
    );
  }

  // Капча
  if (screen === 'captcha') {
    const showTurnstile = giveaway?.conditions.captchaMode === 'ALL' && !!turnstileSiteKey;
    const canSubmit = !!captchaAnswer && (!showTurnstile || !!turnstileToken);

    return (
      <main className="min-h-screen p-4">
        {showTurnstile && (
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            onReady={() => setTurnstileReady(true)}
          />
        )}
        <div className="max-w-md mx-auto">
          <div className="text-center mb-6">
            <div className="flex justify-center mb-2">
              <Mascot type="state-captcha" size={120} loop autoplay />
            </div>
            <h1 className="text-xl font-bold">{t('captcha.title')}</h1>
            <p className="text-tg-hint mt-2">
              {showTurnstile ? t('captcha.descriptionEnhanced') : t('captcha.description')}
            </p>
          </div>

          <div className="bg-tg-secondary rounded-lg p-6 mb-4 text-center">
            <div className="text-3xl font-mono mb-4">{captchaQuestion}</div>
            <input
              type="number"
              inputMode="numeric"
              value={captchaAnswer}
              onChange={(e) => setCaptchaAnswer(e.target.value)}
              placeholder={t('captcha.placeholder')}
              className="w-full bg-tg-bg rounded-lg px-4 py-3 text-center text-2xl"
              autoFocus
            />
          </div>

          {showTurnstile && (
            <div className="flex justify-center mb-4">
              <div ref={turnstileContainerRef} />
            </div>
          )}

          {captchaError && (
            <p className="text-red-500 text-sm text-center mb-4">{captchaError}</p>
          )}

          <button
            onClick={handleVerifyCaptcha}
            disabled={!canSubmit || joining}
            className="w-full bg-tg-button text-tg-button-text rounded-lg py-4 font-medium disabled:opacity-50"
          >
            {joining ? <>⏳ {tCommon('loading')}</> : <><AppIcon name="icon-success" size={14} /> {t('captcha.checkButton')}</>}
          </button>
        </div>
      </main>
    );
  }

  // Успех
  if (screen === 'success' && participation) {
    return (
      <main className="min-h-screen p-4">
        {/* Конфетти при успешном участии */}
        <ConfettiOverlay trigger={showConfetti} />
        
        <div className="max-w-md mx-auto">
          {/* Заголовок с маскотом и таймером */}
          <div className="text-center mb-6">
            {/* Маскот розыгрыша */}
            {giveaway?.mascotType && (
              <div className="mb-4 flex justify-center">
                <Mascot 
                  type={giveaway.mascotType as any} 
                  size={120}
                  className="mx-auto"
                />
              </div>
            )}
            
            <h1 className="text-2xl font-bold mb-2">{t('success.title')}</h1>
            <p className="text-tg-hint mb-4">{t('success.subtitle')}</p>
            
            {/* Таймер до окончания розыгрыша */}
            {giveaway && giveaway.endAt && (
              <div className="bg-tg-secondary-bg rounded-xl p-4 mb-4">
                <div className="text-sm text-tg-hint mb-2">{t('success.endsIn')}</div>
                <CountdownTimer 
                  endDate={giveaway.endAt} 
                  className="text-lg font-semibold"
                />
              </div>
            )}
          </div>

          {/* Сообщение о приглашении */}
          {referrerUserId && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 mb-4 text-center">
              <span className="text-green-600">👋 {t('info.invitedByFriend')}</span>
            </div>
          )}

          {/* ID розыгрыша и кнопка шаринга */}
          {giveaway && (
            <div className="bg-tg-secondary rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="text-xs text-tg-hint mb-1">{t('success.giveawayId')}</div>
                  <div className="text-sm font-mono truncate">#{giveawayId.slice(0, 8)}</div>
                </div>
                <button
                  onClick={() => {
                    const shareText = `🎁 Участвуйте в розыгрыше "${giveaway.title}"!`;
                    const shareUrl = `https://t.me/share/url?url=https://t.me/${BOT_USERNAME}/participate?startapp=join_${giveawayId}&text=${encodeURIComponent(shareText)}`;
                    
                    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
                      (window as any).Telegram.WebApp.openTelegramLink(shareUrl);
                    } else {
                      window.open(shareUrl, '_blank');
                    }
                  }}
                  className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 hover:opacity-90"
                >
                  <span>📤</span>
                  <span>{t('success.shareGiveaway')}</span>
                </button>
              </div>
            </div>
          )}

          {/* Билеты */}
          <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl p-6 mb-6 text-white text-center">
            <div className="text-sm opacity-80 mb-1">{t('success.yourTickets')}</div>
            <div className="text-5xl font-bold">
              {participation.ticketsBase + participation.ticketsExtra}
            </div>
            {participation.ticketsExtra > 0 && (
              <div className="text-sm opacity-80 mt-2">
                {t('success.bonusChance', { percent: participation.ticketsExtra * 100 })}
              </div>
            )}
            {invitedCount > 0 && (
              <div className="text-xs opacity-70 mt-1">
                {t('success.ticketsFromInvites', { count: invitedCount })}
              </div>
            )}
          </div>

          {/* Кнопка "Увеличить шансы" */}
          {giveaway && (giveaway.conditions.inviteEnabled || giveaway.conditions.boostEnabled || giveaway.conditions.storiesEnabled || customTasks.length > 0) && (
            <button
              onClick={() => {
                setShowExtrasSheet(true);
                // Определяем, какую вкладку открыть первой
                if (giveaway.conditions.inviteEnabled) {
                  setActiveExtrasTab('invites');
                } else if (giveaway.conditions.boostEnabled) {
                  setActiveExtrasTab('boosts');
                } else if (giveaway.conditions.storiesEnabled) {
                  setActiveExtrasTab('stories');
                } else if (customTasks.length > 0) {
                  setActiveExtrasTab('tasks');
                }
              }}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl p-4 mb-6 flex items-center justify-between hover:opacity-90 transition-opacity"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">⚡️</span>
                <div className="text-left">
                  <div className="font-semibold">{t('success.increaseChances')}</div>
                  <div className="text-xs opacity-80">
                    {t('success.moreTickets')}
                  </div>
                </div>
              </div>
              {participation.ticketsExtra > 0 && (
                <span className="bg-white/20 px-3 py-1.5 rounded-lg font-bold">
                  +{participation.ticketsExtra * 100}%
                </span>
              )}
            </button>
          )}

          {/* Bottom Sheet "Увеличить шансы" */}
          {giveaway && (
            <BottomSheet
              isOpen={showExtrasSheet}
              onClose={() => setShowExtrasSheet(false)}
              title={`⚡️ ${t('success.increaseChances')}`}
            >
              <div className="px-4 py-3">
                {/* Табы */}
                <Tabs
                  variant="pills"
                  activeTab={activeExtrasTab}
                  onChange={(tabId) => setActiveExtrasTab(tabId as any)}
                  tabs={[
                    ...(giveaway.conditions.inviteEnabled ? [{ 
                      id: 'invites', 
                      label: t('extras.inviteFriends'), 
                      icon: '👥',
                      content: null 
                    }] : []),
                    ...(giveaway.conditions.boostEnabled ? [{ 
                      id: 'boosts', 
                      label: t('extras.boostChannels'), 
                      icon: '⚡️',
                      content: null 
                    }] : []),
                    ...(giveaway.conditions.storiesEnabled ? [{ 
                      id: 'stories', 
                      label: t('extras.publishStory'), 
                      icon: '📺',
                      content: null 
                    }] : []),
                    ...(customTasks.length > 0 ? [{ 
                      id: 'tasks', 
                      label: t('extras.customTasks'), 
                      icon: '📝',
                      content: null 
                    }] : []),
                  ]}
                />

              {/* Контент табов */}
              <div className="mt-4 pb-4">
                {/* Вкладка: Приглашения */}
                {activeExtrasTab === 'invites' && giveaway.conditions.inviteEnabled && (
                  <div className="space-y-3">
                    {/* Прогресс приглашений */}
                    <div>
                      <div className="flex justify-between text-xs text-tg-hint mb-1">
                        <span>{t('extras.inviteProgress')}</span>
                        <span className="font-medium text-tg-text">{invitedCount}/{inviteMax}</span>
                      </div>
                      <div className="h-2 bg-tg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-tg-button rounded-full transition-all duration-500"
                          style={{ width: `${Math.min((invitedCount / Math.max(inviteMax, 1)) * 100, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-tg-hint mt-1">
                        {t('extras.inviteDescription', { current: invitedCount, max: inviteMax })}
                      </p>
                    </div>
                    
                    {invitedCount < inviteMax ? (
                      <>
                        {/* Реферальная ссылка */}
                        {referralLink && (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              readOnly
                              value={referralLink}
                              className="flex-1 bg-tg-secondary rounded-lg px-3 py-2 text-xs truncate"
                            />
                            <button
                              onClick={handleCopyLink}
                              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                linkCopied 
                                  ? 'bg-green-500 text-white' 
                                  : 'bg-tg-button text-tg-button-text'
                              }`}
                            >
                              {linkCopied ? '✓' : '📋'}
                            </button>
                          </div>
                        )}
                        {linkCopied && (
                          <p className="text-xs text-green-500 text-center">{t('extras.linkCopied')}</p>
                        )}
                        
                        {/* Кнопка "Поделиться в Telegram" */}
                        <button
                          onClick={handleShareToTelegram}
                          className="w-full bg-[#0088cc] text-white text-sm rounded-lg py-2.5 font-medium flex items-center justify-center gap-2"
                        >
                          <span>📤</span>
                          <span>{t('extras.shareInTelegram')}</span>
                        </button>
                      </>
                    ) : (
                      <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-center">
                        <span className="text-green-600 text-sm"><AppIcon name="icon-success" size={14} /> {t('extras.inviteLimitReached')}</span>
                      </div>
                    )}
                    
                    {/* Список приглашённых */}
                    {invites.length > 0 && (
                      <div className="pt-3 border-t border-tg-secondary">
                        <p className="text-xs font-medium text-tg-hint mb-2">
                          {t('extras.invitedFriends')} ({invites.length}):
                        </p>
                        <div className="space-y-2">
                          {invites.map((inv) => (
                            <div key={inv.userId} className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-green-500 flex-shrink-0"><AppIcon name="icon-success" size={14} /></span>
                                <div className="min-w-0">
                                  <span className="text-sm font-medium truncate block">
                                    {inv.firstName}{inv.lastName ? ` ${inv.lastName}` : ''}
                                  </span>
                                  {inv.username && (
                                    <span className="text-xs text-tg-hint">@{inv.username}</span>
                                  )}
                                </div>
                              </div>
                              <span className="text-xs text-tg-hint flex-shrink-0">
                                {new Date(inv.joinedAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Вкладка: Бусты */}
                {activeExtrasTab === 'boosts' && giveaway.conditions.boostEnabled && (
                  <div className="space-y-3">
                    <p className="text-sm text-tg-hint mb-3">
                      {t('extras.boostDescription')}
                    </p>
                    
                    {boostChannels.map((channel) => (
                      <div
                        key={channel.id}
                        className="p-3 bg-tg-secondary rounded-lg flex items-center gap-3"
                      >
                        <div className="flex-1">
                          <div className="font-medium text-sm">{channel.title}</div>
                          <div className="text-xs text-tg-hint mt-1">
                            {t('extras.boostCount', { count: channel.boostCount })}
                          </div>
                        </div>
                        {channel.boostCount < 10 && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => openBoostLink(channel)}
                              className="bg-tg-button text-tg-button-text text-xs rounded-lg px-3 py-1.5"
                            >
                              ⚡️ {t('extras.boostButton')}
                            </button>
                            <button
                              onClick={() => handleVerifyBoost(channel.id)}
                              disabled={verifyingBoost === channel.id}
                              className="bg-green-500 text-white text-xs rounded-lg px-3 py-1.5 disabled:opacity-50"
                            >
                              {verifyingBoost === channel.id ? '⏳' : <AppIcon name="icon-search" size={14} />} {t('extras.verifyButton')}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                    
                    {boostMessage && (
                      <div className={`p-3 rounded-lg text-center text-sm ${
                        boostMessage.includes('✅') 
                          ? 'bg-green-500/10 text-green-600' 
                          : 'bg-orange-500/10 text-orange-600'
                      }`}>
                        {boostMessage}
                      </div>
                    )}
                  </div>
                )}

                {/* Вкладка: Сторис */}
                {activeExtrasTab === 'stories' && giveaway.conditions.storiesEnabled && (
                  <div className="space-y-3">
                    <p className="text-sm text-tg-hint">
                      {t('extras.storyDescription')}
                    </p>
                    
                    {storyRequestStatus === 'APPROVED' ? (
                      <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-center">
                        <span className="text-green-600"><AppIcon name="icon-success" size={14} /> {t('extras.ticketReceived')}</span>
                      </div>
                    ) : storyRequestStatus === 'PENDING' ? (
                      <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 text-center">
                        <span className="text-orange-600">⏳ {t('extras.requestPending')}</span>
                      </div>
                    ) : storyRequestStatus === 'REJECTED' ? (
                      <div className="space-y-2">
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-center">
                          <span className="text-red-600"><AppIcon name="icon-error" size={14} /> {t('extras.requestRejected')}</span>
                          {storyRejectReason && (
                            <p className="text-xs mt-1">{storyRejectReason}</p>
                          )}
                        </div>
                        <button
                          onClick={() => setShowStoriesInstructions(true)}
                          className="w-full bg-tg-button text-tg-button-text text-sm rounded-lg py-2"
                        >
                          {t('extras.resubmitStory')}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowStoriesInstructions(true)}
                        className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm rounded-lg py-2.5 font-medium"
                      >
                        📺 {t('extras.publishStory')}
                      </button>
                    )}
                    
                    {storiesMessage && (
                      <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-center text-sm text-green-600">
                        {storiesMessage}
                      </div>
                    )}
                    
                    {/* Инструкции сторис в отдельном модальном окне будут */}
                    {showStoriesInstructions && (
                      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-tg-bg rounded-xl p-4 max-w-md w-full space-y-3">
                          <h3 className="font-semibold">{t('extras.howToPublish')}</h3>
                          <ol className="text-sm text-tg-hint space-y-2 list-decimal list-inside">
                            <li>{t('extras.copyLinkInstruction')}</li>
                            <li>{t('extras.openTelegramInstruction')}</li>
                            <li>{t('extras.createStoryInstruction')}</li>
                            <li>{t('extras.addLinkInstruction')}</li>
                            <li>{t('extras.publishAndSubmitInstruction')}</li>
                          </ol>
                          
                          <div className="flex gap-2">
                            <input
                              type="text"
                              readOnly
                              value={getStoryLink()}
                              className="flex-1 bg-tg-secondary text-tg-text text-xs rounded-lg px-3 py-2"
                            />
                            <button
                              onClick={handleCopyStoryLink}
                              className="bg-tg-button text-tg-button-text text-xs rounded-lg px-3 py-2"
                            >
                              {storyLinkCopied ? '✓' : '📋'}
                            </button>
                          </div>
                          
                          <button
                            onClick={handleSubmitStory}
                            disabled={submittingStory}
                            className="w-full bg-green-500 text-white text-sm rounded-lg py-2.5 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            {submittingStory ? (
                              <span>⏳ {tCommon('loading')}</span>
                            ) : (
                              <>
                                <span><AppIcon name="icon-success" size={14} /></span>
                                <span>{t('extras.submitStoryButton')}</span>
                              </>
                            )}
                          </button>
                          
                          <button
                            onClick={() => setShowStoriesInstructions(false)}
                            className="w-full text-tg-hint text-xs py-2"
                          >
                            {t('extras.cancel')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Вкладка: Кастомные задания */}
                {activeExtrasTab === 'tasks' && customTasks.length > 0 && (
                  <div className="space-y-3">
                    {customTasks.map((task) => {
                      const isCompleted = customTaskCompletions.get(task.id) || false;
                      const isCompleting = completingTask === task.id;
                      
                      return (
                        <div 
                          key={task.id}
                          className="bg-tg-secondary rounded-lg p-3 border border-tg-secondary"
                        >
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={isCompleted ? 'text-green-500' : 'text-tg-hint'}>
                                  {isCompleted ? <AppIcon name="icon-success" size={14} /> : task.isRequired ? '🔴' : '🔵'}
                                </span>
                                <span className="font-medium text-sm">{task.title}</span>
                                {task.bonusTickets > 0 && (
                                  <span className="text-xs bg-green-500/10 text-green-600 px-1.5 py-0.5 rounded">
                                    +{task.bonusTickets} <AppIcon name="icon-ticket" size={16} />
                                  </span>
                                )}
                              </div>
                              {task.description && (
                                <p className="text-xs text-tg-hint">{task.description}</p>
                              )}
                            </div>
                          </div>
                          
                          <button
                            onClick={() => handleCompleteCustomTask(task.id, task.linkUrl)}
                            disabled={isCompleted || isCompleting}
                            className={`w-full text-xs rounded-lg py-2 font-medium transition-colors ${
                              isCompleted
                                ? 'bg-green-500/10 text-green-600 cursor-not-allowed'
                                : 'bg-tg-button text-tg-button-text hover:opacity-80'
                            }`}
                          >
                            {isCompleting ? (
                              <>⏳ {tCommon('loading')}</>
                            ) : isCompleted ? (
                              <><AppIcon name="icon-success" size={14} /> {t('extras.taskCompleted')}</>
                            ) : (
                              <><AppIcon name="icon-share" size={14} /> {t('extras.goToTask')}</>
                            )}
                          </button>
                        </div>
                      );
                    })}
                    
                    {customTasks.some(t => t.isRequired) && (
                      <p className="text-xs text-tg-hint text-center">
                        🔴 {t('extras.requiredTasksNote')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </BottomSheet>
          )}

          {/* Кнопка "Больше розыгрышей" */}
          <button
            onClick={() => router.push('/catalog')}
            className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg py-3.5 font-medium mb-3 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
          >
            <span><AppIcon name="icon-giveaway" size={16} /></span>
            <span>{t('success.moreCatalog')}</span>
          </button>

          <button
            onClick={() => router.push('/')}
            className="w-full bg-tg-secondary text-tg-text rounded-lg py-3"
          >
            {t('success.goHome')}
          </button>
        </div>
      </main>
    );
  }

  // Уже участвует
  if (screen === 'already_joined' && participation) {
    return (
      <main className="min-h-screen p-4">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-6">
            {/* Маскот розыгрыша */}
            {giveaway?.mascotType && (
              <div className="mb-4 flex justify-center">
                <Mascot 
                  type={giveaway.mascotType as any} 
                  size={120}
                  className="mx-auto"
                />
              </div>
            )}
            
            <h1 className="text-2xl font-bold mb-2">{t('alreadyJoined.title')}</h1>
            <p className="text-tg-hint mb-4">{giveaway?.title}</p>
            
            {/* Таймер до окончания розыгрыша */}
            {giveaway && giveaway.endAt && (
              <div className="bg-tg-secondary-bg rounded-xl p-4 mb-4">
                <div className="text-sm text-tg-hint mb-2">{t('success.endsIn')}</div>
                <CountdownTimer 
                  endDate={giveaway.endAt} 
                  className="text-lg font-semibold"
                />
              </div>
            )}
          </div>

          {/* Билеты */}
          <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl p-6 mb-6 text-white text-center">
            <div className="text-sm opacity-80 mb-1">{t('alreadyJoined.yourTickets')}</div>
            <div className="text-5xl font-bold">
              {participation.ticketsBase + participation.ticketsExtra}
            </div>
            {invitedCount > 0 && (
              <div className="text-sm opacity-80 mt-2">
                {t('alreadyJoined.ticketsFromInvites', { count: invitedCount })}
              </div>
            )}
          </div>

          {/* Кнопка "Увеличить шансы" */}
          {giveaway && (giveaway.conditions.inviteEnabled || giveaway.conditions.boostEnabled || giveaway.conditions.storiesEnabled || customTasks.length > 0) && (
            <button
              onClick={() => {
                setShowExtrasSheet(true);
                if (giveaway.conditions.inviteEnabled) {
                  setActiveExtrasTab('invites');
                } else if (giveaway.conditions.boostEnabled) {
                  setActiveExtrasTab('boosts');
                } else if (giveaway.conditions.storiesEnabled) {
                  setActiveExtrasTab('stories');
                } else if (customTasks.length > 0) {
                  setActiveExtrasTab('tasks');
                }
              }}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl p-4 mb-6 flex items-center justify-between hover:opacity-90 transition-opacity"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">⚡️</span>
                <div className="text-left">
                  <div className="font-semibold">{t('success.increaseChances')}</div>
                  <div className="text-xs opacity-80">
                    {t('success.moreTickets')}
                  </div>
                </div>
              </div>
              {participation.ticketsExtra > 0 && (
                <span className="bg-white/20 px-3 py-1.5 rounded-lg font-bold">
                  +{participation.ticketsExtra * 100}%
                </span>
              )}
            </button>
          )}

          <button
            onClick={() => router.push('/')}
            className="w-full bg-tg-secondary text-tg-text rounded-lg py-3"
          >
            {tCommon('goHome')}
          </button>
        </div>
      </main>
    );
  }

  // ---- Экран загрузки фото для Liveness Check (10.19) ----
  if (screen === 'liveness_upload') {
    const handleLivenessUpload = async () => {
      if (!livenessPhoto) return;
      setLivenessUploading(true);
      setLivenessMessage(null);
      try {
        const res = await uploadLivenessPhoto(giveawayId, livenessPhoto);
        if (res.ok) {
          setLivenessStatus('pending');
          setLivenessMessage('Фото загружено. Ожидайте подтверждения от создателя.');
          setTimeout(() => {
            setScreen('success');
            setShowConfetti(true);
          }, 2000);
        } else {
          setLivenessMessage(res.error || 'Ошибка загрузки фото');
        }
      } catch {
        setLivenessMessage('Ошибка соединения');
      } finally {
        setLivenessUploading(false);
      }
    };

    return (
      <main className="min-h-screen p-4 bg-tg-bg">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <div className="text-5xl mb-4"><AppIcon name="icon-search" size={14} /></div>
            <h1 className="text-2xl font-bold mb-2">Проверка живости</h1>
            <p className="text-tg-hint text-sm">
              Создатель этого розыгрыша требует проверить, что вы реальный человек.
              Загрузите своё фото (селфи), чтобы завершить участие.
            </p>
          </div>

          {/* Превью загруженного фото */}
          {livenessPhoto && (
            <div className="mb-4 flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- blob URL not supported by next/image */}
              <img
                src={URL.createObjectURL(livenessPhoto)}
                alt="Ваше фото"
                className="w-32 h-32 rounded-xl object-cover border-2 border-tg-button"
              />
            </div>
          )}

          {/* Поле выбора фото */}
          <label className="block w-full mb-4">
            <div className="w-full border-2 border-dashed border-tg-button/50 rounded-xl p-6 text-center cursor-pointer hover:border-tg-button transition-colors">
              <span className="text-3xl block mb-2"><AppIcon name="icon-camera" size={14} /></span>
              <span className="text-sm text-tg-hint">
                {livenessPhoto ? livenessPhoto.name : 'Нажмите, чтобы выбрать фото'}
              </span>
            </div>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setLivenessPhoto(file);
              }}
            />
          </label>

          {/* Сообщение */}
          {livenessMessage && (
            <div className={`p-3 rounded-lg text-sm text-center mb-4 ${
              livenessStatus === 'pending'
                ? 'bg-green-500/10 text-green-600'
                : 'bg-red-500/10 text-red-600'
            }`}>
              {livenessMessage}
            </div>
          )}

          {/* Кнопки */}
          <button
            onClick={handleLivenessUpload}
            disabled={!livenessPhoto || livenessUploading}
            className="w-full bg-tg-button text-tg-button-text rounded-xl py-4 font-semibold mb-3 disabled:opacity-50 transition-opacity"
          >
            {livenessUploading ? '⏳ Загружаем...' : <><AppIcon name="icon-success" size={14} /> Отправить фото</>}
          </button>

          <button
            onClick={() => {
              setScreen('success');
              setShowConfetti(true);
            }}
            className="w-full bg-transparent text-tg-hint text-sm py-2"
          >
            Пропустить (отправить позже)
          </button>

          <p className="text-xs text-tg-hint text-center mt-4">
            <AppIcon name="icon-lock" size={14} /> Фото видит только создатель розыгрыша. После проверки участие будет подтверждено.
          </p>
        </div>
      </main>
    );
  }

  // Fallback
  return (
    <main className="min-h-screen p-4 flex items-center justify-center">
      <p className="text-tg-hint">{tCommon('loading')}</p>
    </main>
  );
}
