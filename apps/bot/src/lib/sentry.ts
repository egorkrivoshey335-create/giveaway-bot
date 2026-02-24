/**
 * RandomBeast Bot — Sentry Error Tracking
 *
 * 🔒 ЗАДАЧА 1.14: Настройка Sentry для отслеживания ошибок
 */

import * as Sentry from '@sentry/node';
import { config } from '../config.js';
import { createLogger } from './logger.js';

const log = createLogger('sentry');

/**
 * Инициализация Sentry
 */
export function initSentry() {
  if (!config.sentry.enabled) {
    log.info('Disabled (no SENTRY_DSN_BOT)');
    return;
  }

  Sentry.init({
    dsn: config.sentry.dsn,
    environment: config.sentry.environment,
    tracesSampleRate: config.nodeEnv === 'production' ? 0.1 : 1.0,
    
    // Игнорируем некоторые известные ошибки
    ignoreErrors: [
      'bot was stopped', // Graceful shutdown
      'Conflict: terminated by other getUpdates', // Multiple instances
      '429: Too Many Requests', // Rate limiting (expected)
      'ETELEGRAM: 403', // User blocked bot
      'ETELEGRAM: 400', // Bad request (user input)
    ],
    
    beforeSend(event, hint) {
      // Логируем ошибку в консоль для debug
      if (hint.originalException) {
        log.error({ error: hint.originalException }, 'Captured error');
      }
      return event;
    },
  });

  log.info(`Initialized (environment: ${config.sentry.environment})`);
}

/**
 * Обработчик необработанных ошибок
 */
export function setupErrorHandlers() {
  process.on('uncaughtException', (error) => {
    // console.error goes directly to PM2 error log — always visible
    console.error('[UncaughtException]', error);
    // pino requires 'err' key to properly serialize Error objects (message, stack)
    log.error({ err: error }, '[UncaughtException]');
    Sentry.captureException(error);

    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[UnhandledRejection]', reason);
    log.error({ err: reason instanceof Error ? reason : new Error(String(reason)) }, '[UnhandledRejection]');
    Sentry.captureException(reason);
  });
}
