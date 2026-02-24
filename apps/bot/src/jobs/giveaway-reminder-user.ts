/**
 * RandomBeast Bot — Giveaway User Reminder Job
 *
 * 🔒 ЗАДАЧА 1.11: BullMQ workers для персональных напоминаний о начале розыгрыша
 *
 * Очереди:
 *   - `giveaway:reminder:user`  — отправка напоминания конкретному пользователю
 *   - `giveaway:reminder:check` — периодическая (каждые 15 мин) проверка pending reminders
 *
 * Когда юзер нажимает "🔔 Напомнить о начале" в Mini App:
 *   - Создаётся GiveawayReminder с remindAt = startAt - 1ч
 *   - Этот scheduler проверяет такие записи и отправляет уведомления через бота
 */

import { Worker, Queue, Job } from 'bullmq';
import { bot } from '../bot.js';
import { config } from '../config.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('job:giveaway-reminder-user');

const redisConnection = {
  host: new URL(config.redis.url).hostname,
  port: parseInt(new URL(config.redis.url).port || '6379', 10),
};

// Queue for sending individual reminders
const reminderUserQueue = new Queue<GiveawayReminderUserData>('giveaway:reminder:user', {
  connection: redisConnection,
});

export interface GiveawayReminderUserData {
  reminderId: string;
  giveawayId: string;
  giveawayTitle: string;
  giveawayStartAt: string | null;
  telegramUserId: string;
}

// ─── Worker: giveaway:reminder:user ──────────────────────────────────────────

/**
 * Sends a personal reminder to a user about a giveaway starting soon
 */
export const giveawayReminderUserWorker = new Worker<GiveawayReminderUserData>(
  'giveaway:reminder:user',
  async (job: Job<GiveawayReminderUserData>) => {
    const { reminderId, giveawayId, giveawayTitle, giveawayStartAt, telegramUserId } = job.data;

    log.info({ reminderId, giveawayId, telegramUserId }, 'Sending user giveaway reminder');

    try {
      const startDate = giveawayStartAt ? new Date(giveawayStartAt) : null;
      const minutesLeft = startDate
        ? Math.round((startDate.getTime() - Date.now()) / (1000 * 60))
        : null;

      let timeLabel = '';
      if (minutesLeft !== null) {
        if (minutesLeft > 60) {
          timeLabel = ` — через ${Math.round(minutesLeft / 60)} ч`;
        } else if (minutesLeft > 0) {
          timeLabel = ` — через ${minutesLeft} мин`;
        } else {
          timeLabel = ' — уже начался!';
        }
      }

      const message = `🔔 <b>Напоминание о розыгрыше</b>

Розыгрыш «<b>${giveawayTitle}</b>» начинается${timeLabel}!

Не пропустите — успейте принять участие!`;

      await bot.api.sendMessage(telegramUserId, message, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            {
              text: '🎁 Участвовать',
              web_app: { url: `${config.webappUrl}?startapp=join_${giveawayId}` },
            },
          ]],
        },
      });

      // Mark reminder as sent in the API
      await fetch(
        `${config.apiUrl}/internal/giveaway-reminders/${reminderId}/mark-sent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Token': config.internalApiToken,
          },
        }
      ).catch((err) =>
        log.warn({ err, reminderId }, 'Failed to mark reminder as sent — will not retry notification')
      );

      log.info({ reminderId, telegramUserId }, 'User reminder sent successfully');
      return { success: true };
    } catch (error: any) {
      if (error.error_code === 403) {
        log.warn({ telegramUserId }, 'User blocked bot, skipping reminder');
        // Still mark as sent so we don't retry
        await fetch(
          `${config.apiUrl}/internal/giveaway-reminders/${reminderId}/mark-sent`,
          {
            method: 'POST',
            headers: { 'X-Internal-Token': config.internalApiToken },
          }
        ).catch(() => {});
        return { success: true, skipped: 'user_blocked' };
      }
      log.error({ error, reminderId }, 'Failed to send user reminder');
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

giveawayReminderUserWorker.on('completed', (job) => {
  log.info({ jobId: job.id }, 'User reminder job completed');
});

giveawayReminderUserWorker.on('failed', (job, err) => {
  log.error({ jobId: job?.id, error: err.message }, 'User reminder job failed');
});

// ─── Scheduler: giveaway:reminder:check ──────────────────────────────────────

/**
 * Periodic worker that fetches pending reminders from the API and enqueues
 * individual giveaway:reminder:user jobs for each one.
 * Runs every 15 minutes.
 */
export const giveawayReminderCheckWorker = new Worker(
  'giveaway:reminder:check',
  async (_job: Job) => {
    log.info('Checking pending giveaway reminders');

    try {
      const res = await fetch(
        `${config.apiUrl}/internal/giveaway-reminders/pending?limit=200`,
        {
          headers: { 'X-Internal-Token': config.internalApiToken },
        }
      );

      if (!res.ok) {
        throw new Error(`Failed to fetch pending reminders: ${res.status}`);
      }

      const data = await res.json() as {
        data: {
          id: string;
          giveawayId: string;
          giveawayTitle: string;
          giveawayStartAt: string | null;
          giveawayStatus: string;
          telegramUserId: string;
        }[];
      };

      const reminders = data.data || [];
      log.info({ count: reminders.length }, 'Found pending reminders');

      let enqueued = 0;
      for (const reminder of reminders) {
        // Skip reminders for giveaways that haven't started yet (status !== SCHEDULED)
        // Still send if the giveaway is ACTIVE or near start
        if (reminder.giveawayStatus === 'CANCELLED' || reminder.giveawayStatus === 'FINISHED') {
          // Mark as sent without sending
          await fetch(
            `${config.apiUrl}/internal/giveaway-reminders/${reminder.id}/mark-sent`,
            {
              method: 'POST',
              headers: { 'X-Internal-Token': config.internalApiToken },
            }
          ).catch(() => {});
          continue;
        }

        await reminderUserQueue.add(
          'giveaway:reminder:user',
          {
            reminderId: reminder.id,
            giveawayId: reminder.giveawayId,
            giveawayTitle: reminder.giveawayTitle,
            giveawayStartAt: reminder.giveawayStartAt,
            telegramUserId: reminder.telegramUserId,
          } satisfies GiveawayReminderUserData,
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 30_000 },
            removeOnComplete: 200,
            removeOnFail: 50,
          }
        );
        enqueued++;
      }

      log.info({ enqueued }, 'Reminder check completed');
      return { success: true, enqueued };
    } catch (error) {
      log.error({ error }, 'Reminder check failed');
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 1,
  }
);

giveawayReminderCheckWorker.on('completed', (job) => {
  log.info({ jobId: job.id }, 'Reminder check job completed');
});

giveawayReminderCheckWorker.on('failed', (job, err) => {
  log.error({ jobId: job?.id, error: err.message }, 'Reminder check job failed');
});

/**
 * Schedule the reminder check to run every 15 minutes.
 * Call once during server startup.
 */
export async function scheduleGiveawayReminderCheck(): Promise<void> {
  const checkQueue = new Queue('giveaway:reminder:check', {
    connection: redisConnection,
  });

  // Remove existing repeatable jobs to avoid duplicates
  const existing = await checkQueue.getRepeatableJobs();
  for (const job of existing) {
    if (job.name === 'giveaway:reminder:check:periodic') {
      await checkQueue.removeRepeatableByKey(job.key);
    }
  }

  // Schedule every 15 minutes
  await checkQueue.add(
    'giveaway:reminder:check:periodic',
    {},
    {
      repeat: { every: 15 * 60 * 1000 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
    }
  );

  log.info('✅ Giveaway reminder check scheduled (every 15 minutes)');
  await checkQueue.close();
}
