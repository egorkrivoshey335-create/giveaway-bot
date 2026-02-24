/**
 * RandomBeast Bot — Cleanup Jobs
 *
 * 🔒 ЗАДАЧА 1.11: BullMQ workers для периодической очистки
 *
 * Очереди:
 *   - `sandbox:cleanup`     — удаление sandbox розыгрышей старше 24ч
 *   - `prize-form:cleanup`  — очистка форм получения призов старше 90 дней
 *   - `liveness:cleanup`    — удаление liveness фото для завершённых розыгрышей > 30 дней
 *   - `badges:check`        — пересчёт бейджей пользователей
 */

import { Worker, Job } from 'bullmq';
import { config } from '../config.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('job:cleanup');

// ─── Типы данных ─────────────────────────────────────────────────────────────

export interface SandboxCleanupData {
  olderThanHours?: number;
}

export interface PrizeFormCleanupData {
  olderThanDays?: number;
}

export interface LivenessCleanupData {
  olderThanDays?: number;
}

export interface BadgesCheckData {
  userId?: string;  // Если не указан — проверяем всех пользователей
  batchSize?: number;
}

// ─── Worker: sandbox:cleanup ─────────────────────────────────────────────────

/**
 * Удаляет sandbox-розыгрыши старше 24 часов
 */
export const sandboxCleanupWorker = new Worker<SandboxCleanupData>(
  'sandbox:cleanup',
  async (job: Job<SandboxCleanupData>) => {
    const olderThanHours = job.data.olderThanHours ?? 24;

    log.info({ olderThanHours }, 'Starting sandbox cleanup');

    try {
      const response = await fetch(`${config.apiUrl}/internal/cleanup/sandbox`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': config.internalApiToken,
        },
        body: JSON.stringify({ olderThanHours }),
      });

      if (!response.ok) {
        const err = await response.text();
        log.error({ status: response.status, err }, 'Sandbox cleanup API failed');
        throw new Error(`API returned ${response.status}: ${err}`);
      }

      const result = await response.json() as { deleted: number };
      log.info({ deleted: result.deleted }, 'Sandbox cleanup completed');

      return { success: true, deleted: result.deleted };
    } catch (error) {
      log.error({ error }, 'Sandbox cleanup failed');
      throw error;
    }
  },
  {
    connection: {
      host: new URL(config.redis.url).hostname,
      port: parseInt(new URL(config.redis.url).port || '6379', 10),
    },
    concurrency: 1,
  }
);

sandboxCleanupWorker.on('completed', (job) => {
  log.info({ jobId: job.id }, 'Sandbox cleanup job completed');
});

sandboxCleanupWorker.on('failed', (job, err) => {
  log.error({ jobId: job?.id, error: err.message }, 'Sandbox cleanup job failed');
});

// ─── Worker: prize-form:cleanup ───────────────────────────────────────────────

/**
 * Очищает формы получения призов старше 90 дней
 */
export const prizeFormCleanupWorker = new Worker<PrizeFormCleanupData>(
  'prize-form:cleanup',
  async (job: Job<PrizeFormCleanupData>) => {
    const olderThanDays = job.data.olderThanDays ?? 90;

    log.info({ olderThanDays }, 'Starting prize form cleanup');

    try {
      const response = await fetch(`${config.apiUrl}/internal/cleanup/prize-forms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': config.internalApiToken,
        },
        body: JSON.stringify({ olderThanDays }),
      });

      if (!response.ok) {
        const err = await response.text();
        log.error({ status: response.status, err }, 'Prize form cleanup API failed');
        throw new Error(`API returned ${response.status}: ${err}`);
      }

      const result = await response.json() as { deleted: number };
      log.info({ deleted: result.deleted }, 'Prize form cleanup completed');

      return { success: true, deleted: result.deleted };
    } catch (error) {
      log.error({ error }, 'Prize form cleanup failed');
      throw error;
    }
  },
  {
    connection: {
      host: new URL(config.redis.url).hostname,
      port: parseInt(new URL(config.redis.url).port || '6379', 10),
    },
    concurrency: 1,
  }
);

prizeFormCleanupWorker.on('completed', (job) => {
  log.info({ jobId: job.id }, 'Prize form cleanup job completed');
});

prizeFormCleanupWorker.on('failed', (job, err) => {
  log.error({ jobId: job?.id, error: err.message }, 'Prize form cleanup job failed');
});

// ─── Worker: liveness:cleanup ─────────────────────────────────────────────────

/**
 * Удаляет liveness фото для розыгрышей завершённых > 30 дней назад
 */
export const livenessCleanupWorker = new Worker<LivenessCleanupData>(
  'liveness:cleanup',
  async (job: Job<LivenessCleanupData>) => {
    const olderThanDays = job.data.olderThanDays ?? 30;

    log.info({ olderThanDays }, 'Starting liveness photo cleanup');

    try {
      const response = await fetch(`${config.apiUrl}/internal/cleanup/liveness`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': config.internalApiToken,
        },
        body: JSON.stringify({ olderThanDays }),
      });

      if (!response.ok) {
        const err = await response.text();
        log.error({ status: response.status, err }, 'Liveness cleanup API failed');
        throw new Error(`API returned ${response.status}: ${err}`);
      }

      const result = await response.json() as { cleared: number; giveaways: number };
      log.info(
        { cleared: result.cleared, giveaways: result.giveaways },
        'Liveness photo cleanup completed'
      );

      return { success: true, cleared: result.cleared, giveaways: result.giveaways };
    } catch (error) {
      log.error({ error }, 'Liveness cleanup failed');
      throw error;
    }
  },
  {
    connection: {
      host: new URL(config.redis.url).hostname,
      port: parseInt(new URL(config.redis.url).port || '6379', 10),
    },
    concurrency: 1,
  }
);

livenessCleanupWorker.on('completed', (job) => {
  log.info({ jobId: job.id }, 'Liveness cleanup job completed');
});

livenessCleanupWorker.on('failed', (job, err) => {
  log.error({ jobId: job?.id, error: err.message }, 'Liveness cleanup job failed');
});

// ─── Worker: badges:check ─────────────────────────────────────────────────────

/**
 * Пересчёт бейджей пользователей
 * Запускается после: создания розыгрыша, завершения розыгрыша, победы, покупки подписки
 */
export const badgesCheckWorker = new Worker<BadgesCheckData>(
  'badges:check',
  async (job: Job<BadgesCheckData>) => {
    const { userId, batchSize = 100 } = job.data;

    log.info({ userId: userId || 'all', batchSize }, 'Starting badges check');

    try {
      const response = await fetch(`${config.apiUrl}/internal/badges/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': config.internalApiToken,
        },
        body: JSON.stringify({ userId, batchSize }),
      });

      if (!response.ok) {
        const err = await response.text();
        log.error({ status: response.status, err }, 'Badges check API failed');
        throw new Error(`API returned ${response.status}: ${err}`);
      }

      const result = await response.json() as { checked: number; awarded: number };
      log.info({ checked: result.checked, awarded: result.awarded }, 'Badges check completed');

      return { success: true, checked: result.checked, awarded: result.awarded };
    } catch (error) {
      log.error({ error }, 'Badges check failed');
      throw error;
    }
  },
  {
    connection: {
      host: new URL(config.redis.url).hostname,
      port: parseInt(new URL(config.redis.url).port || '6379', 10),
    },
    concurrency: 2,
  }
);

badgesCheckWorker.on('completed', (job) => {
  log.info({ jobId: job.id }, 'Badges check job completed');
});

badgesCheckWorker.on('failed', (job, err) => {
  log.error({ jobId: job?.id, error: err.message }, 'Badges check job failed');
});
