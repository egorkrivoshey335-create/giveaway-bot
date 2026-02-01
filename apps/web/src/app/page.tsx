'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { DebugPanel } from '@/components/DebugPanel';
import { ParticipantSection } from '@/components/ParticipantSection';
import { CreatorSection } from '@/components/CreatorSection';
import {
  authenticateWithTelegram,
  getCurrentUser,
  devLogin,
  logout,
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
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasTelegram, setHasTelegram] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('participant');

  const checkAuth = useCallback(async () => {
    try {
      const result = await getCurrentUser();
      if (result.ok && result.user) {
        setUser(result.user);
        setAuthStatus('authenticated');
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
      setError('No Telegram initData available');
      setAuthStatus('unauthenticated');
      return;
    }

    setAuthStatus('loading');
    setError(null);

    try {
      const authResult = await authenticateWithTelegram(tg.initData);

      if (!authResult.ok) {
        setError(authResult.error || 'Authentication failed');
        setAuthStatus('error');
        return;
      }

      await checkAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication error');
      setAuthStatus('error');
    }
  }, [checkAuth]);

  const handleDevLogin = useCallback(async () => {
    setAuthStatus('loading');
    setError(null);

    try {
      const result = await devLogin();
      if (result.ok) {
        await checkAuth();
      } else {
        setError(result.error || 'Dev login failed');
        setAuthStatus('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dev login error');
      setAuthStatus('error');
    }
  }, [checkAuth]);

  const handleLogout = useCallback(async () => {
    await logout();
    setUser(null);
    setAuthStatus('unauthenticated');
  }, []);

  // Обработка startapp параметра для deep linking
  useEffect(() => {
    const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp & { initDataUnsafe?: { start_param?: string } } } }).Telegram?.WebApp;
    
    // Проверяем start_param из Telegram Mini App
    const startParam = tg?.initDataUnsafe?.start_param;
    
    if (startParam) {
      // join_<giveawayId> или join_<giveawayId>_ref_<referrerId>
      if (startParam.startsWith('join_')) {
        const parts = startParam.replace('join_', '').split('_ref_');
        const giveawayId = parts[0];
        const referrer = parts[1] || '';
        
        if (giveawayId) {
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
          <p className="text-tg-hint">Загрузка...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-tg-bg">
      {/* Табы — показываем только для авторизованных */}
      {authStatus === 'authenticated' && (
        <div className="sticky top-0 z-10 bg-tg-bg border-b border-tg-secondary">
          <div className="max-w-xl mx-auto flex p-2 gap-2">
            <button
              onClick={() => setActiveTab('participant')}
              className={`flex-1 py-3 px-4 rounded-xl font-medium text-sm transition-colors ${
                activeTab === 'participant'
                  ? 'bg-tg-button text-tg-button-text'
                  : 'bg-tg-secondary text-tg-text hover:bg-tg-secondary/80'
              }`}
            >
              🎫 Участник
            </button>
            <button
              onClick={() => setActiveTab('creator')}
              className={`flex-1 py-3 px-4 rounded-xl font-medium text-sm transition-colors ${
                activeTab === 'creator'
                  ? 'bg-tg-button text-tg-button-text'
                  : 'bg-tg-secondary text-tg-text hover:bg-tg-secondary/80'
              }`}
            >
              🎁 Создатель
            </button>
          </div>
        </div>
      )}

      <div className="max-w-xl mx-auto p-4">
        {/* Статус загрузки */}
        {authStatus === 'loading' && (
          <div className="text-center py-12">
            <div className="animate-spin w-10 h-10 border-3 border-tg-button border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-tg-hint">Авторизация...</p>
          </div>
        )}

        {/* Не авторизован без Telegram */}
        {authStatus === 'unauthenticated' && !hasTelegram && (
          <div className="bg-tg-secondary rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-2">⚠️ Откройте в Telegram</h2>
            <p className="text-tg-hint text-sm mb-4">
              Это приложение работает только внутри Telegram Mini App.
            </p>
            <button
              onClick={handleDevLogin}
              className="w-full bg-tg-button/50 text-tg-button-text rounded-lg py-2 px-4 text-sm"
            >
              🔧 Dev Login (только для разработки)
            </button>
          </div>
        )}

        {/* Не авторизован с Telegram */}
        {authStatus === 'unauthenticated' && hasTelegram && (
          <div className="bg-tg-secondary rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-2">Требуется авторизация</h2>
            <p className="text-tg-hint text-sm mb-4">
              Нажмите кнопку для входа через Telegram.
            </p>
            <button 
              onClick={authenticate} 
              className="w-full bg-tg-button text-tg-button-text rounded-lg py-2 px-4"
            >
              Войти
            </button>
          </div>
        )}

        {/* Ошибка авторизации */}
        {authStatus === 'error' && (
          <div className="bg-tg-secondary rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-2 text-red-500">❌ Ошибка авторизации</h2>
            <p className="text-tg-hint text-sm mb-4">{error || 'Неизвестная ошибка'}</p>
            <button 
              onClick={hasTelegram ? authenticate : handleDevLogin} 
              className="w-full bg-tg-button text-tg-button-text rounded-lg py-2 px-4"
            >
              Попробовать снова
            </button>
          </div>
        )}

        {/* Авторизован — показываем контент по табам */}
        {authStatus === 'authenticated' && (
          <>
            {activeTab === 'participant' ? (
              <ParticipantSection />
            ) : (
              <CreatorSection />
            )}

            {/* Кнопка выхода (для отладки) */}
            <div className="mt-8 pt-4 border-t border-tg-secondary">
              <button
                onClick={handleLogout}
                className="w-full bg-red-500/10 text-red-500 rounded-lg py-2 px-4 text-sm"
              >
                Выйти
              </button>
            </div>
          </>
        )}

        {/* Debug Panel (development only) */}
        <DebugPanel />
      </div>
    </main>
  );
}
