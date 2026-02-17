/**
 * RandomBeast Bot — Reminders Job
 *
 * 🔒 ЗАДАЧА 1.11: BullMQ worker для напоминаний о завершении розыгрыша
 *
 * Очередь: `reminders`
 * Триггер: API создает job за N часов до окончания розыгрыша
 * Действие: Бот отправляет напоминание участникам
 */

import { Worker, Job } from 'bullmq';
import { bot } from '../bot.js';
import { config } from '../config.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('reminders');

export interface ReminderData {
  giveawayId: string;
  giveawayTitle: string;
  endAt: string;
  participants: Array<{
    telegramUserId: string;
    displayName: string;
  }>;
}

/**
 * Worker для обработки напоминаний
 */
export const remindersWorker = new Worker<ReminderData>(
  'reminders',
  async (job: Job<ReminderData>) => {
    const { giveawayTitle, endAt, participants } = job.data;

    log.info(`Processing job ${job.id} for ${participants.length} participants`);

    const endDate = new Date(endAt);
    const hoursLeft = Math.round((endDate.getTime() - Date.now()) / (1000 * 60 * 60));

    try {
      // Формируем сообщение
      const message = `⏰ <b>Напоминание!</b>

Розыгрыш "<b>${giveawayTitle}</b>" завершится через <b>${hoursLeft} ч</b>.

Успейте пригласить друзей и выполнить дополнительные задания, чтобы увеличить свои шансы!`;

      // Отправляем напоминания пачками (по 20 участников)
      const batchSize = 20;
      let sentCount = 0;
      let failedCount = 0;

      for (let i = 0; i < participants.length; i += batchSize) {
        const batch = participants.slice(i, i + batchSize);

        await Promise.allSettled(
          batch.map(async (participant) => {
            try {
              await bot.api.sendMessage(participant.telegramUserId, message, {
                parse_mode: 'HTML',
              });
              sentCount++;
            } catch (error: any) {
              log.error({ error, userId: participant.telegramUserId }, 'Failed to send reminder');
              
              // 403 - пользователь заблокировал бота
              if (error.error_code === 403) {
                await fetch(`${config.apiUrl}/internal/users/${participant.telegramUserId}/notifications-blocked`, {
                  method: 'PATCH',
                  headers: {
                    'Content-Type': 'application/json',
                    'X-Internal-Secret': config.internalApiToken,
                  },
                  body: JSON.stringify({ notificationsBlocked: true }),
                }).catch(() => {});
              }
              
              failedCount++;
            }
          })
        );

        // Пауза между пачками (rate limiting)
        if (i + batchSize < participants.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      log.info(`✅ Job ${job.id} completed: ${sentCount} sent, ${failedCount} failed`);

      return { success: true, sent: sentCount, failed: failedCount };
    } catch (error) {
      log.error({ error, jobId: job.id }, 'Job failed');
      throw error;
    }
  },
  {
    connection: {
      host: new URL(config.redis.url).hostname,
      port: parseInt(new URL(config.redis.url).port || '6379', 10),
    },
    concurrency: 1, // Обрабатываем по одному напоминанию за раз (из-за rate limiting)
  }
);

remindersWorker.on('completed', (job) => {
  log.info(`Job ${job.id} completed`);
});

remindersWorker.on('failed', (job, err) => {
  log.error({ jobId: job?.id, error: err.message }, 'Job failed');
});
