import type { FastifyPluginAsync } from 'fastify';

interface HealthResponse {
  ok: boolean;
  service: string;
  timestamp: string;
}

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Reply: HealthResponse }>('/health', async (_request, reply) => {
    return reply.send({
      ok: true,
      service: 'api',
      timestamp: new Date().toISOString(),
    });
  });
};
