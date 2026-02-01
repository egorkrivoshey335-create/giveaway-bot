'use client';

import { useEffect, useState } from 'react';

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
    auth_date?: number;
    hash?: string;
  };
  version: string;
  platform: string;
  colorScheme: string;
  themeParams: Record<string, string>;
}

export function DebugPanel() {
  const [tg, setTg] = useState<TelegramWebApp | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const telegram = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
    if (telegram) {
      setTg(telegram);
    }
  }, []);

  // Only show in development
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  return (
    <div className="mt-8 border-t border-tg-secondary pt-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-sm text-tg-hint flex items-center gap-2"
      >
        🔧 Debug Panel {isOpen ? '▼' : '▶'}
      </button>

      {isOpen && (
        <div className="mt-3 bg-tg-secondary rounded-lg p-3 text-xs font-mono overflow-auto">
          {tg ? (
            <div className="space-y-2">
              <div>
                <strong>User ID:</strong>{' '}
                {tg.initDataUnsafe.user?.id || 'N/A'}
              </div>
              <div>
                <strong>Username:</strong>{' '}
                {tg.initDataUnsafe.user?.username || 'N/A'}
              </div>
              <div>
                <strong>Language:</strong>{' '}
                {tg.initDataUnsafe.user?.language_code || 'N/A'}
              </div>
              <div>
                <strong>Premium:</strong>{' '}
                {tg.initDataUnsafe.user?.is_premium ? 'Yes' : 'No'}
              </div>
              <div>
                <strong>Version:</strong> {tg.version}
              </div>
              <div>
                <strong>Platform:</strong> {tg.platform}
              </div>
              <div>
                <strong>Color Scheme:</strong> {tg.colorScheme}
              </div>
              <div>
                <strong>Has initData:</strong>{' '}
                {tg.initData ? 'Yes' : 'No'}
              </div>
            </div>
          ) : (
            <div className="text-yellow-500">
              Telegram WebApp not detected. Open this page inside Telegram.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
