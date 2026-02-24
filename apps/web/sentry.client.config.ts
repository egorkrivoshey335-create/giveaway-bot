// Sentry is optional - only initializes when package is installed and DSN is configured
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const Sentry = require('@sentry/nextjs') as any;
    Sentry.init({
      dsn,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      replaysOnErrorSampleRate: process.env.NODE_ENV === 'production' ? 1.0 : 0,
      replaysSessionSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
      environment: process.env.NODE_ENV,
      ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'Non-Error promise rejection captured',
        'NetworkError',
        'Failed to fetch',
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      beforeSend(event: any) {
        if (process.env.NODE_ENV === 'development') return null;
        if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
          const tg = window.Telegram.WebApp;
          event.contexts = {
            ...event.contexts,
            telegram: {
              initData: !!tg.initData,
              platform: tg.platform || 'unknown',
              version: tg.version || 'unknown',
              colorScheme: tg.colorScheme || 'unknown',
            },
          };
        }
        return event;
      },
    });
  } catch {
    // @sentry/nextjs not installed, skip initialization
  }
}
