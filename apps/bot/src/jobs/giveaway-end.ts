/**
 * RandomBeast Bot — Giveaway End Job
 *
 * Очередь: `giveaway-end`
 * Триггер: API создает job при достижении времени окончания розыгрыша
 * Действие: Уведомление создателя о необходимости выбрать победителей
 */

import { Worker, Job } from 'bullmq';
import { bot } from '../bot.js';
import { config } from '../config.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('job:giveaway-end');

export interface GiveawayEndData {
  giveawayId: string;
  title: string;
  creatorTelegramId: string;
  participantCount: number;
  winnerCount: number;
}

/**
 * Worker для уведомления о завершении розыгрыша
 */
export const giveawayEndWorker = new Worker<GiveawayEndData>(
  'giveaway-end',
  async (job: Job<GiveawayEndData>) => {
    const { giveawayId, title, creatorTelegramId, participantCount, winnerCount } = job.data;

    log.info({ giveawayId }, 'Processing giveaway end notification');

    try {
      const message = `🎉 <b>Розыгрыш завершён!</b>

"<b>${title}</b>"

👥 Участников: <b>${participantCount}</b>
🏆 Победителей выбрать: <b>${winnerCount}</b>

Выберите победителей в приложении:`;

      await bot.api.sendMessage(creatorTelegramId, message, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            {
              text: '🎯 Выбрать победителей',
              web_app: {
                url: `${config.webappUrl}?startapp=nav_creator_giveaway_${giveawayId}`,
              },
            },
          ]],
        },
      });

      log.info({ giveawayId }, 'Notification sent successfully');

      return { success: true };
    } catch (error: any) {
      // 🔒 Обработка ошибок доставки
      if (error.error_code === 403 && error.description?.includes('blocked')) {
        log.warn({ creatorTelegramId }, 'Creator blocked the bot');
        return { success: false, reason: 'user_blocked' };
      }
      
      log.error({ error, giveawayId }, 'Failed to send notification');
      throw error;
    }
  },
  {
    connection: {
      host: new URL(config.redis.url).hostname,
      port: parseInt(new URL(config.redis.url).port || '6379', 10),
    },
    concurrency: 3,
  }
);

giveawayEndWorker.on('completed', (job) => {
  log.info({ jobId: job.id }, 'Job completed');
});

giveawayEndWorker.on('failed', (job, err) => {
  log.error({ jobId: job?.id, error: err.message }, 'Job failed');
});
