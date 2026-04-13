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
import { createLogger } from '../lib/logger.js';

const log = createLogger('winner-notifications');

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

    log.info(`Processing job ${job.id} for user ${telegramUserId}`);

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

      log.info(`✅ Notification sent to user ${telegramUserId}`);

      return { success: true };
    } catch (error: any) {
      // 🔒 Обработка ошибок доставки
      
      // 403 - пользователь заблокировал бота
      if (error.error_code === 403 && error.description?.includes('blocked')) {
        log.warn({ telegramUserId }, 'User blocked the bot - updating notificationsBlocked flag');
        
        // Обновляем флаг User.notificationsBlocked через API
        await fetch(`${config.internalApiUrl}/internal/users/${telegramUserId}/notifications-blocked`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Secret': config.internalApiToken,
          },
          body: JSON.stringify({ notificationsBlocked: true }),
        }).catch(err => log.error({ err }, 'Failed to update notifications blocked flag'));
        
        // НЕ бросаем ошибку - считаем job завершенным
        return { success: false, reason: 'user_blocked' };
      }
      
      // 400 - некорректный запрос (например, удаленный аккаунт)
      if (error.error_code === 400) {
        log.warn({ telegramUserId, errorDescription: error.description }, 'Invalid user or deleted account');
        return { success: false, reason: 'invalid_user' };
      }
      
      // Остальные ошибки - retry через BullMQ
      log.error({ error }, '❌ Failed to send notification');
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
  log.info(`Job ${job.id} completed`);
});

winnerNotificationsWorker.on('failed', (job, err) => {
  log.error({ jobId: job?.id, error: err.message }, 'Job failed');
});
