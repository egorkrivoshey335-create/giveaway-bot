/**
 * RandomBeast — Redis Client
 *
 * Централизованный Redis клиент для кэширования, rate limiting, и очередей.
 *
 * @packageDocumentation
 */

import { Redis } from 'ioredis';
import { config } from '../config.js';

// ============================================================================
// Redis Client
// ============================================================================

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError(err: Error) {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      // Only reconnect when the error starts with "READONLY"
      return true;
    }
    return false;
  },
});

redis.on('error', (err: Error) => {
  console.error('[Redis] Connection error:', err);
});

redis.on('connect', () => {
  console.log('[Redis] Connected successfully');
});

// ============================================================================
// Cache Helpers
// ============================================================================

/**
 * Cache key prefixes for different data types
 */
export const CACHE_PREFIX = {
  SESSION: 'session:',
  USER: 'user:',
  CHANNEL: 'channel:',
  GIVEAWAY: 'giveaway:',
  PARTICIPATION: 'participation:',
  DRAFT: 'draft:',
  RATE_LIMIT: 'ratelimit:',
  BOT_TOKEN_CACHE: 'bot:token:',
} as const;

/**
 * Cache TTL in seconds
 */
export const CACHE_TTL = {
  SHORT: 60, // 1 minute
  MEDIUM: 300, // 5 minutes
  LONG: 1800, // 30 minutes
  HOUR: 3600, // 1 hour
  DAY: 86400, // 24 hours
  WEEK: 604800, // 7 days
} as const;

/**
 * Get value from cache
 */
export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const value = await redis.get(key);
    if (!value) return null;
    return JSON.parse(value) as T;
  } catch (err) {
    console.error('[Redis] getCache error:', err);
    return null;
  }
}

/**
 * Set value in cache with TTL
 */
export async function setCache(key: string, value: unknown, ttl: number = CACHE_TTL.MEDIUM): Promise<void> {
  try {
    await redis.setex(key, ttl, JSON.stringify(value));
  } catch (err) {
    console.error('[Redis] setCache error:', err);
  }
}

/**
 * Delete value from cache
 */
export async function delCache(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (err) {
    console.error('[Redis] delCache error:', err);
  }
}

/**
 * Delete multiple keys by pattern (use carefully!)
 */
export async function delCachePattern(pattern: string): Promise<number> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length === 0) return 0;
    return await redis.del(...keys);
  } catch (err) {
    console.error('[Redis] delCachePattern error:', err);
    return 0;
  }
}

/**
 * Check if key exists in cache
 */
export async function existsCache(key: string): Promise<boolean> {
  try {
    const result = await redis.exists(key);
    return result === 1;
  } catch (err) {
    console.error('[Redis] existsCache error:', err);
    return false;
  }
}

/**
 * Increment counter in cache
 */
export async function incrCache(key: string): Promise<number> {
  try {
    return await redis.incr(key);
  } catch (err) {
    console.error('[Redis] incrCache error:', err);
    return 0;
  }
}

/**
 * Set expiration on existing key
 */
export async function expireCache(key: string, ttl: number): Promise<void> {
  try {
    await redis.expire(key, ttl);
  } catch (err) {
    console.error('[Redis] expireCache error:', err);
  }
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

export async function closeRedis(): Promise<void> {
  try {
    await redis.quit();
    console.log('[Redis] Connection closed');
  } catch (err) {
    console.error('[Redis] Error closing connection:', err);
  }
}
