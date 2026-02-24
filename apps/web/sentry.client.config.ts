import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

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

  beforeSend(event, hint) {
    if (process.env.NODE_ENV === 'development') {
      return null;
    }

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
