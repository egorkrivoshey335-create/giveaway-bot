/**
 * RandomBeast API — Sentry Error Tracking
 */

import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN_API;
const environment = process.env.NODE_ENV || 'development';

export function initSentry() {
  if (!dsn) {
    console.log('[Sentry] Disabled (no SENTRY_DSN_API)');
    return;
  }

  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
    ignoreErrors: [
      'Not Found',
      'Unauthorized',
    ],
  });

  console.log(`[Sentry] Initialized (environment: ${environment})`);
}

export function captureException(error: unknown, context?: Record<string, unknown>) {
  if (!dsn) return;
  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext('extra', context);
    }
    Sentry.captureException(error);
  });
}

export function setupErrorHandlers() {
  process.on('uncaughtException', (error) => {
    console.error('[UncaughtException]', error);
    Sentry.captureException(error);
    setTimeout(() => process.exit(1), 1000);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[UnhandledRejection]', reason);
    Sentry.captureException(reason);
  });
}
