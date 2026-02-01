'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DebugPanel } from '@/components/DebugPanel';
import {
  authenticateWithTelegram,
  getCurrentUser,
  devLogin,
  logout,
  getDraft,
  discardDraft,
  getChannels,
  deleteChannel,
  getPostTemplates,
  deletePostTemplate,
  undoDeletePostTemplate,
  Draft,
  Channel,
  PostTemplate,
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

// Undo state for post templates
interface UndoState {
  templateId: string;
  undoUntil: number;
}

export default function HomePage() {
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasTelegram, setHasTelegram] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  
  // Draft state
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);

  // Channels state
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);

  // Post templates state
  const [postTemplates, setPostTemplates] = useState<PostTemplate[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  const fetchDraft = useCallback(async () => {
    setDraftLoading(true);
    try {
      const result = await getDraft();
      if (result.ok) {
        setDraft(result.draft);
      }
    } catch (err) {
      console.error('Failed to fetch draft:', err);
    } finally {
      setDraftLoading(false);
    }
  }, []);

  const fetchChannels = useCallback(async () => {
    setChannelsLoading(true);
    try {
      const result = await getChannels();
      if (result.ok && result.channels) {
        setChannels(result.channels);
      }
    } catch (err) {
      console.error('Failed to fetch channels:', err);
    } finally {
      setChannelsLoading(false);
    }
  }, []);

  const fetchPostTemplates = useCallback(async () => {
    setPostsLoading(true);
    try {
      const result = await getPostTemplates();
      if (result.ok && result.templates) {
        setPostTemplates(result.templates);
      }
    } catch (err) {
      console.error('Failed to fetch post templates:', err);
    } finally {
      setPostsLoading(false);
    }
  }, []);


  const handleDiscardDraft = useCallback(async () => {
    if (!draft) return;
    
    if (!confirm('Удалить черновик розыгрыша?')) return;

    setDraftLoading(true);
    try {
      const result = await discardDraft(draft.id);
      if (result.ok) {
        setDraft(null);
      }
    } catch (err) {
      console.error('Failed to discard draft:', err);
    } finally {
      setDraftLoading(false);
    }
  }, [draft]);


  const handleDeleteChannel = useCallback(async (channelId: string) => {
    if (!confirm('Удалить канал из списка?')) return;

    try {
      const result = await deleteChannel(channelId);
      if (result.ok) {
        setChannels(prev => prev.filter(c => c.id !== channelId));
      }
    } catch (err) {
      console.error('Failed to delete channel:', err);
    }
  }, []);

  const handleDeletePostTemplate = useCallback(async (templateId: string) => {
    try {
      const result = await deletePostTemplate(templateId);
      if (result.ok && result.undoUntil) {
        // Remove from list
        setPostTemplates(prev => prev.filter(t => t.id !== templateId));
        
        // Set undo state
        const undoUntilMs = new Date(result.undoUntil).getTime();
        setUndoState({ templateId, undoUntil: undoUntilMs });
        
        // Clear previous timer
        if (undoTimerRef.current) {
          clearTimeout(undoTimerRef.current);
        }
        
        // Auto-clear undo state after deadline
        const timeLeft = undoUntilMs - Date.now();
        if (timeLeft > 0) {
          undoTimerRef.current = setTimeout(() => {
            setUndoState(null);
          }, timeLeft);
        }
      }
    } catch (err) {
      console.error('Failed to delete post template:', err);
    }
  }, []);

  const handleUndoDeletePostTemplate = useCallback(async () => {
    if (!undoState) return;
    
    try {
      const result = await undoDeletePostTemplate(undoState.templateId);
      if (result.ok) {
        // Refresh list to get the restored template
        await fetchPostTemplates();
        setUndoState(null);
        if (undoTimerRef.current) {
          clearTimeout(undoTimerRef.current);
        }
      }
    } catch (err) {
      console.error('Failed to undo delete:', err);
    }
  }, [undoState, fetchPostTemplates]);

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
    setDraft(null);
    setChannels([]);
    setPostTemplates([]);
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

  useEffect(() => {
    if (authStatus === 'authenticated') {
      fetchDraft();
      fetchChannels();
      fetchPostTemplates();
    }
  }, [authStatus, fetchDraft, fetchChannels, fetchPostTemplates]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

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
    <main className="min-h-screen p-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-8 pt-4">
          <h1 className="text-2xl font-bold mb-2">🎁 RandomBeast</h1>
          <p className="text-tg-hint">Mini App</p>
        </div>

        {/* Auth Status Card */}
        <div className="bg-tg-secondary rounded-xl p-6 mb-6">
          {authStatus === 'loading' && (
            <div className="text-center">
              <div className="animate-spin w-8 h-8 border-2 border-tg-button border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-tg-hint">Авторизация...</p>
            </div>
          )}

          {authStatus === 'authenticated' && user && (
            <>
              <h2 className="text-lg font-semibold mb-4">✅ Вы авторизованы</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-tg-hint">Telegram ID:</span>
                  <span className="font-mono">{user.telegramUserId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-tg-hint">Язык:</span>
                  <span className="uppercase">{user.language}</span>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="mt-4 w-full bg-red-500/10 text-red-500 rounded-lg py-2 px-4 text-sm"
              >
                Выйти
              </button>
            </>
          )}

          {authStatus === 'unauthenticated' && !hasTelegram && (
            <>
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
            </>
          )}

          {authStatus === 'unauthenticated' && hasTelegram && (
            <>
              <h2 className="text-lg font-semibold mb-2">Требуется авторизация</h2>
              <p className="text-tg-hint text-sm mb-4">
                Нажмите кнопку для входа через Telegram.
              </p>
              <button onClick={authenticate} className="w-full bg-tg-button text-tg-button-text rounded-lg py-2 px-4">
                Войти
              </button>
            </>
          )}

          {authStatus === 'error' && (
            <>
              <h2 className="text-lg font-semibold mb-2 text-red-500">❌ Ошибка авторизации</h2>
              <p className="text-tg-hint text-sm mb-4">{error || 'Неизвестная ошибка'}</p>
              <button onClick={hasTelegram ? authenticate : handleDevLogin} className="w-full bg-tg-button text-tg-button-text rounded-lg py-2 px-4">
                Попробовать снова
              </button>
            </>
          )}
        </div>

        {/* Status Indicators */}
        <div className="bg-tg-secondary rounded-xl p-4 mb-6 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>Telegram WebApp</span>
            <span className={hasTelegram ? 'text-green-500' : 'text-yellow-500'}>
              {hasTelegram ? '✓ Подключено' : '⚠ Не подключено'}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>API Сессия</span>
            <span className={authStatus === 'authenticated' ? 'text-green-500' : 'text-yellow-500'}>
              {authStatus === 'authenticated' ? '✓ Активна' : '⚠ Не активна'}
            </span>
          </div>
        </div>

        {/* Draft Section */}
        {authStatus === 'authenticated' && (
          <div className="space-y-4 mb-6">
            {draftLoading ? (
              <div className="bg-tg-secondary rounded-xl p-4">
                <div className="flex items-center justify-center">
                  <div className="animate-spin w-5 h-5 border-2 border-tg-button border-t-transparent rounded-full mr-2" />
                  <span className="text-tg-hint text-sm">Загрузка...</span>
                </div>
              </div>
            ) : draft ? (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-yellow-600">📝 Есть черновик</h3>
                    <p className="text-sm text-tg-hint mt-1">
                      Шаг: <span className="font-medium">{draft.wizardStep || 'начало'}</span>
                    </p>
                  </div>
                  <span className="text-xs text-tg-hint bg-tg-secondary px-2 py-1 rounded">v{draft.draftVersion}</span>
                </div>
                <div className="flex gap-2">
                  <Link
                    href="/creator/giveaway/new"
                    className="flex-1 bg-tg-button text-tg-button-text rounded-lg py-2 px-3 text-sm font-medium text-center"
                  >
                    ▶️ Продолжить
                  </Link>
                  <button onClick={handleDiscardDraft} className="bg-red-500/10 text-red-500 rounded-lg py-2 px-3 text-sm">
                    🗑️
                  </button>
                </div>
              </div>
            ) : (
              <Link
                href="/creator/giveaway/new"
                className="block w-full bg-tg-button text-tg-button-text rounded-xl py-3 px-4 font-medium text-center"
              >
                🎁 Создать розыгрыш
              </Link>
            )}

            <button className="w-full bg-tg-secondary text-tg-text rounded-xl py-3 px-4 font-medium opacity-50" disabled>
              📋 Мои розыгрыши (скоро)
            </button>
          </div>
        )}

        {/* Channels Section */}
        {authStatus === 'authenticated' && (
          <div className="bg-tg-secondary rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">📣 Мои каналы</h3>
              <button onClick={fetchChannels} className="text-tg-button text-sm" disabled={channelsLoading}>
                {channelsLoading ? '...' : '🔄'}
              </button>
            </div>

            {channelsLoading ? (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin w-5 h-5 border-2 border-tg-button border-t-transparent rounded-full mr-2" />
                <span className="text-tg-hint text-sm">Загрузка...</span>
              </div>
            ) : channels.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-tg-hint text-sm mb-3">У вас пока нет добавленных каналов</p>
                <p className="text-tg-hint text-xs">Добавьте каналы через бота: @BeastRandomBot</p>
              </div>
            ) : (
              <div className="space-y-3">
                {channels.map((channel) => (
                  <div key={channel.id} className="bg-tg-bg rounded-lg p-3 flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{channel.type === 'CHANNEL' ? '📢' : '👥'}</span>
                        <span className="font-medium truncate">{channel.title}</span>
                      </div>
                      {channel.username && <p className="text-sm text-tg-hint mt-0.5">@{channel.username}</p>}
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className={`text-xs px-2 py-0.5 rounded ${channel.botIsAdmin ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                          {channel.botIsAdmin ? '✓ Бот админ' : '✗ Бот не админ'}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded ${channel.creatorIsAdmin ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                          {channel.creatorIsAdmin ? '✓ Вы админ' : '✗ Вы не админ'}
                        </span>
                      </div>
                    </div>
                    <button onClick={() => handleDeleteChannel(channel.id)} className="text-red-500 text-sm ml-2 p-1" title="Удалить канал">
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Post Templates Section */}
        {authStatus === 'authenticated' && (
          <div className="bg-tg-secondary rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">📝 Посты</h3>
              <button onClick={fetchPostTemplates} className="text-tg-button text-sm" disabled={postsLoading}>
                {postsLoading ? '...' : '🔄'}
              </button>
            </div>

            {/* Undo Banner */}
            {undoState && Date.now() < undoState.undoUntil && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-4 flex items-center justify-between">
                <span className="text-sm text-yellow-600">Пост удалён</span>
                <button onClick={handleUndoDeletePostTemplate} className="text-sm text-tg-button font-medium">
                  ↩️ Вернуть
                </button>
              </div>
            )}

            {postsLoading ? (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin w-5 h-5 border-2 border-tg-button border-t-transparent rounded-full mr-2" />
                <span className="text-tg-hint text-sm">Загрузка...</span>
              </div>
            ) : postTemplates.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-tg-hint text-sm mb-3">Постов нет</p>
                <p className="text-tg-hint text-xs">Создайте пост в боте: @BeastRandomBot → 📝 Посты</p>
              </div>
            ) : (
              <div className="space-y-3">
                {postTemplates.map((post) => (
                  <div key={post.id} className="bg-tg-bg rounded-lg p-3 flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">
                          {post.mediaType === 'NONE' ? '📄' : post.mediaType === 'PHOTO' ? '🖼️' : '🎬'}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          post.mediaType === 'NONE' 
                            ? 'bg-gray-500/10 text-gray-500' 
                            : post.mediaType === 'PHOTO' 
                              ? 'bg-blue-500/10 text-blue-500' 
                              : 'bg-purple-500/10 text-purple-500'
                        }`}>
                          {post.mediaType === 'NONE' ? 'Текст' : post.mediaType === 'PHOTO' ? 'Фото' : 'Видео'}
                        </span>
                      </div>
                      <p className="text-sm text-tg-text line-clamp-2">{post.text}</p>
                      <p className="text-xs text-tg-hint mt-1">
                        {new Date(post.createdAt).toLocaleString('ru-RU')}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeletePostTemplate(post.id)}
                      className="text-red-500 text-sm ml-2 p-1"
                      title="Удалить пост"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Debug Panel (development only) */}
        <DebugPanel />
      </div>
    </main>
  );
}
