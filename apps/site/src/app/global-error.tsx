'use client';

import { useEffect } from 'react';

/**
 * Global Error Boundary for App Router — catches React render errors
 * Also satisfies Sentry's recommendation to instrument rendering errors
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Report to Sentry if configured
    try {
      const Sentry = require('@sentry/nextjs');
      if (Sentry?.captureException) {
        Sentry.captureException(error);
      }
    } catch {
      // Sentry not configured — ignore
    }
  }, [error]);

  return (
    <html lang="ru">
      <body>
        <div
          style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'system-ui, sans-serif',
            color: '#fff',
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: '480px', padding: '2rem' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>⚠️</div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Что-то пошло не так
            </h1>
            <p style={{ color: '#9ca3af', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
              Произошла непредвиденная ошибка. Пожалуйста, попробуйте снова.
            </p>
            <button
              onClick={reset}
              style={{
                padding: '0.75rem 2rem',
                background: 'linear-gradient(135deg, #f2b6b6, #a855f7)',
                color: '#fff',
                border: 'none',
                borderRadius: '0.75rem',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: 600,
              }}
            >
              Попробовать снова
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
