/**
 * RandomBeast Bot — Winner Notifications Job
 *
 * 🔒 ЗАДАЧА 1.11: BullMQ worker для отправки уведомлений победителям
 *
 * Очередь: `winner-notifications`
 * Триггер: API создает job при выборе победителей
 * Действие: Бот отправляет личное сообщение победителю
 */

import { Worker, Job } from 'bullmq';
import { bot } from '../bot.js';
import { config } from '../config.js';

export interface WinnerNotificationData {
  userId: string;
  telegramUserId: string;
  giveawayId: string;
  giveawayTitle: string;
  place: number;
  totalWinners: number;
  creatorUsername?: string;
}

/**
 * Worker для обработки уведомлений победителям
 */
export const winnerNotificationsWorker = new Worker<WinnerNotificationData>(
  'winner-notifications',
  async (job: Job<WinnerNotificationData>) => {
    const { telegramUserId, giveawayTitle, place, totalWinners, creatorUsername } = job.data;

    console.log(`[WinnerNotifications] Processing job ${job.id} for user ${telegramUserId}`);

    try {
      // Формируем сообщение
      const message = `🎉 <b>Поздравляем! Вы выиграли!</b>

Вы победили в розыгрыше "<b>${giveawayTitle}</b>"!

🏆 Ваше место: <b>${place}</b> из ${totalWinners}

${creatorUsername ? `Свяжитесь с организатором @${creatorUsername} для получения приза.` : 'Свяжитесь с организатором для получения приза.'}`;

      // Отправляем уведомление
      await bot.api.sendMessage(telegramUserId, message, {
        parse_mode: 'HTML',
      });

      console.log(`[WinnerNotifications] ✅ Notification sent to user ${telegramUserId}`);

      return { success: true };
    } catch (error) {
      console.error(`[WinnerNotifications] ❌ Failed to send notification:`, error);
      throw error; // BullMQ will retry
    }
  },
  {
    connection: {
      host: new URL(config.redis.url).hostname,
      port: parseInt(new URL(config.redis.url).port || '6379', 10),
    },
    concurrency: 5, // Обрабатываем до 5 уведомлений параллельно
    limiter: {
      max: 30, // Максимум 30 сообщений
      duration: 1000, // За секунду (Telegram limit)
    },
  }
);

winnerNotificationsWorker.on('completed', (job) => {
  console.log(`[WinnerNotifications] Job ${job.id} completed`);
});

winnerNotificationsWorker.on('failed', (job, err) => {
  console.error(`[WinnerNotifications] Job ${job?.id} failed:`, err.message);
});
