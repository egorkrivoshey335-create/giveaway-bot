import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { webhookCallback } from 'grammy';
import { config } from './config.js';
import { initSentry, setupErrorHandlers } from './lib/sentry.js';
import { closeRedis } from './lib/redis.js';
import { createLogger } from './lib/logger.js';

const log = createLogger('server');
const DEFAULT_TELEGRAM_STARTUP_TIMEOUT_MS = 12000;

function getTelegramStartupTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.BOT_TELEGRAM_STARTUP_TIMEOUT_MS || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TELEGRAM_STARTUP_TIMEOUT_MS;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;

  return new Promise<T>((resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operation} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      });
  });
}

// 🔒 ЗАДАЧА 1.14: Инициализация Sentry
initSentry();
setupErrorHandlers();

// Only import bot if token is available
let bot: typeof import('./bot.js').bot | null = null;

if (config.botEnabled) {
  const botModule = await import('./bot.js');
  bot = botModule.bot;
  
  // 🔒 ЗАДАЧА 1.11: Запуск BullMQ workers
  log.info('[BullMQ] Starting workers...');
  try {
    await import('./jobs/winner-notifications.js');
    await import('./jobs/reminders.js');
    await import('./jobs/giveaway-start.js');
    await import('./jobs/giveaway-end.js');
    await import('./jobs/channel-check-rights.js');
    await import('./jobs/channel-update-subscribers.js');
    await import('./jobs/creator-daily-summary.js');
    // Subscription lifecycle workers
    await import('./jobs/subscription.js');
    // Subscription periodic check
    const { subscriptionCheckWorker, scheduleSubscriptionCheck } = await import('./jobs/subscription-check.js');
    await scheduleSubscriptionCheck();
    log.info('[BullMQ] ✅ Subscription check scheduled');
    // Giveaway start reminder
    await import('./jobs/start-reminder.js');
    // Cleanup & milestone workers
    await import('./jobs/cleanup.js');
    await import('./jobs/milestones.js');
    // Giveaway user reminders (personal "remind me" button)
    const { giveawayReminderUserWorker, giveawayReminderCheckWorker, scheduleGiveawayReminderCheck } = await import('./jobs/giveaway-reminder-user.js');
    await scheduleGiveawayReminderCheck();
    log.info('[BullMQ] ✅ Giveaway user reminder check scheduled');
    void giveawayReminderUserWorker;
    void giveawayReminderCheckWorker;
    log.info('[BullMQ] ✅ All 14 workers started');
    void subscriptionCheckWorker; // prevent unused warning
  } catch (err) {
    console.error('[BullMQ] Failed to start workers:', err);
    log.error({ err }, '[BullMQ] Failed to start workers — bot continues without job processing');
  }
}

/**
 * Simple HTTP server for health checks
 */
function createHealthServer() {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          service: 'bot',
          mode: config.botEnabled ? 'polling' : 'health-only',
          timestamp: new Date().toISOString(),
        })
      );
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });

  return server;
}

async function main() {
  try {
    const telegramStartupTimeoutMs = getTelegramStartupTimeoutMs();

    // Start health check server (always)
    const healthServer = createHealthServer();
    healthServer.listen(config.healthPort, () => {
      log.info(`🏥 Health server running at http://localhost:${config.healthPort}/health`);
    });

    // Start bot only if token is available
    if (bot && config.botEnabled) {
      log.info('🤖 Starting bot...');
      
      // Установить Menu Button для открытия Mini App
      void withTimeout(
        bot.api.setChatMenuButton({
          menu_button: {
            type: 'web_app',
            text: 'Открыть',
            web_app: {
              url: config.webappUrl,
            },
          },
        }),
        telegramStartupTimeoutMs,
        'setChatMenuButton'
      )
        .then(() => {
          log.info('✅ Menu button установлена');
        })
        .catch((err) => {
          log.warn({ err }, '⚠️ Не удалось установить menu button в ограниченное время');
        });
      
      // 🔒 ЗАДАЧА 1.1: Webhook mode или polling
      if (config.webhook.enabled) {
        log.info('[Webhook] Mode enabled');
        
        // Настройка webhook с secret_token
        const webhookUrl = `${config.webhook.domain}${config.webhook.path}`;
        await withTimeout(
          bot.api.setWebhook(webhookUrl, {
            drop_pending_updates: true,
            secret_token: config.webhook.secret, // 🔒 КРИТИЧНО для безопасности
          }),
          telegramStartupTimeoutMs,
          'setWebhook'
        );
        log.info(`[Webhook] Set to ${webhookUrl}`);
        
        // Создаем HTTP сервер для webhook
        const handleWebhook = webhookCallback(bot, 'http');
        const webhookServer = createServer((req, res) => {
          if (req.url === config.webhook.path && req.method === 'POST') {
            // 🔒 ВАЛИДАЦИЯ SECRET TOKEN
            const secretToken = req.headers['x-telegram-bot-api-secret-token'];
            
            if (secretToken !== config.webhook.secret) {
              log.warn({ 
                ip: req.socket.remoteAddress,
                receivedToken: secretToken ? '***' : 'missing',
              }, '[Webhook] Invalid secret token');
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid secret token' }));
              return;
            }
            
            handleWebhook(req, res);
          } else {
            res.writeHead(404);
            res.end();
          }
        });
        
        webhookServer.listen(config.webhook.port, () => {
          log.info(`[Webhook] ✅ Server listening on port ${config.webhook.port}`);
        });
      } else {
        log.info('[Polling] Mode enabled');
        
        // Удаляем webhook если был установлен
        try {
          await withTimeout(
            bot.api.deleteWebhook({ drop_pending_updates: true }),
            telegramStartupTimeoutMs,
            'deleteWebhook'
          );
        } catch (err) {
          log.warn({ err }, '[Polling] deleteWebhook timed out, continuing startup');
        }
        
        // Запуск long polling with short timeout to avoid CF Worker proxy timeouts
        const pollingTimeoutSec = Number.parseInt(process.env.BOT_POLLING_TIMEOUT || '5', 10);
        log.info({ pollingTimeoutSec }, '[Polling] Using short polling timeout for proxy compatibility');
        await bot.start({
          allowed_updates: ['message', 'callback_query', 'inline_query', 'my_chat_member', 'chat_member', 'pre_checkout_query'],
          onStart: (botInfo) => {
            log.info(`✅ Bot @${botInfo.username} is running!`);
            log.info(`🔗 WebApp URL: ${config.webappUrl}`);
          },
          timeout: pollingTimeoutSec,
        });
      }
    } else {
      log.info('ℹ️ Bot disabled (no BOT_TOKEN). Health server only.');
    }
  } catch (error) {
    log.error({ error }, '❌ Failed to start');
    process.exit(1);
  }
}

// 🔒 ЗАДАЧА 1.14: Graceful shutdown с закрытием всех соединений
const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
signals.forEach((signal) => {
  process.on(signal, async () => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    
    try {
      // Остановка бота
      if (bot) {
        await bot.stop();
        console.log('✅ Bot stopped');
      }
      
      // Закрытие Redis соединения
      await closeRedis();
      
      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  });
});

main();
