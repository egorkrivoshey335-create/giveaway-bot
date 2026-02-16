/**
 * RandomBeast Bot — Redis Client
 *
 * Shared Redis connection for BullMQ queues
 */

import { Redis } from 'ioredis';
import { config } from '../config.js';

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
  console.error('[Bot Redis] Connection error:', err);
});

redis.on('connect', () => {
  console.log('[Bot Redis] Connected successfully');
});

export async function closeRedis(): Promise<void> {
  try {
    await redis.quit();
    console.log('[Bot Redis] Connection closed');
  } catch (err) {
    console.error('[Bot Redis] Error closing connection:', err);
  }
}
