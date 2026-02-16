import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { webhookCallback } from 'grammy';
import { config } from './config.js';
import { initSentry, setupErrorHandlers } from './lib/sentry.js';
import { closeRedis } from './lib/redis.js';

// 🔒 ЗАДАЧА 1.14: Инициализация Sentry
initSentry();
setupErrorHandlers();

// Only import bot if token is available
let bot: typeof import('./bot.js').bot | null = null;

if (config.botEnabled) {
  const botModule = await import('./bot.js');
  bot = botModule.bot;
  
  // 🔒 ЗАДАЧА 1.11: Запуск BullMQ workers
  console.log('[BullMQ] Starting workers...');
  await import('./jobs/winner-notifications.js');
  await import('./jobs/reminders.js');
  console.log('[BullMQ] ✅ Workers started');
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
      console.log(`🏥 Health server running at http://localhost:${config.healthPort}/health`);
    });

    // Start bot only if token is available
    if (bot && config.botEnabled) {
      console.log('🤖 Starting bot...');
      
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
        console.log('✅ Menu button установлена');
      } catch (err) {
        console.error('⚠️ Не удалось установить menu button:', err);
      }
      
      // 🔒 ЗАДАЧА 1.1: Webhook mode или polling
      if (config.webhook.enabled) {
        console.log('[Webhook] Mode enabled');
        
        // Настройка webhook
        const webhookUrl = `${config.webhook.domain}${config.webhook.path}`;
        await bot.api.setWebhook(webhookUrl, {
          drop_pending_updates: true,
        });
        console.log(`[Webhook] Set to ${webhookUrl}`);
        
        // Создаем HTTP сервер для webhook
        const handleWebhook = webhookCallback(bot, 'http');
        const webhookServer = createServer((req, res) => {
          if (req.url === config.webhook.path && req.method === 'POST') {
            handleWebhook(req, res);
          } else {
            res.writeHead(404);
            res.end();
          }
        });
        
        webhookServer.listen(config.webhook.port, () => {
          console.log(`[Webhook] ✅ Server listening on port ${config.webhook.port}`);
        });
      } else {
        console.log('[Polling] Mode enabled');
        
        // Удаляем webhook если был установлен
        await bot.api.deleteWebhook({ drop_pending_updates: true });
        
        // Запуск long polling
        await bot.start({
          onStart: (botInfo) => {
            console.log(`✅ Bot @${botInfo.username} is running!`);
            console.log(`🔗 WebApp URL: ${config.webappUrl}`);
          },
        });
      }
    } else {
      console.log('ℹ️ Bot disabled (no BOT_TOKEN). Health server only.');
    }
  } catch (error) {
    console.error('❌ Failed to start:', error);
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
