import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Настройки трейсинга
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Отключаем replay в development
  replaysOnErrorSampleRate: process.env.NODE_ENV === 'production' ? 1.0 : 0,
  replaysSessionSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,

  // Настройки окружения
  environment: process.env.NODE_ENV,

  // Игнорируем определённые ошибки
  ignoreErrors: [
    // Telegram WebApp ошибки, которые мы не можем контролировать
    'ResizeObserver loop limit exceeded',
    'Non-Error promise rejection captured',
    // Network errors
    'NetworkError',
    'Failed to fetch',
  ],

  // Фильтр событий
  beforeSend(event, hint) {
    // Игнорируем ошибки в dev режиме
    if (process.env.NODE_ENV === 'development') {
      return null;
    }

    // Добавляем контекст Telegram
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
