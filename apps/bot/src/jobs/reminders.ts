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

    console.log(`[Reminders] Processing job ${job.id} for ${participants.length} participants`);

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
            } catch (error) {
              console.error(`[Reminders] Failed to send to ${participant.telegramUserId}:`, error);
              failedCount++;
            }
          })
        );

        // Пауза между пачками (rate limiting)
        if (i + batchSize < participants.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      console.log(`[Reminders] ✅ Job ${job.id} completed: ${sentCount} sent, ${failedCount} failed`);

      return { success: true, sent: sentCount, failed: failedCount };
    } catch (error) {
      console.error(`[Reminders] ❌ Job ${job.id} failed:`, error);
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
  console.log(`[Reminders] Job ${job.id} completed`);
});

remindersWorker.on('failed', (job, err) => {
  console.error(`[Reminders] Job ${job?.id} failed:`, err.message);
});
