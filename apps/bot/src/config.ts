import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createLogger } from './lib/logger.js';

const log = createLogger('config');

// Get current directory (ESM compatible)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from repo root as fallback (does not override existing env vars)
const rootEnvPath = resolve(__dirname, '../../../.env');
dotenvConfig({ path: rootEnvPath });

// BOT_TOKEN is optional - bot polling will be disabled without it
const botToken = process.env.BOT_TOKEN;

if (!botToken) {
  log.warn('⚠️ BOT_TOKEN not set. Bot polling will be disabled, only health server will run.');
}

// Whitelist пользователей (если пустой — бот открыт для всех)
// Формат: "123456789,987654321" — через запятую Telegram ID
const allowedUsersStr = process.env.ALLOWED_USERS || '';
const allowedUsers = allowedUsersStr
  ? allowedUsersStr.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id))
  : [];

export const config = {
  botToken,
  botEnabled: !!botToken,
  webappUrl: process.env.WEBAPP_URL || 'https://app.randombeast.ru',
  apiUrl: process.env.API_URL || 'http://localhost:4000',
  internalApiToken: process.env.INTERNAL_API_TOKEN || 'dev_internal_token',
  healthPort: parseInt(process.env.BOT_HEALTH_PORT || '4001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',
  supportBot: process.env.SUPPORT_BOT || '@Cosmolex_bot',
  // Whitelist: если пустой массив — доступ для всех
  allowedUsers,
  maintenanceMode: allowedUsers.length > 0,
  
  // 🔒 ЗАДАЧА 1.11: Redis для BullMQ
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  
  // 🔒 ЗАДАЧА 1.14: Sentry для error tracking
  sentry: {
    dsn: process.env.SENTRY_DSN_BOT || '',
    enabled: !!process.env.SENTRY_DSN_BOT,
    environment: process.env.NODE_ENV || 'development',
  },
  
  // 🔒 ЗАДАЧА 1.1: Webhook mode
  webhook: {
    enabled: process.env.WEBHOOK_ENABLED === 'true',
    domain: process.env.WEBHOOK_DOMAIN || '',
    path: process.env.WEBHOOK_PATH || '/webhook/bot',
    port: parseInt(process.env.WEBHOOK_PORT || '8443', 10),
    secret: process.env.WEBHOOK_SECRET || 'randombeast-webhook-secret',
  },
} as const;

/**
 * Проверяет, разрешён ли доступ пользователю
 */
export function isUserAllowed(userId: number): boolean {
  // Если whitelist пустой — разрешено всем
  if (config.allowedUsers.length === 0) {
    return true;
  }
  return config.allowedUsers.includes(userId);
}
