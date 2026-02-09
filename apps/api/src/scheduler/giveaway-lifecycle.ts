import { prisma, GiveawayStatus, ParticipationStatus, GiveawayMessageKind, PublishResultsMode } from '@randombeast/database';
import crypto from 'crypto';
import { config } from '../config.js';

// Имя бота для deep links
const BOT_USERNAME = process.env.BOT_USERNAME || 'BeastRandomBot';

/**
 * Криптографически безопасное случайное число в диапазоне [min, max]
 */
function cryptoRandomInt(min: number, max: number): number {
  const range = max - min + 1;
  
  // Определяем количество байт нужных для покрытия диапазона
  const bytesNeeded = Math.ceil(Math.log2(range) / 8) || 1;
  const maxValidValue = Math.floor((256 ** bytesNeeded) / range) * range - 1;
  
  let randomValue: number;
  do {
    const randomBytes = crypto.randomBytes(bytesNeeded);
    randomValue = parseInt(randomBytes.toString('hex'), 16);
  } while (randomValue > maxValidValue);
  
  return min + (randomValue % range);
}

/**
 * Обработка жизненного цикла розыгрышей
 * Вызывается периодически (каждую минуту)
 */
export async function processGiveawayLifecycle(): Promise<void> {
  const now = new Date();
  
  try {
    // 1. SCHEDULED → ACTIVE (когда наступил startAt)
    const activatedCount = await prisma.giveaway.updateMany({
      where: {
        status: GiveawayStatus.SCHEDULED,
        startAt: { lte: now },
      },
      data: {
        status: GiveawayStatus.ACTIVE,
      },
    });
    
    if (activatedCount.count > 0) {
      console.log(`[Scheduler] Активировано розыгрышей: ${activatedCount.count}`);
    }
    
    // 2. ACTIVE → FINISHED (когда наступил endAt)
    const toFinish = await prisma.giveaway.findMany({
      where: {
        status: GiveawayStatus.ACTIVE,
        endAt: { lte: now },
      },
      select: { id: true, title: true },
    });
    
    for (const giveaway of toFinish) {
      console.log(`[Scheduler] Завершение розыгрыша: ${giveaway.title} (${giveaway.id})`);
      await finishGiveaway(giveaway.id);
    }
    
  } catch (error) {
    console.error('[Scheduler] Ошибка обработки жизненного цикла:', error);
  }
}

/**
 * Завершение розыгрыша и выбор победителей
 */
export async function finishGiveaway(giveawayId: string): Promise<{
  ok: boolean;
  winnersCount?: number;
  error?: string;
}> {
  try {
    // Получаем розыгрыш с участниками
    const giveaway = await prisma.giveaway.findUnique({
      where: { id: giveawayId },
      include: {
        participations: {
          where: { status: ParticipationStatus.JOINED },
          include: { 
            user: {
              select: { id: true, telegramUserId: true, firstName: true }
            } 
          },
        },
      },
    });
    
    if (!giveaway) {
      return { ok: false, error: 'Розыгрыш не найден' };
    }
    
    if (giveaway.status !== GiveawayStatus.ACTIVE) {
      return { ok: false, error: `Розыгрыш не активен (статус: ${giveaway.status})` };
    }
    
    const participants = giveaway.participations;
    
    // Если нет участников — отменяем
    if (participants.length === 0) {
      await prisma.giveaway.update({
        where: { id: giveawayId },
        data: { status: GiveawayStatus.CANCELLED },
      });
      console.log(`[Scheduler] Розыгрыш ${giveawayId} отменён — нет участников`);
      return { ok: true, winnersCount: 0 };
    }
    
    // Создаём пул "билетов" для взвешенного выбора
    // Каждый билет = один шанс на победу
    let tickets: Array<{ participationId: string; userId: string }> = [];
    
    for (const p of participants) {
      const totalTickets = p.ticketsBase + p.ticketsExtra;
      for (let i = 0; i < totalTickets; i++) {
        tickets.push({ participationId: p.id, userId: p.userId });
      }
    }
    
    // Определяем количество победителей (не больше чем участников)
    const winnersCount = Math.min(giveaway.winnersCount, participants.length);
    const selectedUserIds = new Set<string>();
    const winners: Array<{ userId: string; place: number; ticketsUsed: number }> = [];
    
    let place = 1;
    
    // Выбираем победителей
    while (winners.length < winnersCount && tickets.length > 0) {
      // Криптографически безопасный random
      const randomIndex = cryptoRandomInt(0, tickets.length - 1);
      const ticket = tickets[randomIndex];
      
      // Если пользователь ещё не выбран победителем
      if (!selectedUserIds.has(ticket.userId)) {
        selectedUserIds.add(ticket.userId);
        
        const participation = participants.find(p => p.userId === ticket.userId)!;
        winners.push({
          userId: ticket.userId,
          place: place++,
          ticketsUsed: participation.ticketsBase + participation.ticketsExtra,
        });
      }
      
      // Удаляем все билеты этого пользователя из пула
      tickets = tickets.filter(t => t.userId !== ticket.userId);
    }
    
    // Сохраняем в транзакции
    await prisma.$transaction(async (tx) => {
      // Создаём записи победителей
      for (const winner of winners) {
        await tx.winner.create({
          data: {
            giveawayId,
            userId: winner.userId,
            place: winner.place,
            ticketsUsed: winner.ticketsUsed,
          },
        });
      }
      
      // Обновляем статус розыгрыша
      await tx.giveaway.update({
        where: { id: giveawayId },
        data: { status: GiveawayStatus.FINISHED },
      });
    });
    
    console.log(`[Scheduler] Розыгрыш ${giveawayId} завершён. Победителей: ${winners.length}`);
    
    // Публикуем результаты в каналы (асинхронно, не ждём)
    publishResults(giveawayId).catch((err) => {
      console.error('[Scheduler] Ошибка публикации результатов:', err);
    });
    
    // Отправляем уведомления победителям (асинхронно, не ждём)
    notifyWinners(giveawayId, giveaway.title, winners.length).catch((err) => {
      console.error('[Scheduler] Ошибка отправки уведомлений:', err);
    });
    
    return { ok: true, winnersCount: winners.length };
    
  } catch (error) {
    console.error(`[Scheduler] Ошибка завершения розыгрыша ${giveawayId}:`, error);
    return { ok: false, error: 'Внутренняя ошибка' };
  }
}

/**
 * Отправка уведомлений победителям через бота
 */
async function notifyWinners(
  giveawayId: string,
  giveawayTitle: string,
  totalWinners: number
): Promise<void> {
  // Получаем победителей с telegram ID
  const winners = await prisma.winner.findMany({
    where: { giveawayId },
    include: {
      user: {
        select: { telegramUserId: true, firstName: true },
      },
    },
    orderBy: { place: 'asc' },
  });
  
  for (const winner of winners) {
    try {
      // Вызываем internal endpoint для отправки сообщения
      const response = await fetch(`${config.apiUrl}/internal/notify-winner`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': config.internalApiToken,
        },
        body: JSON.stringify({
          telegramUserId: winner.user.telegramUserId.toString(),
          giveawayTitle,
          place: winner.place,
          totalWinners,
        }),
      });
      
      if (response.ok) {
        // Отмечаем что уведомление отправлено
        await prisma.winner.update({
          where: { id: winner.id },
          data: { notifiedAt: new Date() },
        });
      }
    } catch (error) {
      console.error(`[Notify] Ошибка уведомления победителя ${winner.userId}:`, error);
    }
  }
}

// =============================================================================
// Публикация результатов в каналы
// =============================================================================

/**
 * Экранирование HTML для Telegram
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Получить медаль по месту
 */
function getMedal(place: number): string {
  switch (place) {
    case 1: return '🥇';
    case 2: return '🥈';
    case 3: return '🥉';
    default: return '🏅';
  }
}

/**
 * Тип для розыгрыша с связями
 */
interface GiveawayWithRelations {
  id: string;
  title: string;
  publishResultsMode: PublishResultsMode;
  postTemplate: { text: string; mediaType: string } | null;
  messages: Array<{
    id: string;
    channelId: string;
    kind: GiveawayMessageKind;
    telegramMessageId: number;
  }>;
  winners: Array<{
    place: number;
    user: {
      telegramUserId: bigint;
      firstName: string | null;
    };
  }>;
  resultsChannels: Array<{
    channelId: string;
    channel: {
      id: string;
      telegramChatId: bigint;
      title: string;
    };
  }>;
  _count: {
    participations: number;
  };
}

/**
 * Форматирование списка победителей
 */
function formatWinnersText(winners: GiveawayWithRelations['winners']): string {
  if (winners.length === 0) {
    return '❌ Розыгрыш завершён. Победителей нет (не было участников).';
  }
  
  const lines = ['🏆 <b>Победители:</b>', ''];
  
  for (const winner of winners) {
    const medal = getMedal(winner.place);
    const name = winner.user.firstName || `User ${winner.user.telegramUserId.toString().slice(-4)}`;
    const mention = `<a href="tg://user?id=${winner.user.telegramUserId}">${escapeHtml(name)}</a>`;
    lines.push(`${medal} ${winner.place}. ${mention}`);
  }
  
  return lines.join('\n');
}

/**
 * Форматирование полного поста с результатами
 */
function formatResultsPost(giveaway: GiveawayWithRelations): string {
  const winnersText = formatWinnersText(giveaway.winners);
  
  return `🎉 <b>Розыгрыш "${escapeHtml(giveaway.title)}" завершён!</b>

${winnersText}

Всего участников: ${giveaway._count.participations}

Поздравляем победителей! 🎊`;
}

/**
 * Публикация результатов розыгрыша
 */
async function publishResults(giveawayId: string): Promise<void> {
  // Получаем розыгрыш со всеми связями
  const giveaway = await prisma.giveaway.findUnique({
    where: { id: giveawayId },
    include: {
      postTemplate: { select: { text: true, mediaType: true } },
      messages: { where: { kind: GiveawayMessageKind.START } },
      winners: {
        orderBy: { place: 'asc' },
        include: {
          user: { select: { telegramUserId: true, firstName: true } },
        },
      },
      resultsChannels: {
        include: {
          channel: { select: { id: true, telegramChatId: true, title: true } },
        },
      },
      _count: { select: { participations: true } },
    },
  });
  
  if (!giveaway) {
    console.error(`[PublishResults] Розыгрыш ${giveawayId} не найден`);
    return;
  }
  
  const publishMode = giveaway.publishResultsMode;
  
  console.log(`[PublishResults] Режим: ${publishMode}, Победителей: ${giveaway.winners.length}`);
  
  if (publishMode === PublishResultsMode.RANDOMIZER) {
    await publishRandomizerTeaser(giveaway as GiveawayWithRelations);
  } else if (publishMode === PublishResultsMode.EDIT_START_POST) {
    await publishResultsSamePost(giveaway as GiveawayWithRelations);
  } else {
    await publishResultsSeparatePosts(giveaway as GiveawayWithRelations);
  }
}

/**
 * Режим RANDOMIZER — отправить тизер-сообщение (без списка победителей)
 * Создатель потом объявит победителей на сайте через рандомайзер
 */
async function publishRandomizerTeaser(giveaway: GiveawayWithRelations): Promise<void> {
  const teaserText = `🎉 <b>Розыгрыш «${escapeHtml(giveaway.title)}» завершён!</b>

🎲 Победители будут объявлены создателем в прямом эфире с помощью рандомайзера.

Следите за обновлениями — скоро вы узнаете результаты! 🔥

Всего участников: ${giveaway._count.participations}`;

  // Отправляем тизер в каналы результатов или каналы публикации
  let channels = giveaway.resultsChannels.map(rc => rc.channel);

  if (channels.length === 0 && giveaway.messages.length > 0) {
    const channelIds = [...new Set(giveaway.messages.map(m => m.channelId))];
    const foundChannels = await prisma.channel.findMany({
      where: { id: { in: channelIds } },
      select: { id: true, telegramChatId: true, title: true },
    });
    channels = foundChannels;
  }

  if (channels.length === 0) {
    console.log(`[PublishResults] RANDOMIZER: Нет каналов для тизера`);
    return;
  }

  for (const channel of channels) {
    try {
      const response = await fetch(`${config.apiUrl}/internal/send-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': config.internalApiToken,
        },
        body: JSON.stringify({
          chatId: channel.telegramChatId.toString(),
          text: teaserText,
          parseMode: 'HTML',
        }),
      });

      const data = await response.json() as { ok: boolean; messageId?: number };

      if (data.ok && data.messageId) {
        // Сохраняем тизер-сообщение (kind: RESULTS, чтобы потом обновить)
        await prisma.giveawayMessage.create({
          data: {
            giveawayId: giveaway.id,
            channelId: channel.id,
            kind: GiveawayMessageKind.RESULTS,
            telegramMessageId: data.messageId,
          },
        });
        console.log(`[PublishResults] RANDOMIZER: Тизер отправлен в ${channel.title}`);
      }
    } catch (error) {
      console.error(`[PublishResults] RANDOMIZER: Ошибка отправки тизера:`, error);
    }
  }

  // Обновляем кнопку в оригинальных постах — убираем "Участвовать"
  for (const msg of giveaway.messages) {
    if (msg.kind !== GiveawayMessageKind.START) continue;
    
    const channel = await prisma.channel.findUnique({
      where: { id: msg.channelId },
      select: { telegramChatId: true },
    });

    if (!channel) continue;

    try {
      const waitUrl = `https://t.me/${BOT_USERNAME}/participate?startapp=results_${giveaway.id}`;
      await fetch(`${config.apiUrl}/internal/edit-message-button`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': config.internalApiToken,
        },
        body: JSON.stringify({
          chatId: channel.telegramChatId.toString(),
          messageId: msg.telegramMessageId,
          replyMarkup: {
            inline_keyboard: [[
              { text: '🎲 Ожидайте объявления победителей', url: waitUrl }
            ]]
          },
        }),
      });
    } catch (error) {
      console.error(`[PublishResults] RANDOMIZER: Ошибка обновления кнопки:`, error);
    }
  }
}

/**
 * Режим EDIT_START_POST — редактировать оригинальные посты
 */
async function publishResultsSamePost(giveaway: GiveawayWithRelations): Promise<void> {
  const startMessages = giveaway.messages;
  
  if (startMessages.length === 0) {
    console.log(`[PublishResults] Нет стартовых сообщений для редактирования`);
    return;
  }
  
  const winnersText = formatWinnersText(giveaway.winners);
  const resultsUrl = `https://t.me/${BOT_USERNAME}/participate?startapp=results_${giveaway.id}`;
  
  // Определяем есть ли медиа у поста
  const hasMedia = giveaway.postTemplate?.mediaType && giveaway.postTemplate.mediaType !== 'NONE';
  
  for (const msg of startMessages) {
    // Получаем канал
    const channel = await prisma.channel.findUnique({
      where: { id: msg.channelId },
      select: { telegramChatId: true, title: true },
    });
    
    if (!channel) continue;
    
    // Формируем новый текст
    const originalText = giveaway.postTemplate?.text || '';
    const newText = `${originalText}\n\n${'─'.repeat(20)}\n\n${winnersText}`;
    
    try {
      // Редактируем сообщение через internal API
      // Для постов с медиа используем caption, для текстовых — text
      const requestBody: Record<string, unknown> = {
        chatId: channel.telegramChatId.toString(),
        messageId: msg.telegramMessageId,
        parseMode: 'HTML',
        replyMarkup: {
          inline_keyboard: [[
            { text: '🏆 Результаты', url: resultsUrl }
          ]]
        },
      };
      
      if (hasMedia) {
        requestBody.caption = newText;
      } else {
        requestBody.text = newText;
      }
      
      const response = await fetch(`${config.apiUrl}/internal/edit-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': config.internalApiToken,
        },
        body: JSON.stringify(requestBody),
      });
      
      const data = await response.json() as { ok: boolean; error?: string };
      
      if (data.ok) {
        console.log(`[PublishResults] Отредактирован пост в канале ${channel.title}`);
      } else {
        console.error(`[PublishResults] Ошибка редактирования в ${channel.title}: ${data.error}`);
      }
    } catch (error) {
      console.error(`[PublishResults] Ошибка редактирования:`, error);
    }
  }
}

/**
 * Режим SEPARATE_POSTS — отправить новые посты с результатами
 */
async function publishResultsSeparatePosts(giveaway: GiveawayWithRelations): Promise<void> {
  // Используем каналы для результатов, или каналы публикации
  let channels = giveaway.resultsChannels.map(rc => rc.channel);
  
  // Если каналы для результатов не указаны — ищем в сообщениях
  if (channels.length === 0 && giveaway.messages.length > 0) {
    const channelIds = [...new Set(giveaway.messages.map(m => m.channelId))];
    const foundChannels = await prisma.channel.findMany({
      where: { id: { in: channelIds } },
      select: { id: true, telegramChatId: true, title: true },
    });
    channels = foundChannels;
  }
  
  if (channels.length === 0) {
    console.log(`[PublishResults] Нет каналов для публикации результатов`);
    return;
  }
  
  const resultsText = formatResultsPost(giveaway);
  const resultsUrl = `https://t.me/${BOT_USERNAME}/participate?startapp=results_${giveaway.id}`;
  
  for (const channel of channels) {
    try {
      // Отправляем новое сообщение
      const response = await fetch(`${config.apiUrl}/internal/send-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': config.internalApiToken,
        },
        body: JSON.stringify({
          chatId: channel.telegramChatId.toString(),
          text: resultsText,
          parseMode: 'HTML',
          replyMarkup: {
            inline_keyboard: [[
              { text: '🏆 Подробнее', url: resultsUrl }
            ]]
          },
        }),
      });
      
      const data = await response.json() as { ok: boolean; messageId?: number };
      
      if (data.ok && data.messageId) {
        // Сохраняем сообщение с результатами
        await prisma.giveawayMessage.create({
          data: {
            giveawayId: giveaway.id,
            channelId: channel.id,
            kind: GiveawayMessageKind.RESULTS,
            telegramMessageId: data.messageId,
          },
        });
        console.log(`[PublishResults] Отправлен пост в канал ${channel.title}`);
      } else {
        console.error(`[PublishResults] Ошибка отправки в ${channel.title}`);
      }
    } catch (error) {
      console.error(`[PublishResults] Ошибка отправки:`, error);
    }
  }
  
  // Обновляем кнопку в оригинальных постах
  for (const msg of giveaway.messages) {
    const channel = await prisma.channel.findUnique({
      where: { id: msg.channelId },
      select: { telegramChatId: true },
    });
    
    if (!channel) continue;
    
    try {
      // Меняем кнопку на "Результаты"
      await fetch(`${config.apiUrl}/internal/edit-message-button`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': config.internalApiToken,
        },
        body: JSON.stringify({
          chatId: channel.telegramChatId.toString(),
          messageId: msg.telegramMessageId,
          replyMarkup: {
            inline_keyboard: [[
              { text: '🏆 Результаты', url: resultsUrl }
            ]]
          },
        }),
      });
    } catch (error) {
      console.error(`[PublishResults] Ошибка обновления кнопки:`, error);
    }
  }
}

/**
 * Запуск scheduler с интервалом
 */
export function startGiveawayScheduler(intervalMs: number = 60_000): NodeJS.Timeout {
  console.log(`[Scheduler] Запущен с интервалом ${intervalMs / 1000}с`);
  
  // Запускаем сразу при старте
  processGiveawayLifecycle();
  
  // И затем периодически
  return setInterval(processGiveawayLifecycle, intervalMs);
}
