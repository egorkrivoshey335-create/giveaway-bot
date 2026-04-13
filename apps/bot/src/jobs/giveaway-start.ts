/**
 * RandomBeast Bot — Giveaway Start Job
 *
 * Очередь: `giveaway-start`
 * Триггер: API создает job при достижении времени начала розыгрыша
 * Действие: Публикация поста во всех привязанных каналах/группах
 */

import { Worker, Job } from 'bullmq';
import { bot } from '../bot.js';
import { config } from '../config.js';
import { createLogger } from '../lib/logger.js';
import { webAppBtn, inlineKeyboard } from '../lib/customEmoji.js';

const log = createLogger('job:giveaway-start');

export interface GiveawayStartData {
  giveawayId: string;
  title: string;
  postText: string;
  mediaUrl?: string;
  mediaType?: 'photo' | 'video';
  channels: Array<{
    id: string;
    telegramId: string;
    title: string;
  }>;
}

/**
 * Worker для публикации розыгрыша в каналах
 */
export const giveawayStartWorker = new Worker<GiveawayStartData>(
  'giveaway-start',
  async (job: Job<GiveawayStartData>) => {
    const { giveawayId, title, postText, mediaUrl, mediaType, channels } = job.data;

    log.info({ giveawayId, channelCount: channels.length }, 'Starting giveaway publication');

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const channel of channels) {
      try {
        const replyMarkup = inlineKeyboard(
          [webAppBtn('🎁 Участвовать', `${config.webappUrl}?startapp=g_${giveawayId}`, 'join', 'danger')],
        );

        // Публикуем пост
        if (mediaUrl && mediaType) {
          if (mediaType === 'photo') {
            await bot.api.sendPhoto(channel.telegramId, mediaUrl, {
              caption: postText,
              parse_mode: 'HTML',
              reply_markup: replyMarkup,
            });
          } else if (mediaType === 'video') {
            await bot.api.sendVideo(channel.telegramId, mediaUrl, {
              caption: postText,
              parse_mode: 'HTML',
              reply_markup: replyMarkup,
            });
          }
        } else {
          await bot.api.sendMessage(channel.telegramId, postText, {
            parse_mode: 'HTML',
            reply_markup: replyMarkup,
          });
        }

        results.success++;
        log.info({ giveawayId, channelId: channel.id }, 'Published successfully');
      } catch (error: any) {
        results.failed++;
        const errorMsg = `${channel.title}: ${error.message}`;
        results.errors.push(errorMsg);
        log.error({ error, channelId: channel.id }, 'Failed to publish');
      }
    }

    log.info({ giveawayId, ...results }, 'Giveaway publication completed');

    return results;
  },
  {
    connection: {
      host: new URL(config.redis.url).hostname,
      port: parseInt(new URL(config.redis.url).port || '6379', 10),
    },
    concurrency: 1, // По одному розыгрышу за раз
  }
);

giveawayStartWorker.on('completed', (job) => {
  log.info({ jobId: job.id }, 'Job completed');
});

giveawayStartWorker.on('failed', (job, err) => {
  log.error({ jobId: job?.id, error: err.message }, 'Job failed');
});
