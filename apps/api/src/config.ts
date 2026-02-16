import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

// Get current directory (ESM compatible)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from repo root as fallback (does not override existing env vars)
const rootEnvPath = resolve(__dirname, '../../../.env');
dotenvConfig({ path: rootEnvPath });

// Environment schema
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().optional(),
  HOST: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  TMA_BOT_TOKEN: z.string().optional(),
  BOT_TOKEN: z.string().optional(), // Токен бота для проверки подписок
  SESSION_SECRET: z.string().min(32).optional(),
  COOKIE_DOMAIN: z.string().optional(),
  INTERNAL_API_TOKEN: z.string().optional(),
  API_URL: z.string().optional(),
  // YooKassa
  YOOKASSA_SHOP_ID: z.string().optional(),
  YOOKASSA_SECRET_KEY: z.string().optional(),
  YOOKASSA_RETURN_URL: z.string().optional(),
  WEBAPP_URL: z.string().optional(),
});

const env = envSchema.parse(process.env);

// Whitelist пользователей (если пустой — открыто для всех)
const allowedUsersStr = process.env.ALLOWED_USERS || '';
const allowedUsers = allowedUsersStr
  ? allowedUsersStr.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id))
  : [];

export const config = {
  port: parseInt(env.PORT || '4000', 10),
  host: env.HOST || '0.0.0.0',
  nodeEnv: env.NODE_ENV,
  isDev: env.NODE_ENV !== 'production',

  // CORS origins
  corsOrigins: [
    // Development
    'http://localhost:3000', // web (mini app)
    'http://localhost:3001', // site (marketing)
    // Production
    'https://app.randombeast.ru',
    'https://randombeast.ru',
    'https://www.randombeast.ru',
    'https://api.randombeast.ru',
  ] as string[],

  // Redis
  redis: {
    url: env.REDIS_URL || 'redis://localhost:6379',
  },

  // Database
  databaseUrl: env.DATABASE_URL,

  // Redis (for future use)
  redisUrl: env.REDIS_URL,

  // Auth
  auth: {
    tmaBotToken: env.TMA_BOT_TOKEN,
    sessionSecret: env.SESSION_SECRET || 'dev_session_secret_change_in_production_32chars',
    cookieDomain: env.COOKIE_DOMAIN, // undefined in dev
    cookieName: 'rb_session',
    // initData expiration: 1 hour
    initDataExpiresIn: 3600,
  },

  // Internal API (bot <-> api)
  internalApiToken: env.INTERNAL_API_TOKEN || 'dev_internal_token',
  
  // Bot token для проверки подписок через Telegram API
  botToken: env.BOT_TOKEN || env.TMA_BOT_TOKEN,
  
  // API URL для внутренних вызовов
  apiUrl: env.API_URL || 'http://localhost:4000',
  
  // YooKassa
  yookassa: {
    shopId: env.YOOKASSA_SHOP_ID,
    secretKey: env.YOOKASSA_SECRET_KEY,
    webhookSecret: env.YOOKASSA_SECRET_KEY, // Use the same secret for webhooks
    returnUrl: env.YOOKASSA_RETURN_URL || env.WEBAPP_URL + '/payments/return' || 'http://localhost:3000/payments/return',
  },
  
  // Web App URL
  webappUrl: env.WEBAPP_URL || 'http://localhost:3000',
  
  // Whitelist: если пустой — доступ для всех
  allowedUsers,
  maintenanceMode: allowedUsers.length > 0,
} as const;

/**
 * Проверяет, разрешён ли доступ пользователю по Telegram ID
 */
export function isUserAllowed(telegramUserId: number | bigint): boolean {
  if (config.allowedUsers.length === 0) {
    return true;
  }
  return config.allowedUsers.includes(Number(telegramUserId));
}

// Validation helpers
export function requireTmaBotToken(): string {
  if (!config.auth.tmaBotToken) {
    throw new Error('TMA_BOT_TOKEN is required for auth endpoints');
  }
  return config.auth.tmaBotToken;
}
