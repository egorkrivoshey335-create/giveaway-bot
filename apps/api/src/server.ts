import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { config } from './config.js';
import responseHelpers from './lib/response.js';
import { redis, closeRedis } from './lib/redis.js';
import { ErrorCode, formatError } from '@randombeast/shared';
import { healthRoutes } from './routes/health.js';
import { dbRoutes } from './routes/db.js';
import { authRoutes } from './routes/auth.js';
import { draftsRoutes } from './routes/drafts.js';
import { channelsRoutes } from './routes/channels.js';
import { postTemplatesRoutes } from './routes/post-templates.js';
import { giveawaysRoutes } from './routes/giveaways.js';
import { giveawayByShortCodeRoutes } from './routes/giveaway-by-code.js';
import { initRoutes } from './routes/init.js';
import { internalRoutes } from './routes/internal.js';
import { participationRoutes } from './routes/participation.js';
import { lifecycleRoutes } from './routes/lifecycle.js';
import { catalogRoutes } from './routes/catalog.js';
import { paymentsRoutes } from './routes/payments.js';
import { siteRoutes } from './routes/site.js';
import { mediaRoutes } from './routes/media.js';
import { customTasksRoutes } from './routes/custom-tasks.js';
import { storiesRoutes } from './routes/stories.js';
import { reportsRoutes } from './routes/reports.js';
import { webhooksRoutes } from './routes/webhooks.js';
import { startGiveawayScheduler } from './scheduler/giveaway-lifecycle.js';
import { RATE_LIMITS } from './config/rate-limits.js';

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
    // ============================================================================
    // Plugins
    // ============================================================================

    // Response helpers (reply.success, reply.error, etc.)
    await fastify.register(responseHelpers);

    // Security headers
    await fastify.register(helmet, {
      contentSecurityPolicy: config.isDev ? false : undefined,
      crossOriginEmbedderPolicy: false, // For Telegram Mini App iframe
    });

    // Cookie support
    await fastify.register(cookie);

    // CORS with credentials support
    await fastify.register(cors, {
      origin: config.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Internal-Token'],
    });

    // Rate limiting (global)
    await fastify.register(rateLimit, {
      global: true,
      max: config.isDev ? 1000 : 100, // 100 requests per minute (1000 in dev)
      timeWindow: '1 minute',
      redis,
      nameSpace: 'ratelimit:global:',
      skipOnError: true, // Don't block if Redis fails
    });

    // File uploads
    await fastify.register(multipart, {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 1,
      },
    });

    // ============================================================================
    // Error Handler
    // ============================================================================

    fastify.setErrorHandler((error, request, reply) => {
      fastify.log.error(error);

      // Zod validation errors
      if (error instanceof ZodError) {
        const details = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));
        return reply.badRequest('Validation failed', details);
      }

      // Rate limit errors
      if (error.statusCode === 429) {
        return reply
          .code(429)
          .send(formatError(ErrorCode.RATE_LIMIT_EXCEEDED, 'Too many requests'));
      }

      // Default error response
      const statusCode = error.statusCode || 500;
      const code = statusCode === 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.VALIDATION_ERROR;
      const message = statusCode === 500 ? 'Internal server error' : error.message;

      return reply
        .code(statusCode)
        .send(formatError(code, message));
    });

    // ============================================================================
    // Routes (with /api/v1 prefix)
    // ============================================================================

    // Health check (no prefix)
    await fastify.register(healthRoutes);

    // API v1 routes
    await fastify.register(
      async (instance) => {
        await instance.register(dbRoutes);
        await instance.register(authRoutes);
        await instance.register(draftsRoutes);
        await instance.register(channelsRoutes);
        await instance.register(postTemplatesRoutes);
        await instance.register(initRoutes);
        await instance.register(giveawaysRoutes);
        await instance.register(giveawayByShortCodeRoutes, { prefix: '/giveaways' });
        await instance.register(participationRoutes);
        await instance.register(lifecycleRoutes);
        await instance.register(catalogRoutes);
        await instance.register(paymentsRoutes);
        await instance.register(siteRoutes);
        await instance.register(mediaRoutes);
        await instance.register(customTasksRoutes);
        await instance.register(storiesRoutes);
        await instance.register(reportsRoutes);
      },
      { prefix: '/api/v1' }
    );

    // Webhooks (no version prefix)
    await fastify.register(webhooksRoutes, { prefix: '/webhooks' });

    // Internal routes (no version prefix)
    await fastify.register(internalRoutes, { prefix: '/internal' });

    // ============================================================================
    // Start Server
    // ============================================================================

    await fastify.listen({
      port: config.port,
      host: config.host,
    });

    fastify.log.info(`🚀 API server running at http://localhost:${config.port}`);
    fastify.log.info(`📡 API v1 routes available at /api/v1/*`);
    
    // Start giveaway lifecycle scheduler
    // Checks every minute: SCHEDULED → ACTIVE, ACTIVE → FINISHED
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
    await closeRedis();
    process.exit(0);
  });
});

main();
