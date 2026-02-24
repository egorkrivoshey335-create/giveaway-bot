import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';

// Мокируем модули до импорта healthRoutes
vi.mock('@randombeast/database', () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

vi.mock('../lib/redis.js', () => ({
  redis: {
    ping: vi.fn(),
  },
}));

// Импортируем после mock-установки
const { healthRoutes } = await import('../routes/health.js');
const { prisma } = await import('@randombeast/database');
const { redis } = await import('../lib/redis.js');

describe('GET /health', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify({ logger: false });
    await app.register(healthRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 with healthy status when DB and Redis are up', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ result: 1 }]);
    vi.mocked(redis.ping).mockResolvedValue('PONG');

    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.data.status).toBe('healthy');
    expect(body.data.checks.database.status).toBe('healthy');
    expect(body.data.checks.redis.status).toBe('healthy');
  });

  it('returns 503 with degraded status when DB is down', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error('Connection refused'));
    vi.mocked(redis.ping).mockResolvedValue('PONG');

    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(503);

    const body = response.json();
    // down → overall becomes degraded
    expect(body.data.status).not.toBe('healthy');
    expect(body.data.checks.database.status).toBe('down');
  });

  it('returns 503 with degraded status when Redis is down', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ result: 1 }]);
    vi.mocked(redis.ping).mockRejectedValue(new Error('Redis ECONNREFUSED'));

    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(503);

    const body = response.json();
    expect(body.data.status).not.toBe('healthy');
    expect(body.data.checks.redis.status).toBe('down');
  });

  it('response contains required fields: service, timestamp, uptime', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ result: 1 }]);
    vi.mocked(redis.ping).mockResolvedValue('PONG');

    const response = await app.inject({ method: 'GET', url: '/health' });
    const body = response.json();

    expect(body.data.service).toBe('api');
    expect(body.data.timestamp).toBeTruthy();
    expect(new Date(body.data.timestamp).toString()).not.toBe('Invalid Date');
    expect(typeof body.data.uptime).toBe('number');
  });

  it('returns latencyMs for healthy services', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ result: 1 }]);
    vi.mocked(redis.ping).mockResolvedValue('PONG');

    const response = await app.inject({ method: 'GET', url: '/health' });
    const body = response.json();

    expect(typeof body.data.checks.database.latencyMs).toBe('number');
    expect(typeof body.data.checks.redis.latencyMs).toBe('number');
    expect(body.data.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('response has correct success wrapper', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ result: 1 }]);
    vi.mocked(redis.ping).mockResolvedValue('PONG');

    const response = await app.inject({ method: 'GET', url: '/health' });
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });
});
