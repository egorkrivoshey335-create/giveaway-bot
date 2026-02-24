/**
 * RandomBeast Bot — Creator Daily Summary Job
 *
 * Очередь: `creator-daily-summary`
 * Триггер: Ежедневно в 20:00 по времени создателя
 * Действие: Отправка сводки по активным розыгрышам
 */

import { Worker, Job } from 'bullmq';
import { bot } from '../bot.js';
import { config } from '../config.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('job:creator-daily-summary');

export interface CreatorDailySummaryData {
  creatorTelegramId: string;
  activeGiveaways: Array<{
    id: string;
    title: string;
    participantCount: number;
    endsAt: string;
  }>;
  totalParticipants: number;
  newParticipantsToday: number;
}

/**
 * Worker для ежедневной сводки создателю
 */
export const creatorDailySummaryWorker = new Worker<CreatorDailySummaryData>(
  'creator-daily-summary',
  async (job: Job<CreatorDailySummaryData>) => {
    const { creatorTelegramId, activeGiveaways, totalParticipants, newParticipantsToday } = job.data;

    log.info({ creatorTelegramId, activeGiveawaysCount: activeGiveaways.length }, 'Sending daily summary');

    try {
      if (activeGiveaways.length === 0) {
        return { success: true, skipped: true };
      }

      let message = `📊 <b>Ваша сводка за сегодня</b>\n\n`;
      message += `Активных розыгрышей: <b>${activeGiveaways.length}</b>\n`;
      message += `Всего участников: <b>${totalParticipants}</b>\n`;
      message += `Новых сегодня: <b>${newParticipantsToday}</b>\n\n`;

      if (activeGiveaways.length > 0) {
        message += `<b>Активные розыгрыши:</b>\n`;
        activeGiveaways.forEach((giveaway, index) => {
          const endsAt = new Date(giveaway.endsAt);
          const daysLeft = Math.ceil((endsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          message += `${index + 1}. ${giveaway.title}\n`;
          message += `   👥 ${giveaway.participantCount} участников, завершится через ${daysLeft}д\n`;
        });
      }

      await bot.api.sendMessage(creatorTelegramId, message, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            {
              text: '📱 Открыть приложение',
              web_app: {
                url: `${config.webappUrl}?startapp=nav_creator`,
              },
            },
          ]],
        },
      });

      log.info({ creatorTelegramId }, 'Daily summary sent successfully');

      return { success: true };
    } catch (error) {
      log.error({ error, creatorTelegramId }, 'Failed to send daily summary');
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

creatorDailySummaryWorker.on('completed', (job) => {
  log.info({ jobId: job.id }, 'Job completed');
});

creatorDailySummaryWorker.on('failed', (job, err) => {
  log.error({ jobId: job?.id, error: err.message }, 'Job failed');
});
