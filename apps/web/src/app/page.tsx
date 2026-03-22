'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import { DebugPanel } from '@/components/DebugPanel';
import { ParticipantSection } from '@/components/ParticipantSection';
import { CreatorSection } from '@/components/CreatorSection';
import { useTelegramLocale, syncLocaleFromDb } from '@/hooks/useLocale';
import { AppIcon } from '@/components/AppIcon';
import { FadeIn } from '@/components/FadeIn';
import {
  authenticateWithTelegram,
  getCurrentUser,
  devLogin,
  logout,
  resolveReferralCode,
} from '@/lib/api';

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
      is_premium?: boolean;
    };
  };
  expand: () => void;
  ready: () => void;
}

interface AuthUser {
  id: string;
  telegramUserId: string;
  language: string;
  isPremium: boolean;
  createdAt: string;
}

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';
type Tab = 'participant' | 'creator';

export default function HomePage() {
  const router = useRouter();
  const t = useTranslations();
  const tNav = useTranslations('nav');
  const tCommon = useTranslations('common');
  
  // Определяем локаль из Telegram и устанавливаем cookie
  useTelegramLocale();
  
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasTelegram, setHasTelegram] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('participant');

  const checkAuth = useCallback(async () => {
    try {
      const result = await getCurrentUser();
      if (result.ok && result.id) {
        const userData: AuthUser = {
          id: result.id,
          telegramUserId: result.telegramUserId || '',
          language: result.language || 'RU',
          isPremium: result.isPremium || false,
          createdAt: result.createdAt || '',
        };
        setUser(userData);
        setAuthStatus('authenticated');
        if (userData.language) {
          syncLocaleFromDb(userData.language);
        }
      } else {
        setUser(null);
        setAuthStatus('unauthenticated');
      }
    } catch {
      setAuthStatus('unauthenticated');
    }
  }, []);

  const authenticate = useCallback(async () => {
    const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;

    if (!tg?.initData) {
      setError(t('errors.noTelegramData'));
      setAuthStatus('unauthenticated');
      return;
    }

    setAuthStatus('loading');
    setError(null);

    try {
      const authResult = await authenticateWithTelegram(tg.initData);

      if (!authResult.ok) {
        setError(authResult.error || t('errors.authFailed'));
        setAuthStatus('error');
        return;
      }

      await checkAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.authError'));
      setAuthStatus('error');
    }
  }, [checkAuth, t]);

  const handleDevLogin = useCallback(async () => {
    setAuthStatus('loading');
    setError(null);

    try {
      const result = await devLogin();
      if (result.ok) {
        await checkAuth();
      } else {
        setError(result.error || t('errors.devLoginFailed'));
        setAuthStatus('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.devLoginError'));
      setAuthStatus('error');
    }
  }, [checkAuth, t]);

  const handleLogout = useCallback(async () => {
    await logout();
    setUser(null);
    setAuthStatus('unauthenticated');
  }, []);

  // Обработка startapp параметра для deep linking
  useEffect(() => {
    const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp & { initDataUnsafe?: { start_param?: string } } } }).Telegram?.WebApp;
    
    const startParam = tg?.initDataUnsafe?.start_param;
    
    const deepLinkKey = `deep_link_handled_${startParam}`;
    if (startParam && sessionStorage.getItem(deepLinkKey)) {
      // Уже обработали этот deep link, не перенаправляем
    } else if (startParam) {
      // r_<shortCode> — короткая реферальная ссылка (новый формат)
      if (startParam.startsWith('r_')) {
        const code = startParam.slice(2);
        if (code) {
          sessionStorage.setItem(deepLinkKey, '1');
          setRedirecting(true);
          resolveReferralCode(code).then(res => {
            if (res.ok && res.giveawayId && res.referrerUserId) {
              router.push(`/join/${res.giveawayId}?ref=${res.referrerUserId}`);
            } else if (res.ok && res.giveawayId) {
              router.push(`/join/${res.giveawayId}`);
            } else {
              // Код не найден — идём на главную
              setRedirecting(false);
            }
          }).catch(() => setRedirecting(false));
          return;
        }
      }

      // join_<giveawayId> или join_<giveawayId>_ref_<referrerId> (обратная совместимость)
      if (startParam.startsWith('join_')) {
        const parts = startParam.replace('join_', '').split('_ref_');
        const giveawayId = parts[0];
        const referrer = parts[1] || '';
        
        if (giveawayId) {
          sessionStorage.setItem(deepLinkKey, '1');
          setRedirecting(true);
          const url = referrer 
            ? `/join/${giveawayId}?ref=${referrer}`
            : `/join/${giveawayId}`;
          router.push(url);
          return;
        }
      }
      
      // results_<giveawayId> — страница результатов
      if (startParam.startsWith('results_')) {
        const giveawayId = startParam.replace('results_', '');
        if (giveawayId) {
          sessionStorage.setItem(deepLinkKey, '1');
          setRedirecting(true);
          router.push(`/giveaway/${giveawayId}/results`);
          return;
        }
      }
    }
  }, [router]);

  useEffect(() => {
    const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
    setHasTelegram(!!tg?.initData);

    if (tg) {
      tg.expand?.();
      tg.ready?.();
    }

    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (authStatus === 'unauthenticated' && hasTelegram) {
      authenticate();
    }
  }, [authStatus, hasTelegram, authenticate]);

  // Показываем загрузку при редиректе
  if (redirecting) {
    return (
      <main className="min-h-screen p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-3 border-tg-button border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-tg-hint">{tCommon('loading')}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-tg-bg">
      {/* Табы — показываем только для авторизованных */}
      {authStatus === 'authenticated' && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="sticky top-0 z-10 bg-tg-bg border-b border-tg-secondary"
        >
          <div className="max-w-xl mx-auto flex p-2 gap-2">
            <button
              onClick={() => setActiveTab('participant')}
              className={`flex-1 py-3 px-4 rounded-xl font-medium text-sm transition-all duration-300 flex items-center justify-center gap-2 ${
                activeTab === 'participant'
                  ? 'bg-tg-button text-tg-button-text shadow-md'
                  : 'bg-tg-secondary text-tg-text hover:bg-tg-secondary/80'
              }`}
            >
              <AppIcon name="icon-participant" variant="brand" size={18} />
              {tNav('participant')}
            </button>
            <button
              onClick={() => setActiveTab('creator')}
              className={`flex-1 py-3 px-4 rounded-xl font-medium text-sm transition-all duration-300 flex items-center justify-center gap-2 ${
                activeTab === 'creator'
                  ? 'bg-tg-button text-tg-button-text shadow-md'
                  : 'bg-tg-secondary text-tg-text hover:bg-tg-secondary/80'
              }`}
            >
              <AppIcon name="icon-giveaway" variant="brand" size={18} />
              {tNav('creator')}
            </button>
            <button
              onClick={() => router.push('/faq')}
              title="FAQ"
              className="py-3 px-3 rounded-xl font-medium text-sm transition-all duration-300 bg-tg-secondary text-tg-hint hover:bg-tg-secondary/80"
              aria-label="FAQ"
            >
              <AppIcon name="icon-faq" variant="brand" size={20} />
            </button>
          </div>
        </motion.div>
      )}

      <div className="max-w-xl mx-auto p-4">
        <AnimatePresence mode="wait">
          {/* Статус загрузки */}
          {authStatus === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="text-center py-12"
            >
              <div className="animate-spin w-10 h-10 border-3 border-tg-button border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-tg-hint">{tCommon('loading')}</p>
            </motion.div>
          )}

          {/* Не авторизован без Telegram */}
          {authStatus === 'unauthenticated' && !hasTelegram && (
            <FadeIn key="no-tg" delay={0.1}>
              <div className="bg-tg-secondary rounded-xl p-6">
                <h2 className="text-lg font-semibold mb-2">⚠️ {t('auth.openInTelegram')}</h2>
                <p className="text-tg-hint text-sm mb-4">
                  {t('auth.telegramOnly')}
                </p>
                {process.env.NODE_ENV === 'development' && (
                  <button
                    onClick={handleDevLogin}
                    className="w-full bg-tg-button/50 text-tg-button-text rounded-lg py-2 px-4 text-sm"
                  >
                    🔧 {t('auth.devLogin')}
                  </button>
                )}
              </div>
            </FadeIn>
          )}

          {/* Не авторизован с Telegram */}
          {authStatus === 'unauthenticated' && hasTelegram && (
            <FadeIn key="unauth" delay={0.1}>
              <div className="bg-tg-secondary rounded-xl p-6">
                <h2 className="text-lg font-semibold mb-2">{t('errors.unauthorized')}</h2>
                <p className="text-tg-hint text-sm mb-4">
                  {t('auth.clickToLogin')}
                </p>
                <button 
                  onClick={authenticate} 
                  className="w-full bg-tg-button text-tg-button-text rounded-lg py-2 px-4"
                >
                  {t('auth.loginButton')}
                </button>
              </div>
            </FadeIn>
          )}

          {/* Ошибка авторизации */}
          {authStatus === 'error' && (
            <FadeIn key="error" delay={0.1}>
              <div className="bg-tg-secondary rounded-xl p-6">
                <h2 className="text-lg font-semibold mb-2 text-red-500">❌ {tCommon('error')}</h2>
                <p className="text-tg-hint text-sm mb-4">{error || t('errors.connectionError')}</p>
                {(hasTelegram || process.env.NODE_ENV === 'development') && (
                  <button 
                    onClick={hasTelegram ? authenticate : handleDevLogin} 
                    className="w-full bg-tg-button text-tg-button-text rounded-lg py-2 px-4"
                  >
                    {tCommon('tryAgain')}
                  </button>
                )}
              </div>
            </FadeIn>
          )}

          {/* Авторизован — показываем контент по табам */}
          {authStatus === 'authenticated' && (
            <motion.div
              key={`tab-${activeTab}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {activeTab === 'participant' ? (
                <ParticipantSection />
              ) : (
                <CreatorSection />
              )}

              {process.env.NODE_ENV === 'development' && (
                <div className="mt-8 pt-4 border-t border-tg-secondary">
                  <button
                    onClick={handleLogout}
                    className="w-full bg-red-500/10 text-red-500 rounded-lg py-2 px-4 text-sm"
                  >
                    {t('auth.logout')}
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Debug Panel (development only) */}
        <DebugPanel />
      </div>
    </main>
  );
}
