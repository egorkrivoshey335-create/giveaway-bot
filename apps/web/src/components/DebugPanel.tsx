'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useUserStore } from '@/stores/useUserStore';
import { useDraftStore } from '@/stores/useDraftStore';
import { useAppStore } from '@/stores/useAppStore';
import { useDebugStore } from '@/stores/useDebugStore';
import type { ApiLogEntry, ErrorLogEntry } from '@/stores/useDebugStore';

// ─── Guard: только development ───────────────────────────────────────────────

if (process.env.NODE_ENV === 'production') {
  // Tree-shaken out completely in production builds
}

// ─── Telegram WebApp type ─────────────────────────────────────────────────────

interface TgWebApp {
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
    auth_date?: number;
    hash?: string;
    query_id?: string;
  };
  version: string;
  platform: string;
  colorScheme: string;
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'user' | 'stores' | 'api' | 'errors' | 'tools';

const TABS: { id: Tab; label: string }[] = [
  { id: 'user',   label: 'User' },
  { id: 'stores', label: 'Stores' },
  { id: 'api',    label: 'API' },
  { id: 'errors', label: 'Errors' },
  { id: 'tools',  label: 'Tools' },
];

// ─── Fetch interceptor (установлен единожды) ──────────────────────────────────

let fetchIntercepted = false;

function installFetchInterceptor() {
  if (fetchIntercepted || typeof window === 'undefined') return;
  fetchIntercepted = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const id = crypto.randomUUID();
    const method = (init?.method ?? 'GET').toUpperCase();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const startAt = Date.now();

    let requestBody: string | undefined;
    if (init?.body && typeof init.body === 'string') {
      try {
        requestBody = JSON.stringify(JSON.parse(init.body), null, 2);
      } catch {
        requestBody = String(init.body).slice(0, 500);
      }
    }

    try {
      const response = await originalFetch(input, init);
      const durationMs = Date.now() - startAt;

      let responseBody: string | undefined;
      // Clone response to read body without consuming it
      const clone = response.clone();
      clone.text().then(text => {
        try {
          responseBody = JSON.stringify(JSON.parse(text), null, 2).slice(0, 2000);
        } catch {
          responseBody = text.slice(0, 500);
        }
        useDebugStore.getState().logApiRequest({
          id,
          method,
          url,
          status: response.status,
          ok: response.ok,
          durationMs,
          timestamp: new Date(startAt),
          requestBody,
          responseBody,
        } as ApiLogEntry);
      }).catch(() => {
        useDebugStore.getState().logApiRequest({
          id,
          method,
          url,
          status: response.status,
          ok: response.ok,
          durationMs,
          timestamp: new Date(startAt),
          requestBody,
        } as ApiLogEntry);
      });

      return response;
    } catch (err) {
      const durationMs = Date.now() - startAt;
      useDebugStore.getState().logApiRequest({
        id,
        method,
        url,
        status: null,
        ok: false,
        durationMs,
        timestamp: new Date(startAt),
        requestBody,
        error: err instanceof Error ? err.message : String(err),
      } as ApiLogEntry);
      throw err;
    }
  };
}

// ─── Error interceptor ────────────────────────────────────────────────────────

let errorIntercepted = false;

function installErrorInterceptor() {
  if (errorIntercepted || typeof window === 'undefined') return;
  errorIntercepted = true;

  window.addEventListener('error', (event) => {
    useDebugStore.getState().logError({
      id: crypto.randomUUID(),
      type: 'runtime',
      message: event.message,
      source: event.filename,
      lineno: event.lineno,
      stack: event.error?.stack,
      timestamp: new Date(),
    } as ErrorLogEntry);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    useDebugStore.getState().logError({
      id: crypto.randomUUID(),
      type: 'unhandled_rejection',
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
      timestamp: new Date(),
    } as ErrorLogEntry);
  });
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function JsonView({ data }: { data: unknown }) {
  return (
    <pre className="text-[10px] leading-relaxed whitespace-pre-wrap break-all text-emerald-300 overflow-auto max-h-48">
      {JSON.stringify(data, (_, v) =>
        typeof v === 'bigint' ? v.toString() : v,
        2
      )}
    </pre>
  );
}

function TabUser({ tg }: { tg: TgWebApp | null }) {
  const user = useUserStore(s => s.user);
  const isAuthenticated = useUserStore(s => s.isAuthenticated);
  const isLoading = useUserStore(s => s.isLoading);

  return (
    <div className="space-y-3">
      <section>
        <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">App Auth State</p>
        <div className="bg-slate-800 rounded p-2 space-y-1 text-[11px]">
          <Row label="Authenticated" value={isAuthenticated ? '✅ yes' : '❌ no'} />
          <Row label="Loading" value={isLoading ? '⏳ yes' : 'no'} />
          {user && (
            <>
              <Row label="ID" value={user.id} />
              <Row label="Telegram ID" value={user.telegramUserId} />
              <Row label="Name" value={[user.firstName, user.lastName].filter(Boolean).join(' ')} />
              <Row label="Username" value={user.username ? `@${user.username}` : '—'} />
              <Row label="Lang" value={user.language} />
            </>
          )}
        </div>
      </section>

      <section>
        <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Telegram WebApp</p>
        {tg ? (
          <div className="bg-slate-800 rounded p-2 space-y-1 text-[11px]">
            <Row label="TG User ID" value={tg.initDataUnsafe.user?.id} />
            <Row label="Username" value={tg.initDataUnsafe.user?.username ?? '—'} />
            <Row label="Name" value={tg.initDataUnsafe.user?.first_name} />
            <Row label="Premium" value={tg.initDataUnsafe.user?.is_premium ? '✅' : '❌'} />
            <Row label="Version" value={tg.version} />
            <Row label="Platform" value={tg.platform} />
            <Row label="Color" value={tg.colorScheme} />
            <Row label="has initData" value={tg.initData ? `✅ (${tg.initData.length} chars)` : '❌'} />
          </div>
        ) : (
          <div className="bg-slate-800 rounded p-2 text-yellow-400 text-[11px]">
            Not inside Telegram (WebApp not detected)
          </div>
        )}
      </section>
    </div>
  );
}

function TabStores() {
  const [snapshot, setSnapshot] = useState<{
    user: object;
    draft: object;
    app: object;
  } | null>(null);

  const refresh = useCallback(() => {
    const userState = useUserStore.getState();
    const draftState = useDraftStore.getState();
    const appState = useAppStore.getState();

    setSnapshot({
      user: {
        user: userState.user,
        isAuthenticated: userState.isAuthenticated,
        isLoading: userState.isLoading,
        error: userState.error,
      },
      draft: {
        currentStep: draftState.currentStep,
        payload: draftState.payload,
        isDirty: draftState.isDirty,
        lastSavedAt: draftState.lastSavedAt,
      },
      app: {
        isBottomSheetOpen: appState.isBottomSheetOpen,
        toastMessage: appState.toastMessage,
        toastType: appState.toastType,
        globalLoading: appState.globalLoading,
        loadingMessage: appState.loadingMessage,
        pendingDeepLink: appState.pendingDeepLink,
      },
    });
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (!snapshot) return <div className="text-slate-400 text-[11px]">Loading...</div>;

  return (
    <div className="space-y-3">
      {Object.entries(snapshot).map(([name, data]) => (
        <section key={name}>
          <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">{name}Store</p>
          <div className="bg-slate-800 rounded p-2">
            <JsonView data={data} />
          </div>
        </section>
      ))}
    </div>
  );
}

function TabApi() {
  const apiLog = useDebugStore(s => s.apiLog);
  const clearApiLog = useDebugStore(s => s.clearApiLog);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <span className="text-[10px] text-slate-400">{apiLog.length} requests (last 50)</span>
        <button
          onClick={clearApiLog}
          className="text-[10px] text-red-400 hover:text-red-300"
        >
          Clear
        </button>
      </div>
      {apiLog.length === 0 ? (
        <div className="text-slate-500 text-[11px] py-4 text-center">No requests yet</div>
      ) : (
        <div className="space-y-1">
          {apiLog.map(entry => (
            <div key={entry.id} className="bg-slate-800 rounded">
              <button
                onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                className="w-full text-left p-2 flex items-center gap-2"
              >
                <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${
                  entry.ok ? 'bg-emerald-900 text-emerald-300' : 'bg-red-900 text-red-300'
                }`}>
                  {entry.method}
                </span>
                <span className={`text-[9px] font-mono ${
                  entry.status === null ? 'text-red-400' :
                  entry.status >= 500 ? 'text-red-400' :
                  entry.status >= 400 ? 'text-yellow-400' :
                  'text-emerald-400'
                }`}>
                  {entry.status ?? 'ERR'}
                </span>
                <span className="text-[10px] text-slate-300 truncate flex-1">
                  {entry.url.replace(window?.location?.origin ?? '', '')}
                </span>
                <span className="text-[9px] text-slate-500 shrink-0">{entry.durationMs}ms</span>
              </button>
              {expanded === entry.id && (
                <div className="px-2 pb-2 space-y-1.5 border-t border-slate-700 pt-1.5">
                  <p className="text-[9px] text-slate-500">
                    {entry.timestamp.toLocaleTimeString()}
                  </p>
                  {entry.error && (
                    <div>
                      <p className="text-[9px] text-red-400 mb-0.5">Error</p>
                      <pre className="text-[10px] text-red-300 whitespace-pre-wrap">{entry.error}</pre>
                    </div>
                  )}
                  {entry.requestBody && (
                    <div>
                      <p className="text-[9px] text-slate-400 mb-0.5">Request Body</p>
                      <pre className="text-[10px] text-sky-300 whitespace-pre-wrap max-h-24 overflow-auto">{entry.requestBody}</pre>
                    </div>
                  )}
                  {entry.responseBody && (
                    <div>
                      <p className="text-[9px] text-slate-400 mb-0.5">Response</p>
                      <pre className="text-[10px] text-emerald-300 whitespace-pre-wrap max-h-36 overflow-auto">{entry.responseBody}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TabErrors() {
  const errorLog = useDebugStore(s => s.errorLog);
  const clearErrorLog = useDebugStore(s => s.clearErrorLog);

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <span className="text-[10px] text-slate-400">{errorLog.length} errors (last 30)</span>
        <button
          onClick={clearErrorLog}
          className="text-[10px] text-red-400 hover:text-red-300"
        >
          Clear
        </button>
      </div>
      {errorLog.length === 0 ? (
        <div className="text-slate-500 text-[11px] py-4 text-center">No errors 🎉</div>
      ) : (
        <div className="space-y-2">
          {errorLog.map(entry => (
            <div key={entry.id} className="bg-slate-800 rounded p-2 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[9px] bg-red-900 text-red-300 px-1 py-0.5 rounded uppercase">
                  {entry.type}
                </span>
                <span className="text-[9px] text-slate-500">
                  {entry.timestamp.toLocaleTimeString()}
                </span>
              </div>
              <p className="text-[11px] text-red-300">{entry.message}</p>
              {entry.source && (
                <p className="text-[9px] text-slate-400">{entry.source}:{entry.lineno}</p>
              )}
              {entry.stack && (
                <pre className="text-[9px] text-slate-400 whitespace-pre-wrap overflow-auto max-h-24">{entry.stack}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TabTools() {
  const [locale, setLocale] = useState('ru');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const match = document.cookie.match(/locale=([^;]+)/);
    if (match) setLocale(match[1]);
  }, []);

  const switchLocale = (l: string) => {
    document.cookie = `locale=${l}; path=/; max-age=31536000`;
    setLocale(l);
    window.location.reload();
  };

  const clearCache = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      setMessage('✅ localStorage + sessionStorage cleared. Reloading...');
      setTimeout(() => window.location.reload(), 800);
    } catch {
      setMessage('❌ Failed to clear storage');
    }
  };

  const clearCookies = () => {
    document.cookie.split(';').forEach(c => {
      const key = c.split('=')[0].trim();
      document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    });
    setMessage('✅ Cookies cleared. Reloading...');
    setTimeout(() => window.location.reload(), 800);
  };

  const devLogin = async (telegramUserId: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/auth/dev`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramUserId }),
        credentials: 'include',
      });
      const data = await res.json();
      if (data.ok) {
        setMessage(`✅ Dev login as ${telegramUserId}`);
        setTimeout(() => window.location.reload(), 500);
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch {
      setMessage('❌ Network error');
    }
  };

  return (
    <div className="space-y-4">
      {message && (
        <div className="bg-slate-800 rounded p-2 text-[11px] text-yellow-300">{message}</div>
      )}

      <section>
        <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Language</p>
        <div className="flex gap-2">
          {['ru', 'en', 'kk'].map(l => (
            <button
              key={l}
              onClick={() => switchLocale(l)}
              className={`px-3 py-1.5 rounded text-[11px] font-medium transition-colors ${
                locale === l
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {l === 'ru' ? '🇷🇺 RU' : l === 'en' ? '🇬🇧 EN' : '🇰🇿 KK'}
            </button>
          ))}
        </div>
      </section>

      <section>
        <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Dev Login (seed users)</p>
        <div className="space-y-1.5">
          {[
            { label: '👤 Alice (FREE)', id: '123456789' },
            { label: '✨ Bob (PLUS)', id: '987654321' },
            { label: '🚀 Charlie (PRO)', id: '111222333' },
          ].map(({ label, id }) => (
            <button
              key={id}
              onClick={() => devLogin(id)}
              className="w-full text-left px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-[11px] text-slate-200 transition-colors"
            >
              {label} <span className="text-slate-400">({id})</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Storage</p>
        <div className="space-y-1.5">
          <button
            onClick={clearCache}
            className="w-full px-3 py-1.5 bg-red-900/60 hover:bg-red-800/60 text-red-300 rounded text-[11px] transition-colors"
          >
            🗑 Clear localStorage + sessionStorage
          </button>
          <button
            onClick={clearCookies}
            className="w-full px-3 py-1.5 bg-orange-900/60 hover:bg-orange-800/60 text-orange-300 rounded text-[11px] transition-colors"
          >
            🍪 Clear all cookies (logout)
          </button>
        </div>
      </section>

      <section>
        <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Build Info</p>
        <div className="bg-slate-800 rounded p-2 space-y-1 text-[11px]">
          <Row label="NODE_ENV" value={process.env.NODE_ENV} />
          <Row label="API URL" value={process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'} />
          <Row label="Build" value={process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev'} />
        </div>
      </section>
    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-400 shrink-0">{label}</span>
      <span className="text-slate-200 text-right truncate max-w-[160px]">{String(value ?? '—')}</span>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function DebugPanel() {
  const [tg, setTg] = useState<TgWebApp | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('user');
  const errorCount = useDebugStore(s => s.errorLog.length);
  const panelRef = useRef<HTMLDivElement>(null);
  const isDev = process.env.NODE_ENV !== 'production';

  useEffect(() => {
    if (!isDev) return;
    installFetchInterceptor();
    installErrorInterceptor();
    const webapp = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
    if (webapp) setTg(webapp);
  }, [isDev]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen]);

  // Only render in development
  if (!isDev) return null;

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className="fixed bottom-4 right-4 z-[9990] w-10 h-10 rounded-full bg-slate-900 border border-slate-700 shadow-lg flex items-center justify-center text-base hover:bg-slate-800 transition-colors"
        title="Debug Panel (Dev only)"
        aria-label="Open debug panel"
      >
        {errorCount > 0 ? (
          <span className="relative">
            🔧
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full text-[8px] text-white flex items-center justify-center leading-none">
              {errorCount > 9 ? '!' : errorCount}
            </span>
          </span>
        ) : '🔧'}
      </button>

      {/* Panel overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[9999] flex flex-col"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false); }}
        >
          <div
            ref={panelRef}
            className="mt-auto w-full bg-slate-900 rounded-t-2xl flex flex-col"
            style={{ maxHeight: '85vh' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-white">Debug Panel</span>
                <span className="text-[9px] bg-yellow-600/40 text-yellow-300 px-1.5 py-0.5 rounded font-mono">DEV</span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-white text-lg leading-none"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-0 border-b border-slate-700 shrink-0 overflow-x-auto">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-2 text-[11px] font-medium whitespace-nowrap transition-colors relative ${
                    activeTab === tab.id
                      ? 'text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                  {tab.id === 'errors' && errorCount > 0 && (
                    <span className="ml-1 bg-red-500 text-white text-[8px] px-1 rounded-full">
                      {errorCount}
                    </span>
                  )}
                  {activeTab === tab.id && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t" />
                  )}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-3 text-sm font-mono">
              {activeTab === 'user'   && <TabUser tg={tg} />}
              {activeTab === 'stores' && <TabStores />}
              {activeTab === 'api'    && <TabApi />}
              {activeTab === 'errors' && <TabErrors />}
              {activeTab === 'tools'  && <TabTools />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
