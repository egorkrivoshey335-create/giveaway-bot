import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Get current directory (ESM compatible)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from repo root as fallback (does not override existing env vars)
const rootEnvPath = resolve(__dirname, '../../../.env');
dotenvConfig({ path: rootEnvPath });

// BOT_TOKEN is optional - bot polling will be disabled without it
const botToken = process.env.BOT_TOKEN;

if (!botToken) {
  console.warn('⚠️ BOT_TOKEN not set. Bot polling will be disabled, only health server will run.');
}

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
} as const;
