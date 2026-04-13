/**
 * RandomBeast Bot — Creator Milestone Notifications Job
 *
 * 🔒 ЗАДАЧА 1.11: BullMQ worker для milestone уведомлений создателям
 *
 * Очередь: `creator:milestone`
 * Триггер: API вызывает job при достижении порогов участников (10/50/100/500/1000)
 */

import { Worker, Job } from 'bullmq';
import { bot } from '../bot.js';
import { config } from '../config.js';
import { createLogger } from '../lib/logger.js';
import { webAppBtn, inlineKeyboard } from '../lib/customEmoji.js';

const log = createLogger('job:milestones');

export interface CreatorMilestoneData {
  giveawayId: string;
  giveawayTitle: string;
  creatorTelegramId: string;
  milestone: number;
  participantCount: number;
}

// Milestone пороги для уведомлений
const MILESTONES = [10, 50, 100, 500, 1000, 5000, 10000];

/**
 * Emoji для каждого milestone
 */
function getMilestoneEmoji(milestone: number): string {
  if (milestone >= 10000) return '🌟';
  if (milestone >= 5000) return '💫';
  if (milestone >= 1000) return '🎊';
  if (milestone >= 500) return '🎉';
  if (milestone >= 100) return '🔥';
  if (milestone >= 50) return '⭐';
  return '🎯';
}

/**
 * Worker для milestone уведомлений
 */
export const creatorMilestoneWorker = new Worker<CreatorMilestoneData>(
  'creator-milestone',
  async (job: Job<CreatorMilestoneData>) => {
    const { giveawayId, giveawayTitle, creatorTelegramId, milestone, participantCount } = job.data;

    log.info({ giveawayId, milestone, participantCount }, 'Processing milestone notification');

    try {
      const emoji = getMilestoneEmoji(milestone);

      // Особое сообщение для круглых чисел
      const milestoneText = milestone >= 1000
        ? `${(milestone / 1000).toFixed(milestone % 1000 === 0 ? 0 : 1)} тыс.`
        : `${milestone}`;

      const message = `${emoji} <b>Поздравляем! ${milestoneText} участников!</b>

В вашем розыгрыше "<b>${giveawayTitle}</b>" уже <b>${participantCount}</b> участников!

${milestone >= 500 ? '🚀 Розыгрыш становится вирусным! ' : ''}Продолжайте продвижение для максимального охвата.`;

      await bot.api.sendMessage(creatorTelegramId, message, {
        parse_mode: 'HTML',
        reply_markup: inlineKeyboard(
          [webAppBtn('📊 Открыть статистику', `${config.webappUrl}/creator/giveaway/${giveawayId}`, 'stats', 'danger')],
        ),
      });

      log.info({ giveawayId, milestone }, 'Milestone notification sent');
      return { success: true };
    } catch (error: any) {
      if (error.error_code === 403) {
        log.warn({ creatorTelegramId }, 'Creator blocked bot, skipping milestone notification');
        return { success: true, skipped: 'user_blocked' };
      }
      log.error({ error, giveawayId }, 'Failed to send milestone notification');
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

creatorMilestoneWorker.on('completed', (job) => {
  log.info({ jobId: job.id }, 'Milestone job completed');
});

creatorMilestoneWorker.on('failed', (job, err) => {
  log.error({ jobId: job?.id, error: err.message }, 'Milestone job failed');
});

export { MILESTONES };
