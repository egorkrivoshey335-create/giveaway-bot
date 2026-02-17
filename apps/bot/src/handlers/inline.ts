/**
 * RandomBeast Bot — Inline Mode Handler
 *
 * Обработка inline queries для поиска розыгрышей
 */

import type { Context } from 'grammy';
import type { InlineQueryResult } from 'grammy/types';
import { InlineKeyboard } from 'grammy';
import { config } from '../config.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('inline-mode');

/**
 * Обработка inline query
 * Пользователь может искать розыгрыши прямо из чата
 */
export async function handleInlineQuery(ctx: Context) {
  try {
    const query = ctx.inlineQuery?.query || '';
    const userId = ctx.from?.id;

    log.info({ userId, query }, 'Processing inline query');

    // Поиск розыгрышей через API
    const response = await fetch(
      `${config.apiUrl}/internal/giveaways/search?q=${encodeURIComponent(query)}&limit=10`,
      {
        headers: {
          'X-Internal-Secret': config.internalApiToken,
        },
      }
    );

    if (!response.ok) {
      log.error({ status: response.status }, 'Failed to search giveaways');
      await ctx.answerInlineQuery([]);
      return;
    }

    const giveaways = await response.json() as Array<{
      id: string;
      title: string;
      description?: string;
      status: string;
      participantCount?: number;
      endsAt: string;
      shortCode?: string;
    }>;

    // Формируем результаты
    const results: InlineQueryResult[] = giveaways.map((giveaway, index) => {
      const participantsText = giveaway.participantCount 
        ? `👥 ${giveaway.participantCount} участников` 
        : '👥 Нет участников';
      
      const endsAtDate = new Date(giveaway.endsAt);
      const daysLeft = Math.ceil((endsAtDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const endsText = daysLeft > 0 
        ? `⏰ Завершится через ${daysLeft}д` 
        : '⏰ Завершён';

      const messageText = `🎁 <b>${giveaway.title}</b>\n\n${participantsText}\n${endsText}\n\nНажмите кнопку ниже, чтобы участвовать!`;

      const keyboard = new InlineKeyboard().webApp(
        '🎁 Участвовать',
        `${config.webappUrl}?startapp=g_${giveaway.shortCode || giveaway.id}`
      );

      return {
        type: 'article',
        id: `giveaway_${giveaway.id}_${index}`,
        title: giveaway.title,
        description: `${participantsText} • ${endsText}`,
        input_message_content: {
          message_text: messageText,
          parse_mode: 'HTML',
        },
        reply_markup: keyboard,
        thumb_url: 'https://via.placeholder.com/100x100.png?text=🎁', // TODO: заменить на реальное лого
      };
    });

    // Если нет результатов
    if (results.length === 0) {
      results.push({
        type: 'article',
        id: 'no_results',
        title: query ? 'Розыгрыши не найдены' : 'Поиск розыгрышей',
        description: query 
          ? `По запросу "${query}" ничего не найдено` 
          : 'Начните вводить название розыгрыша',
        input_message_content: {
          message_text: '❌ Розыгрыши не найдены.\n\nПопробуйте изменить запрос или создайте свой розыгрыш в приложении!',
        },
        reply_markup: new InlineKeyboard().webApp(
          '🎁 Создать розыгрыш',
          `${config.webappUrl}?startapp=nav_creator`
        ),
      });
    }

    await ctx.answerInlineQuery(results, {
      cache_time: 30, // Кеш на 30 секунд
    });

    log.info({ userId, resultsCount: results.length }, 'Inline query answered');
  } catch (error) {
    log.error({ error }, 'Failed to handle inline query');
    await ctx.answerInlineQuery([]);
  }
}
