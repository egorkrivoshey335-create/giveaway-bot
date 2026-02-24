/**
 * RandomBeast Bot — Giveaway Start Reminder Job
 *
 * 🔒 ЗАДАЧА 1.11: BullMQ worker — giveaway:start:reminder
 *
 * Очередь: `giveaway:start:reminder`
 * Триггер: API планирует job за 1 час до startAt гарантии
 * Действие: Бот уведомляет участников/подписчиков о скором начале розыгрыша
 */

import { Worker, Job } from 'bullmq';
import { bot } from '../bot.js';
import { config } from '../config.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('job:start-reminder');

export interface StartReminderData {
  giveawayId: string;
  giveawayTitle: string;
  startAt: string;
  participants: Array<{
    telegramUserId: string;
  }>;
}

/**
 * Worker для напоминаний о скором начале розыгрыша
 */
export const startReminderWorker = new Worker<StartReminderData>(
  'giveaway:start:reminder',
  async (job: Job<StartReminderData>) => {
    const { giveawayId, giveawayTitle, startAt, participants } = job.data;

    log.info({ giveawayId, participantCount: participants.length }, 'Processing start reminder');

    const startDate = new Date(startAt);
    const minutesLeft = Math.round((startDate.getTime() - Date.now()) / (1000 * 60));
    const timeLabel = minutesLeft > 60
      ? `${Math.round(minutesLeft / 60)} ч`
      : `${minutesLeft} мин`;

    const message = `🚀 <b>Розыгрыш начинается скоро!</b>

«<b>${giveawayTitle}</b>» стартует через <b>${timeLabel}</b>.

Убедитесь, что вы выполнили все условия участия, чтобы ваши шансы были максимальными!`;

    const keyboard = {
      inline_keyboard: [[
        {
          text: '🎁 Открыть розыгрыш',
          web_app: { url: `${config.webappUrl}?startapp=join_${giveawayId}` },
        },
      ]],
    };

    let sentCount = 0;
    let failedCount = 0;

    // Send in batches of 20 to respect Telegram rate limits
    const batchSize = 20;
    for (let i = 0; i < participants.length; i += batchSize) {
      const batch = participants.slice(i, i + batchSize);

      await Promise.allSettled(
        batch.map(async (p) => {
          try {
            await bot.api.sendMessage(p.telegramUserId, message, {
              parse_mode: 'HTML',
              reply_markup: keyboard,
            });
            sentCount++;
          } catch (error: any) {
            if (error.error_code !== 403) {
              log.warn({ telegramUserId: p.telegramUserId, error: error.message }, 'Failed to send start reminder');
            }
            failedCount++;
          }
        })
      );

      if (i + batchSize < participants.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    log.info({ giveawayId, sentCount, failedCount }, 'Start reminder batch completed');
    return { success: true, sent: sentCount, failed: failedCount };
  },
  {
    connection: {
      host: new URL(config.redis.url).hostname,
      port: parseInt(new URL(config.redis.url).port || '6379', 10),
    },
    concurrency: 1,
  }
);

startReminderWorker.on('completed', (job) => {
  log.info({ jobId: job.id }, 'Start reminder job completed');
});

startReminderWorker.on('failed', (job, err) => {
  log.error({ jobId: job?.id, error: err.message }, 'Start reminder job failed');
});
