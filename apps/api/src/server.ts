import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { config } from './config.js';
import { healthRoutes } from './routes/health.js';
import { dbRoutes } from './routes/db.js';
import { authRoutes } from './routes/auth.js';
import { draftsRoutes } from './routes/drafts.js';
import { channelsRoutes } from './routes/channels.js';
import { postTemplatesRoutes } from './routes/post-templates.js';
import { giveawaysRoutes } from './routes/giveaways.js';
import { internalRoutes } from './routes/internal.js';
import { participationRoutes } from './routes/participation.js';
import { lifecycleRoutes } from './routes/lifecycle.js';
import { catalogRoutes } from './routes/catalog.js';
import { startGiveawayScheduler } from './scheduler/giveaway-lifecycle.js';

const fastify = Fastify({
  logger: {
    level: config.isDev ? 'info' : 'warn',
    transport: config.isDev
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
          },
        }
      : undefined,
  },
});

async function main() {
  try {
    // Register cookie plugin
    await fastify.register(cookie);

    // Register CORS with credentials support
    await fastify.register(cors, {
      origin: config.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Internal-Token'],
    });

    // Register routes
    await fastify.register(healthRoutes);
    await fastify.register(dbRoutes);
    await fastify.register(authRoutes);
    await fastify.register(draftsRoutes);
    await fastify.register(channelsRoutes);
    await fastify.register(postTemplatesRoutes);
    await fastify.register(giveawaysRoutes);
    await fastify.register(participationRoutes);
    await fastify.register(lifecycleRoutes);
    await fastify.register(catalogRoutes);
    await fastify.register(internalRoutes, { prefix: '/internal' });

    // Start server
    await fastify.listen({
      port: config.port,
      host: config.host,
    });

    fastify.log.info(`🚀 API server running at http://localhost:${config.port}`);
    
    // Запускаем scheduler для обработки жизненного цикла розыгрышей
    // Проверяет каждую минуту: SCHEDULED → ACTIVE, ACTIVE → FINISHED
    startGiveawayScheduler(60_000);
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
}

// Graceful shutdown
const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
signals.forEach((signal) => {
  process.on(signal, async () => {
    fastify.log.info(`Received ${signal}, shutting down gracefully...`);
    await fastify.close();
    process.exit(0);
  });
});

main();
