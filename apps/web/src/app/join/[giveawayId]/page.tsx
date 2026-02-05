'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
  PublicGiveaway,
  Participation,
  InvitedFriend,
  BoostChannel,
  StoryRequestStatus,
} from '@/lib/api';

// Состояния экрана
type ScreenState = 
  | 'loading'
  | 'auth_required'
  | 'info'
  | 'check_subscription'
  | 'captcha'
  | 'success'
  | 'already_joined'
  | 'error'
  | 'finished';

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

  // Авторизация и загрузка данных
  useEffect(() => {
    async function init() {
      try {
        // Проверяем авторизацию
        const userRes = await getCurrentUser();
        
        if (!userRes.ok || !userRes.user) {
          // Пробуем авторизоваться через Telegram
          const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp;
          
          if (tg?.initData) {
            const authRes = await authenticateWithTelegram(tg.initData);
            if (!authRes.ok) {
              setScreen('auth_required');
              return;
            }
          } else {
            setScreen('auth_required');
            return;
          }
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
  }, [giveawayId, loadBoostData]);

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
  }, [giveawayId]);

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
  }, [giveaway, giveawayId]);

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

  // Проверка капчи
  const handleVerifyCaptcha = useCallback(async () => {
    const answer = parseInt(captchaAnswer, 10);
    if (isNaN(answer)) {
      setCaptchaError(t('captcha.invalidNumber'));
      return;
    }

    try {
      const res = await verifyCaptcha(captchaToken, answer);
      if (res.ok) {
        setCaptchaPassed(true);
        await handleJoin(true);
      } else {
        setCaptchaError(res.error || t('captcha.wrong'));
        // Перезагружаем капчу
        await loadCaptcha();
      }
    } catch (err) {
      console.error('Verify captcha error:', err);
      setCaptchaError(tErrors('error'));
    }
  }, [captchaAnswer, captchaToken, loadCaptcha, t, tErrors]);

  // Участие в розыгрыше
  const handleJoin = useCallback(async (withCaptcha: boolean) => {
    setJoining(true);

    try {
      const res = await joinGiveaway(giveawayId, {
        captchaPassed: withCaptcha || captchaPassed,
        referrerUserId: referrerUserId || undefined,
        sourceTag: 'mini_app',
      });

      if (res.ok && res.participation) {
        setParticipation(res.participation);
        // Загружаем реферальные данные и бусты
        await Promise.all([loadReferralData(), loadBoostData(), loadStoryRequestStatus()]);
        setScreen('success');
      } else if (res.code === 'SUBSCRIPTION_REQUIRED') {
        setError(res.error || tErrors('subscriptionRequired'));
        setScreen('check_subscription');
      } else if (res.code === 'CAPTCHA_REQUIRED') {
        await loadCaptcha();
        setScreen('captcha');
      } else {
        setError(res.error || tErrors('error'));
      }
    } catch (err) {
      console.error('Join error:', err);
      setError(tErrors('error'));
    } finally {
      setJoining(false);
    }
  }, [giveawayId, captchaPassed, referrerUserId, loadCaptcha, loadReferralData]);

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
          <div className="text-6xl mb-4">🔐</div>
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
          <div className="text-6xl mb-4">❌</div>
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
          <div className="text-6xl mb-4">🏁</div>
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

  // Информация о розыгрыше
  if (screen === 'info' && giveaway) {
    return (
      <main className="min-h-screen p-4">
        <div className="max-w-md mx-auto">
          {/* Заголовок */}
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">🎁</div>
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
              <h2 className="font-medium mb-3">📢 {t('info.conditions')}:</h2>
              <div className="space-y-2">
                {giveaway.conditions.requiredSubscriptions.map((channel) => (
                  <a
                    key={channel.id}
                    href={channel.username ? `https://t.me/${channel.username.replace('@', '')}` : '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-2 bg-tg-bg rounded-lg"
                  >
                    <span className="text-lg">📣</span>
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
              <h2 className="font-medium mb-2">📝 {t('info.aboutGiveaway')}:</h2>
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
            <div className="text-5xl mb-3">📢</div>
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
                <span className="text-2xl">{channel.subscribed ? '✅' : '📣'}</span>
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
            {checkingSubscription ? `⏳ ${tCommon('loading')}` : `🔄 ${t('checkSubscription.checkButton')}`}
          </button>
        </div>
      </main>
    );
  }

  // Капча
  if (screen === 'captcha') {
    return (
      <main className="min-h-screen p-4">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">🤖</div>
            <h1 className="text-xl font-bold">{t('captcha.title')}</h1>
            <p className="text-tg-hint mt-2">{t('captcha.description')}</p>
          </div>

          <div className="bg-tg-secondary rounded-lg p-6 mb-6 text-center">
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
            {captchaError && (
              <p className="text-red-500 text-sm mt-2">{captchaError}</p>
            )}
          </div>

          <button
            onClick={handleVerifyCaptcha}
            disabled={!captchaAnswer || joining}
            className="w-full bg-tg-button text-tg-button-text rounded-lg py-4 font-medium disabled:opacity-50"
          >
            {joining ? `⏳ ${tCommon('loading')}` : `✅ ${t('captcha.checkButton')}`}
          </button>
        </div>
      </main>
    );
  }

  // Успех
  if (screen === 'success' && participation) {
    return (
      <main className="min-h-screen p-4">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-6">
            <div className="text-6xl mb-3">🎉</div>
            <h1 className="text-2xl font-bold">{t('success.title')}</h1>
            <p className="text-tg-hint mt-2">{t('success.subtitle')}</p>
          </div>

          {/* Сообщение о приглашении */}
          {referrerUserId && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 mb-4 text-center">
              <span className="text-green-600">👋 {t('info.invitedByFriend')}</span>
            </div>
          )}

          {/* Билеты */}
          <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl p-6 mb-6 text-white text-center">
            <div className="text-sm opacity-80 mb-1">{t('success.yourTickets')}</div>
            <div className="text-5xl font-bold">
              {participation.ticketsBase + participation.ticketsExtra}
            </div>
            {invitedCount > 0 && (
              <div className="text-sm opacity-80 mt-2">
                {t('success.ticketsFromInvites', { count: invitedCount })}
              </div>
            )}
          </div>

          {/* Увеличить шансы */}
          {giveaway && (giveaway.conditions.inviteEnabled || giveaway.conditions.boostEnabled || giveaway.conditions.storiesEnabled) && (
            <div className="bg-tg-secondary rounded-lg p-4 mb-6">
              <h2 className="font-medium mb-3">🎫 {t('success.increaseChances')}:</h2>
              <div className="space-y-3">
                {giveaway.conditions.inviteEnabled && (
                  <div className="p-3 bg-tg-bg rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">👥</span>
                      <span className="font-medium">{t('extras.inviteFriends')}</span>
                    </div>
                    <p className="text-xs text-tg-hint mb-3">
                      {t('extras.inviteDescription', { current: invitedCount, max: inviteMax })}
                    </p>
                    
                    {invitedCount < inviteMax ? (
                      <>
                        {/* Реферальная ссылка */}
                        <div className="flex gap-2 mb-2">
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
                      <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2 text-center">
                        <span className="text-green-600 text-sm">✅ {t('extras.inviteLimitReached')}</span>
                      </div>
                    )}
                    
                    {/* Список приглашённых */}
                    {invites.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-tg-secondary">
                        <p className="text-xs text-tg-hint mb-2">{t('extras.invitedFriends')}:</p>
                        <div className="space-y-1">
                          {invites.slice(0, 5).map((inv) => (
                            <div key={inv.userId} className="text-sm flex items-center gap-2">
                              <span className="text-green-500">✅</span>
                              <span>{inv.firstName}</span>
                            </div>
                          ))}
                          {invites.length > 5 && (
                            <p className="text-xs text-tg-hint">{t('extras.moreFriends', { count: invites.length - 5 })}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {giveaway.conditions.boostEnabled && boostChannels.length > 0 && (
                  <div className="p-3 bg-tg-bg rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">⚡</span>
                      <span className="font-medium">{t('extras.boostChannels')}</span>
                    </div>
                    <p className="text-xs text-tg-hint mb-3">
                      {t('extras.boostDescription')}
                    </p>
                    
                    {/* Сообщение о результате */}
                    {boostMessage && (
                      <div className={`mb-3 p-2 rounded-lg text-sm text-center ${
                        boostMessage.startsWith('✅') 
                          ? 'bg-green-500/10 text-green-600' 
                          : 'bg-yellow-500/10 text-yellow-600'
                      }`}>
                        {boostMessage}
                      </div>
                    )}
                    
                    {/* Список каналов для буста */}
                    <div className="space-y-2">
                      {boostChannels.map((channel) => (
                        <div key={channel.id} className="bg-tg-secondary rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">📣</span>
                              <div>
                                <div className="text-sm font-medium">{channel.title}</div>
                                {channel.username && (
                                  <div className="text-xs text-tg-hint">{channel.username}</div>
                                )}
                              </div>
                            </div>
                            <div className={`text-xs px-2 py-1 rounded ${
                              channel.boosted 
                                ? 'bg-green-500/10 text-green-600' 
                                : 'bg-gray-500/10 text-tg-hint'
                            }`}>
                              {channel.boosted ? `✅ ${t('extras.boostCount', { count: channel.boostCount })}` : `❌ ${t('extras.notBoosted')}`}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => openBoostLink(channel)}
                              disabled={!channel.username}
                              className="flex-1 bg-[#9147ff] text-white text-xs rounded-lg py-2 font-medium disabled:opacity-50"
                            >
                              ⚡ {t('extras.boostButton')}
                            </button>
                            <button
                              onClick={() => handleVerifyBoost(channel.id)}
                              disabled={verifyingBoost === channel.id}
                              className="flex-1 bg-tg-button text-tg-button-text text-xs rounded-lg py-2 font-medium disabled:opacity-50"
                            >
                              {verifyingBoost === channel.id ? '⏳...' : `🔍 ${t('extras.verifyButton')}`}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {ticketsFromBoosts > 0 && (
                      <p className="text-xs text-green-600 mt-3 text-center">
                        {t('extras.totalTicketsFromBoosts', { count: ticketsFromBoosts })}
                      </p>
                    )}
                  </div>
                )}

                {giveaway.conditions.storiesEnabled && (
                  <div className="p-3 bg-tg-bg rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">📺</span>
                      <span className="font-medium">{t('extras.publishStory')}</span>
                    </div>
                    <p className="text-xs text-tg-hint mb-3">
                      {t('extras.storyDescription')}
                    </p>
                    
                    {/* Сообщение о результате */}
                    {storiesMessage && (
                      <div className={`mb-3 p-2 rounded-lg text-sm text-center ${
                        storiesMessage.startsWith('✅') 
                          ? 'bg-green-500/10 text-green-600' 
                          : 'bg-yellow-500/10 text-yellow-600'
                      }`}>
                        {storiesMessage}
                      </div>
                    )}
                    
                    {/* Статус APPROVED — билет получен */}
                    {storyRequestStatus === 'APPROVED' && (
                      <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2 text-center">
                        <span className="text-green-600 text-sm">✅ {t('extras.ticketReceived')}</span>
                      </div>
                    )}
                    
                    {/* Статус PENDING — на проверке */}
                    {storyRequestStatus === 'PENDING' && (
                      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2 text-center">
                        <span className="text-yellow-600 text-sm">⏳ {t('extras.requestPending')}</span>
                      </div>
                    )}
                    
                    {/* Статус REJECTED — отклонено, можно отправить снова */}
                    {storyRequestStatus === 'REJECTED' && (
                      <div className="mb-3">
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 text-center mb-2">
                          <span className="text-red-600 text-sm">❌ {t('extras.requestRejected')}</span>
                          {storyRejectReason && (
                            <p className="text-xs text-red-500 mt-1">{storyRejectReason}</p>
                          )}
                        </div>
                        <button
                          onClick={() => setShowStoriesInstructions(true)}
                          className="w-full bg-gradient-to-r from-pink-500 to-orange-400 text-white text-sm rounded-lg py-2.5 font-medium"
                        >
                          📤 {t('extras.resubmitStory')}
                        </button>
                      </div>
                    )}
                    
                    {/* Нет заявки — показать кнопку */}
                    {!storyRequestStatus && !showStoriesInstructions && (
                      <button
                        onClick={() => setShowStoriesInstructions(true)}
                        className="w-full bg-gradient-to-r from-pink-500 to-orange-400 text-white text-sm rounded-lg py-2.5 font-medium flex items-center justify-center gap-2"
                      >
                        <span>📤</span>
                        <span>{t('extras.publishStory')}</span>
                      </button>
                    )}
                    
                    {/* Инструкция для публикации */}
                    {showStoriesInstructions && !storyRequestStatus && (
                      <div className="mt-3 space-y-3">
                        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                          <h4 className="font-medium text-sm mb-2">📋 {t('extras.howToPublish')}:</h4>
                          <ol className="text-xs text-tg-hint space-y-1 list-decimal list-inside">
                            <li>{t('extras.copyLinkInstruction')}</li>
                            <li>{t('extras.openTelegramInstruction')}</li>
                            <li>{t('extras.createStoryInstruction')}</li>
                            <li>{t('extras.addLinkInstruction')}</li>
                            <li>{t('extras.publishAndSubmitInstruction')}</li>
                          </ol>
                        </div>
                        
                        {/* Ссылка для копирования */}
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
                        
                        {/* Кнопка отправки заявки */}
                        <button
                          onClick={handleSubmitStory}
                          disabled={submittingStory}
                          className="w-full bg-green-500 text-white text-sm rounded-lg py-2.5 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {submittingStory ? (
                            <span>⏳ {tCommon('loading')}</span>
                          ) : (
                            <>
                              <span>✅</span>
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
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

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
            <div className="text-6xl mb-3">🎉</div>
            <h1 className="text-2xl font-bold">{t('alreadyJoined.title')}</h1>
            <p className="text-tg-hint mt-2">{giveaway?.title}</p>
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

          {/* Увеличить шансы */}
          {giveaway && (giveaway.conditions.inviteEnabled || giveaway.conditions.boostEnabled || giveaway.conditions.storiesEnabled) && (
            <div className="bg-tg-secondary rounded-lg p-4 mb-6">
              <h2 className="font-medium mb-3">🎫 {t('extras.title')}:</h2>
              <div className="space-y-3">
                {giveaway.conditions.inviteEnabled && (
                  <div className="p-3 bg-tg-bg rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">👥</span>
                      <span className="font-medium">{t('extras.inviteFriends')}</span>
                    </div>
                    <p className="text-xs text-tg-hint mb-3">
                      {t('extras.inviteDescription', { current: invitedCount, max: inviteMax })}
                    </p>
                    
                    {invitedCount < inviteMax ? (
                      <>
                        {/* Реферальная ссылка */}
                        <div className="flex gap-2 mb-2">
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
                      <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2 text-center">
                        <span className="text-green-600 text-sm">✅ {t('extras.inviteLimitReached')}</span>
                      </div>
                    )}
                    
                    {/* Список приглашённых */}
                    {invites.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-tg-secondary">
                        <p className="text-xs text-tg-hint mb-2">{t('extras.invitedFriends')}:</p>
                        <div className="space-y-1">
                          {invites.slice(0, 5).map((inv) => (
                            <div key={inv.userId} className="text-sm flex items-center gap-2">
                              <span className="text-green-500">✅</span>
                              <span>{inv.firstName}</span>
                            </div>
                          ))}
                          {invites.length > 5 && (
                            <p className="text-xs text-tg-hint">{t('extras.moreFriends', { count: invites.length - 5 })}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {giveaway.conditions.boostEnabled && boostChannels.length > 0 && (
                  <div className="p-3 bg-tg-bg rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">⚡</span>
                      <span className="font-medium">{t('extras.boostChannels')}</span>
                    </div>
                    <p className="text-xs text-tg-hint mb-3">
                      {t('extras.boostDescription')}
                    </p>
                    
                    {/* Сообщение о результате */}
                    {boostMessage && (
                      <div className={`mb-3 p-2 rounded-lg text-sm text-center ${
                        boostMessage.startsWith('✅') 
                          ? 'bg-green-500/10 text-green-600' 
                          : 'bg-yellow-500/10 text-yellow-600'
                      }`}>
                        {boostMessage}
                      </div>
                    )}
                    
                    {/* Список каналов для буста */}
                    <div className="space-y-2">
                      {boostChannels.map((channel) => (
                        <div key={channel.id} className="bg-tg-secondary rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">📣</span>
                              <div>
                                <div className="text-sm font-medium">{channel.title}</div>
                                {channel.username && (
                                  <div className="text-xs text-tg-hint">{channel.username}</div>
                                )}
                              </div>
                            </div>
                            <div className={`text-xs px-2 py-1 rounded ${
                              channel.boosted 
                                ? 'bg-green-500/10 text-green-600' 
                                : 'bg-gray-500/10 text-tg-hint'
                            }`}>
                              {channel.boosted ? `✅ ${t('extras.boostCount', { count: channel.boostCount })}` : `❌ ${t('extras.notBoosted')}`}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => openBoostLink(channel)}
                              disabled={!channel.username}
                              className="flex-1 bg-[#9147ff] text-white text-xs rounded-lg py-2 font-medium disabled:opacity-50"
                            >
                              ⚡ {t('extras.boostButton')}
                            </button>
                            <button
                              onClick={() => handleVerifyBoost(channel.id)}
                              disabled={verifyingBoost === channel.id}
                              className="flex-1 bg-tg-button text-tg-button-text text-xs rounded-lg py-2 font-medium disabled:opacity-50"
                            >
                              {verifyingBoost === channel.id ? '⏳...' : `🔍 ${t('extras.verifyButton')}`}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {ticketsFromBoosts > 0 && (
                      <p className="text-xs text-green-600 mt-3 text-center">
                        {t('extras.totalTicketsFromBoosts', { count: ticketsFromBoosts })}
                      </p>
                    )}
                  </div>
                )}

                {giveaway.conditions.storiesEnabled && (
                  <div className="p-3 bg-tg-bg rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">📺</span>
                      <span className="font-medium">{t('extras.publishStory')}</span>
                    </div>
                    <p className="text-xs text-tg-hint mb-3">
                      {t('extras.storyDescription')}
                    </p>
                    
                    {/* Сообщение о результате */}
                    {storiesMessage && (
                      <div className={`mb-3 p-2 rounded-lg text-sm text-center ${
                        storiesMessage.startsWith('✅') 
                          ? 'bg-green-500/10 text-green-600' 
                          : 'bg-yellow-500/10 text-yellow-600'
                      }`}>
                        {storiesMessage}
                      </div>
                    )}
                    
                    {/* Статус APPROVED — билет получен */}
                    {storyRequestStatus === 'APPROVED' && (
                      <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2 text-center">
                        <span className="text-green-600 text-sm">✅ {t('extras.ticketReceived')}</span>
                      </div>
                    )}
                    
                    {/* Статус PENDING — на проверке */}
                    {storyRequestStatus === 'PENDING' && (
                      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2 text-center">
                        <span className="text-yellow-600 text-sm">⏳ {t('extras.requestPending')}</span>
                      </div>
                    )}
                    
                    {/* Статус REJECTED — отклонено, можно отправить снова */}
                    {storyRequestStatus === 'REJECTED' && (
                      <div className="mb-3">
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 text-center mb-2">
                          <span className="text-red-600 text-sm">❌ {t('extras.requestRejected')}</span>
                          {storyRejectReason && (
                            <p className="text-xs text-red-500 mt-1">{storyRejectReason}</p>
                          )}
                        </div>
                        <button
                          onClick={() => setShowStoriesInstructions(true)}
                          className="w-full bg-gradient-to-r from-pink-500 to-orange-400 text-white text-sm rounded-lg py-2.5 font-medium"
                        >
                          📤 {t('extras.resubmitStory')}
                        </button>
                      </div>
                    )}
                    
                    {/* Нет заявки — показать кнопку */}
                    {!storyRequestStatus && !showStoriesInstructions && (
                      <button
                        onClick={() => setShowStoriesInstructions(true)}
                        className="w-full bg-gradient-to-r from-pink-500 to-orange-400 text-white text-sm rounded-lg py-2.5 font-medium flex items-center justify-center gap-2"
                      >
                        <span>📤</span>
                        <span>{t('extras.publishStory')}</span>
                      </button>
                    )}
                    
                    {/* Инструкция для публикации */}
                    {showStoriesInstructions && !storyRequestStatus && (
                      <div className="mt-3 space-y-3">
                        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                          <h4 className="font-medium text-sm mb-2">📋 {t('extras.howToPublish')}:</h4>
                          <ol className="text-xs text-tg-hint space-y-1 list-decimal list-inside">
                            <li>{t('extras.copyLinkInstruction')}</li>
                            <li>{t('extras.openTelegramInstruction')}</li>
                            <li>{t('extras.createStoryInstruction')}</li>
                            <li>{t('extras.addLinkInstruction')}</li>
                            <li>{t('extras.publishAndSubmitInstruction')}</li>
                          </ol>
                        </div>
                        
                        {/* Ссылка для копирования */}
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
                        
                        {/* Кнопка отправки заявки */}
                        <button
                          onClick={handleSubmitStory}
                          disabled={submittingStory}
                          className="w-full bg-green-500 text-white text-sm rounded-lg py-2.5 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {submittingStory ? (
                            <span>⏳ {tCommon('loading')}</span>
                          ) : (
                            <>
                              <span>✅</span>
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
                    )}
                  </div>
                )}
              </div>
            </div>
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

  // Fallback
  return (
    <main className="min-h-screen p-4 flex items-center justify-center">
      <p className="text-tg-hint">{tCommon('loading')}</p>
    </main>
  );
}
