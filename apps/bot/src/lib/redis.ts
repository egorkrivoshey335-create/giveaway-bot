/**
 * RandomBeast Bot — Redis Client
 *
 * Shared Redis connection for BullMQ queues
 */

import { Redis } from 'ioredis';
import { config } from '../config.js';
import { createLogger } from './logger.js';

const log = createLogger('redis');

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError(err: Error) {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      return true;
    }
    return false;
  },
});

redis.on('error', (err: Error) => {
  log.error({ err }, 'Connection error');
});

redis.on('connect', () => {
  log.info('Connected successfully');
});

export async function closeRedis(): Promise<void> {
  try {
    await redis.quit();
    log.info('Connection closed');
  } catch (err) {
    log.error({ err }, 'Error closing connection');
  }
}
