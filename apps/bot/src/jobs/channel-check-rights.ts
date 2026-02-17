/**
 * RandomBeast Bot — Channel Rights Check Job
 *
 * Очередь: `channel:check-rights`
 * Триггер: Periodic (раз в 6 часов) или при событии
 * Действие: Проверка прав бота в канале, обновление Channel.botIsAdmin
 */

import { Worker, Job } from 'bullmq';
import { bot } from '../bot.js';
import { config } from '../config.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('job:channel-check-rights');

export interface ChannelCheckRightsData {
  channelId: string;
  telegramId: string;
  title: string;
}

/**
 * Worker для проверки прав бота в канале
 */
export const channelCheckRightsWorker = new Worker<ChannelCheckRightsData>(
  'channel:check-rights',
  async (job: Job<ChannelCheckRightsData>) => {
    const { channelId, telegramId, title } = job.data;

    log.info({ channelId, title }, 'Checking bot rights');

    try {
      const botInfo = await bot.api.getMe();
      const chatMember = await bot.api.getChatMember(telegramId, botInfo.id);

      const isAdmin = chatMember.status === 'administrator' || chatMember.status === 'creator';
      const canPostMessages = chatMember.status === 'administrator' && 
        'can_post_messages' in chatMember ? chatMember.can_post_messages : false;

      // Обновляем через API
      const response = await fetch(`${config.apiUrl}/internal/channels/${channelId}/rights`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': config.internalApiToken,
        },
        body: JSON.stringify({
          botIsAdmin: isAdmin,
          canPostMessages,
        }),
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      log.info({ channelId, isAdmin, canPostMessages }, 'Rights checked and updated');

      return { success: true, isAdmin, canPostMessages };
    } catch (error: any) {
      log.error({ error, channelId }, 'Failed to check rights');
      
      // Если канал не найден (404) или бот удален (403) - помечаем как неактивный
      if (error.error_code === 400 || error.error_code === 403) {
        await fetch(`${config.apiUrl}/internal/channels/${channelId}/rights`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Secret': config.internalApiToken,
          },
          body: JSON.stringify({
            botIsAdmin: false,
            canPostMessages: false,
          }),
        });
      }

      throw error;
    }
  },
  {
    connection: {
      host: new URL(config.redis.url).hostname,
      port: parseInt(new URL(config.redis.url).port || '6379', 10),
    },
    concurrency: 5,
  }
);

channelCheckRightsWorker.on('completed', (job) => {
  log.info({ jobId: job.id }, 'Job completed');
});

channelCheckRightsWorker.on('failed', (job, err) => {
  log.error({ jobId: job?.id, error: err.message }, 'Job failed');
});
