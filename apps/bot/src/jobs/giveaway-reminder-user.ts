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
import { webAppBtn, inlineKeyboard } from '../lib/customEmoji.js';

const log = createLogger('job:giveaway-reminder-user');

const redisConnection = {
  host: new URL(config.redis.url).hostname,
  port: parseInt(new URL(config.redis.url).port || '6379', 10),
};

// Queue for sending individual reminders
const reminderUserQueue = new Queue<GiveawayReminderUserData>('giveaway-reminder-user', {
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
  'giveaway-reminder-user',
  async (job: Job<GiveawayReminderUserData>) => {
    const { reminderId, giveawayId, giveawayTitle, giveawayStartAt, telegramUserId } = job.data;

    log.info({ reminderId, giveawayId, telegramUserId }, 'Sending user giveaway reminder');

    const markReminderSent = async (reason: string) => {
      try {
        const res = await fetch(
          `${config.internalApiUrl}/internal/giveaway-reminders/${reminderId}/mark-sent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Token': config.internalApiToken,
            },
          }
        );
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          log.error(
            { reminderId, status: res.status, body, reason },
            'mark-sent returned non-2xx — reminder will be re-picked on next tick (bug)'
          );
        } else {
          log.info({ reminderId, reason }, 'Reminder marked as sent');
        }
      } catch (err) {
        log.error({ err, reminderId, reason }, 'Failed to call mark-sent endpoint (network error)');
      }
    };

    try {
      const startDate = giveawayStartAt ? new Date(giveawayStartAt) : null;
      const minutesSinceStart = startDate
        ? Math.round((Date.now() - startDate.getTime()) / (1000 * 60))
        : null;

      // Если розыгрыш стартовал более 30 минут назад — поздно напоминать, просто закрываем.
      // Это защита от ситуаций, когда воркер по какой-то причине отстал от расписания.
      if (minutesSinceStart !== null && minutesSinceStart > 30) {
        log.info(
          { reminderId, telegramUserId, minutesSinceStart },
          'Giveaway already started long ago — skipping reminder, marking as sent'
        );
        await markReminderSent('too_late');
        return { success: true, skipped: 'too_late' };
      }

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
        reply_markup: inlineKeyboard(
          [webAppBtn('🎁 Участвовать', `${config.webappUrl}?startapp=join_${giveawayId}`, 'join', 'danger')],
        ),
      });

      // КРИТИЧНО: помечаем как отправленное СРАЗУ после успешной отправки в Telegram.
      // Если этот шаг провалится — на следующем тике (15 мин) пользователю придёт дубликат.
      await markReminderSent('sent');

      log.info({ reminderId, telegramUserId }, 'User reminder sent successfully');
      return { success: true };
    } catch (error: any) {
      // Безнадёжные ошибки Telegram — юзеру невозможно доставить сообщение.
      // Помечаем как отправленное, чтобы воркер не пытался ретраить бесконечно.
      //   403 — bot was blocked / user is deactivated
      //   400 — chat not found (юзер не нажал /start у бота)
      //   400 — user is deactivated / USER_DEACTIVATED
      const errorCode = error?.error_code as number | undefined;
      const description = String(error?.description || error?.message || '');
      const isUnrecoverable =
        errorCode === 403 ||
        (errorCode === 400 && /chat not found|user is deactivated|user_deactivated|bot can'?t initiate conversation/i.test(description));

      if (isUnrecoverable) {
        log.warn(
          { telegramUserId, errorCode, description },
          'Unrecoverable Telegram error — marking reminder as sent without retry'
        );
        await markReminderSent(`tg_${errorCode}`);
        return { success: true, skipped: `tg_${errorCode}` };
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
  'giveaway-reminder-check',
  async (_job: Job) => {
    log.info('Checking pending giveaway reminders');

    try {
      const res = await fetch(
        `${config.internalApiUrl}/internal/giveaway-reminders/pending?limit=200`,
        {
          headers: { 'X-Internal-Token': config.internalApiToken },
        }
      );

      if (!res.ok) {
        throw new Error(`Failed to fetch pending reminders: ${res.status}`);
      }

      const data = await res.json() as {
        ok: boolean;
        data: {
          reminders: {
            id: string;
            giveawayId: string;
            giveawayTitle: string;
            giveawayStartAt: string | null;
            giveawayStatus: string;
            telegramUserId: string;
          }[];
        };
      };

      const reminders = data.data?.reminders || [];
      log.info({ count: reminders.length }, 'Found pending reminders');

      let enqueued = 0;
      for (const reminder of reminders) {
        // Skip reminders for giveaways that haven't started yet (status !== SCHEDULED)
        // Still send if the giveaway is ACTIVE or near start
        if (reminder.giveawayStatus === 'CANCELLED' || reminder.giveawayStatus === 'FINISHED') {
          // Mark as sent without sending
          await fetch(
            `${config.internalApiUrl}/internal/giveaway-reminders/${reminder.id}/mark-sent`,
            {
              method: 'POST',
              headers: { 'X-Internal-Token': config.internalApiToken },
            }
          ).catch(() => {});
          continue;
        }

        await reminderUserQueue.add(
          'giveaway-reminder-user',
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
  const checkQueue = new Queue('giveaway-reminder-check', {
    connection: redisConnection,
  });

  // Remove existing repeatable jobs to avoid duplicates
  const existing = await checkQueue.getRepeatableJobs();
  for (const job of existing) {
    if (job.name === 'giveaway-reminder-check-periodic') {
      await checkQueue.removeRepeatableByKey(job.key);
    }
  }

  // Schedule every 15 minutes
  await checkQueue.add(
    'giveaway-reminder-check-periodic',
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
