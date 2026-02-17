import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { webhookCallback } from 'grammy';
import { config } from './config.js';
import { initSentry, setupErrorHandlers } from './lib/sentry.js';
import { closeRedis } from './lib/redis.js';
import { logger, createLogger } from './lib/logger.js';

const log = createLogger('server');

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
  await import('./jobs/winner-notifications.js');
  await import('./jobs/reminders.js');
  await import('./jobs/giveaway-start.js');
  await import('./jobs/giveaway-end.js');
  await import('./jobs/channel-check-rights.js');
  await import('./jobs/channel-update-subscribers.js');
  await import('./jobs/creator-daily-summary.js');
  log.info('[BullMQ] ✅ Workers started');
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
    // Start health check server (always)
    const healthServer = createHealthServer();
    healthServer.listen(config.healthPort, () => {
      log.info(`🏥 Health server running at http://localhost:${config.healthPort}/health`);
    });

    // Start bot only if token is available
    if (bot && config.botEnabled) {
      log.info('🤖 Starting bot...');
      
      // Установить Menu Button для открытия Mini App
      try {
        await bot.api.setChatMenuButton({
          menu_button: {
            type: 'web_app',
            text: 'Открыть',
            web_app: {
              url: config.webappUrl,
            },
          },
        });
        log.info('✅ Menu button установлена');
      } catch (err) {
        log.error({ err }, '⚠️ Не удалось установить menu button');
      }
      
      // 🔒 ЗАДАЧА 1.1: Webhook mode или polling
      if (config.webhook.enabled) {
        log.info('[Webhook] Mode enabled');
        
        // Настройка webhook с secret_token
        const webhookUrl = `${config.webhook.domain}${config.webhook.path}`;
        await bot.api.setWebhook(webhookUrl, {
          drop_pending_updates: true,
          secret_token: config.webhook.secret, // 🔒 КРИТИЧНО для безопасности
        });
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
        await bot.api.deleteWebhook({ drop_pending_updates: true });
        
        // Запуск long polling
        await bot.start({
          onStart: (botInfo) => {
            log.info(`✅ Bot @${botInfo.username} is running!`);
            log.info(`🔗 WebApp URL: ${config.webappUrl}`);
          },
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
