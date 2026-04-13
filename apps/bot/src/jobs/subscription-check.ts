/**
 * RandomBeast Bot — Subscription Check Scheduler
 *
 * 🔒 ЗАДАЧА 1.11: Периодическая проверка подписок (subscription:check)
 *
 * Запускается каждый час, ищет:
 * 1. Подписки, истекающие через 3 дня (и ещё не получившие предупреждение) → enqueue expire-warning
 * 2. Уже истёкшие подписки (expiresAt < now) → enqueue expire
 */

import { Worker, Queue, Job } from 'bullmq';
import { config } from '../config.js';
import { createLogger } from '../lib/logger.js';
import type { SubscriptionExpireData, SubscriptionExpireWarningData } from './subscription.js';

const log = createLogger('job:subscription-check');

const redisConnection = {
  host: new URL(config.redis.url).hostname,
  port: parseInt(new URL(config.redis.url).port || '6379', 10),
};

// Queues for the other subscription workers
const expireQueue = new Queue<SubscriptionExpireData>('subscription-expire', {
  connection: redisConnection,
});

const expireWarningQueue = new Queue<SubscriptionExpireWarningData>('subscription-expire-warning', {
  connection: redisConnection,
});

interface ExpiringEntitlement {
  id: string;
  userId: string;
  telegramUserId: string;
  code: string;
  expiresAt: string;
  autoRenew: boolean;
  warningSentAt: string | null;
  isExpired: boolean;
}

/**
 * Worker for the periodic subscription check job
 */
export const subscriptionCheckWorker = new Worker(
  'subscription-check',
  async (_job: Job) => {
    log.info('Running periodic subscription check');

    try {
      // Fetch expiring subscriptions from API (within 4 days)
      const res = await fetch(`${config.internalApiUrl}/internal/subscriptions/expiring?days=4`, {
        headers: { 'X-Internal-Token': config.internalApiToken },
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch expiring subscriptions: ${res.status}`);
      }

      const data = await res.json() as { data: ExpiringEntitlement[] };
      const entitlements: ExpiringEntitlement[] = data.data || [];

      log.info({ count: entitlements.length }, 'Found expiring/expired subscriptions');

      let expiredCount = 0;
      let warningCount = 0;
      const now = new Date();

      for (const ent of entitlements) {
        const expiresAt = new Date(ent.expiresAt);
        const msLeft = expiresAt.getTime() - now.getTime();
        const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

        if (ent.isExpired || expiresAt < now) {
          // Subscription already expired — trigger deactivation
          await expireQueue.add(
            'subscription:expire',
            {
              userId: ent.userId,
              telegramUserId: ent.telegramUserId,
              previousTier: ent.code,
              entitlementId: ent.id,
            } satisfies SubscriptionExpireData,
            {
              attempts: 3,
              backoff: { type: 'exponential', delay: 60_000 },
              removeOnComplete: 100,
              removeOnFail: 50,
            }
          );
          expiredCount++;
        } else if (daysLeft <= 3 && !ent.warningSentAt) {
          // Expiring within 3 days and no warning sent yet
          await expireWarningQueue.add(
            'subscription:expire-warning',
            {
              userId: ent.userId,
              telegramUserId: ent.telegramUserId,
              tier: ent.code,
              expiresAt: ent.expiresAt,
              daysLeft,
              autoRenew: ent.autoRenew,
            } satisfies SubscriptionExpireWarningData,
            {
              attempts: 3,
              backoff: { type: 'exponential', delay: 60_000 },
              removeOnComplete: 100,
              removeOnFail: 50,
            }
          );

          // Mark warning as sent
          await fetch(`${config.internalApiUrl}/internal/subscriptions/${ent.userId}/mark-warning-sent`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Token': config.internalApiToken,
            },
            body: JSON.stringify({ entitlementId: ent.id }),
          }).catch((err) => log.warn({ err }, 'Failed to mark warning sent'));

          warningCount++;
        }
      }

      log.info({ expiredCount, warningCount }, 'Subscription check completed');
      return { success: true, expiredCount, warningCount };
    } catch (error) {
      log.error({ error }, 'Subscription check failed');
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 1,
  }
);

subscriptionCheckWorker.on('completed', (job) => {
  log.info({ jobId: job.id }, 'Subscription check job completed');
});

subscriptionCheckWorker.on('failed', (job, err) => {
  log.error({ jobId: job?.id, error: err.message }, 'Subscription check job failed');
});

/**
 * Schedule the subscription check to run every hour
 * Call this once during server startup
 */
export async function scheduleSubscriptionCheck(): Promise<void> {
  const checkQueue = new Queue('subscription-check', {
    connection: redisConnection,
  });

  // Remove existing repeatable jobs to avoid duplicates
  const existing = await checkQueue.getRepeatableJobs();
  for (const job of existing) {
    if (job.name === 'subscription-check-hourly') {
      await checkQueue.removeRepeatableByKey(job.key);
    }
  }

  // Schedule hourly repeatable job
  await checkQueue.add(
    'subscription-check-hourly',
    {},
    {
      repeat: { every: 60 * 60 * 1000 }, // Every hour
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
    }
  );

  log.info('✅ Subscription check scheduled (every 1 hour)');
  await checkQueue.close();
}
