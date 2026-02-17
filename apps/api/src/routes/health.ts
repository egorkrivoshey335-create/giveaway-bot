import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '@randombeast/database';
import { redis } from '../lib/redis.js';

type ServiceStatus = 'healthy' | 'degraded' | 'down';

interface HealthResponse {
  status: ServiceStatus;
  service: string;
  timestamp: string;
  uptime: number;
  checks: {
    database: { status: ServiceStatus; latencyMs?: number };
    redis: { status: ServiceStatus; latencyMs?: number };
  };
}

const startTime = Date.now();

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /health
   * Расширенный healthcheck с проверкой зависимостей
   */
  fastify.get('/health', async (_request, reply) => {
    const checks: HealthResponse['checks'] = {
      database: { status: 'down' },
      redis: { status: 'down' },
    };

    // Проверяем БД
    try {
      const dbStart = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      checks.database = {
        status: 'healthy',
        latencyMs: Date.now() - dbStart,
      };
    } catch {
      checks.database = { status: 'down' };
    }

    // Проверяем Redis
    try {
      const redisStart = Date.now();
      await redis.ping();
      checks.redis = {
        status: 'healthy',
        latencyMs: Date.now() - redisStart,
      };
    } catch {
      checks.redis = { status: 'down' };
    }

    // Общий статус
    const allHealthy = checks.database.status === 'healthy' && checks.redis.status === 'healthy';
    const anyDown = checks.database.status === 'down' || checks.redis.status === 'down';
    const overallStatus: ServiceStatus = allHealthy ? 'healthy' : anyDown ? 'degraded' : 'degraded';

    const response: HealthResponse = {
      status: overallStatus,
      service: 'api',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      checks,
    };

    const statusCode = overallStatus === 'healthy' ? 200 : 503;
    return reply.code(statusCode).send({ success: true, data: response });
  });
};
