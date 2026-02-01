import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { config } from './config.js';

// Only import bot if token is available
let bot: typeof import('./bot.js').bot | null = null;

if (config.botEnabled) {
  const botModule = await import('./bot.js');
  bot = botModule.bot;
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

    // Start bot polling only if token is available
    if (bot && config.botEnabled) {
      console.log('🤖 Starting bot...');
      await bot.start({
        onStart: (botInfo) => {
          console.log(`✅ Bot @${botInfo.username} is running!`);
          console.log(`🔗 WebApp URL: ${config.webappUrl}`);
        },
      });
    } else {
      console.log('ℹ️ Bot polling disabled (no BOT_TOKEN). Health server only.');
    }
  } catch (error) {
    console.error('❌ Failed to start:', error);
    process.exit(1);
  }
}

// Graceful shutdown
const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
signals.forEach((signal) => {
  process.on(signal, () => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    if (bot) {
      bot.stop();
    }
    process.exit(0);
  });
});

main();
