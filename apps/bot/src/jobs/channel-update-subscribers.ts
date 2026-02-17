/**
 * RandomBeast Bot — Channel Subscriber Count Update Job
 *
 * Очередь: `channel:update-subscribers`
 * Триггер: Periodic (раз в 24 часа)
 * Действие: Обновление subscriberCount для всех каналов
 */

import { Worker, Job } from 'bullmq';
import { bot } from '../bot.js';
import { config } from '../config.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('job:channel-update-subscribers');

export interface ChannelUpdateSubscribersData {
  channelId: string;
  telegramId: string;
  title: string;
}

/**
 * Worker для обновления количества подписчиков
 */
export const channelUpdateSubscribersWorker = new Worker<ChannelUpdateSubscribersData>(
  'channel:update-subscribers',
  async (job: Job<ChannelUpdateSubscribersData>) => {
    const { channelId, telegramId, title } = job.data;

    log.info({ channelId, title }, 'Updating subscriber count');

    try {
      const memberCount = await bot.api.getChatMemberCount(telegramId);

      // Обновляем через API
      const response = await fetch(`${config.apiUrl}/internal/channels/${channelId}/subscribers`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': config.internalApiToken,
        },
        body: JSON.stringify({
          subscriberCount: memberCount,
        }),
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      log.info({ channelId, memberCount }, 'Subscriber count updated');

      return { success: true, memberCount };
    } catch (error) {
      log.error({ error, channelId }, 'Failed to update subscriber count');
      throw error;
    }
  },
  {
    connection: {
      host: new URL(config.redis.url).hostname,
      port: parseInt(new URL(config.redis.url).port || '6379', 10),
    },
    concurrency: 10,
  }
);

channelUpdateSubscribersWorker.on('completed', (job) => {
  log.info({ jobId: job.id }, 'Job completed');
});

channelUpdateSubscribersWorker.on('failed', (job, err) => {
  log.error({ jobId: job?.id, error: err.message }, 'Job failed');
});
