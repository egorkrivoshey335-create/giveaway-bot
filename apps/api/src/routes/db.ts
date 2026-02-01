import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '@randombeast/database';

interface DbPingResponse {
  ok: boolean;
  db: string;
  timestamp: string;
}

interface DbErrorResponse {
  ok: boolean;
  db: string;
  error: string;
}

export const dbRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Reply: DbPingResponse | DbErrorResponse }>(
    '/db/ping',
    async (_request, reply) => {
      try {
        // Execute simple query to check database connection
        await prisma.$queryRaw`SELECT 1`;

        return reply.send({
          ok: true,
          db: 'up',
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        fastify.log.error(error, 'Database ping failed');

        return reply.status(503).send({
          ok: false,
          db: 'down',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );
};
