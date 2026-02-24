import { prisma, GiveawayStatus, ParticipationStatus, GiveawayMessageKind, PublishResultsMode } from '@randombeast/database';
import crypto from 'crypto';
import { config } from '../config.js';
import { awardWinnerBadges } from '../lib/badges.js';
import { checkContent } from '@randombeast/shared';
import { notifyCatalogApproved } from '../lib/admin-notify.js';

// Имя бота для deep links
const BOT_USERNAME = process.env.BOT_USERNAME || 'BeastRandomBot';

// Порог мошенничества: участники с fraudScore >= этого значения исключаются
const FRAUD_SCORE_THRESHOLD = 80;

// Максимальная длина Telegram-сообщения
const TG_MAX_MESSAGE_LENGTH = 4096;

// ============================================================================
// Weighted Random: cumulative sum + binary search + crypto.randomInt()
// ============================================================================

interface WeightedEntry {
  userId: string;
  participationId: string;
  ticketsUsed: number;
  cumulativeWeight: number;
}

/**
 * Строит массив с накопленными весами (cumulative sum)
 * для weighted random selection.
 */
function buildCumulativePool(
  participants: Array<{ userId: string; id: string; ticketsBase: number; ticketsExtra: number }>
): WeightedEntry[] {
  const pool: WeightedEntry[] = [];
  let cumulative = 0;
  for (const p of participants) {
    const weight = Math.max(p.ticketsBase + p.ticketsExtra, 1);
    cumulative += weight;
    pool.push({
      userId: p.userId,
      participationId: p.id,
      ticketsUsed: weight,
      cumulativeWeight: cumulative,
    });
  }
  return pool;
}

/**
 * Binary search: возвращает индекс первого элемента, у которого
 * cumulativeWeight >= target.
 */
function binarySearchIndex(pool: WeightedEntry[], target: number): number {
  let lo = 0;
  let hi = pool.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pool[mid].cumulativeWeight < target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/**
 * Выбрать одного участника из пула с учётом весов (weighted random).
 * Использует Node.js crypto.randomInt() — криптографически безопасный.
 */
function weightedRandomSelect(pool: WeightedEntry[]): WeightedEntry {
  if (pool.length === 0) throw new Error('Empty weighted pool');
  const totalWeight = pool[pool.length - 1].cumulativeWeight;
  // crypto.randomInt(min, max) → [min, max) (max exclusive)
  // Нам нужен [1, totalWeight] → crypto.randomInt(1, totalWeight + 1)
  const target = crypto.randomInt(1, totalWeight + 1);
  const idx = binarySearchIndex(pool, target);
  return pool[idx];
}

/**
 * Генерация SHA256 audit seed для прозрачности выбора победителей.
 * Формат: SHA256("giveawayId|endAt|[{userId,tickets},...sorted]")
 * Опубликуйте seed + данные участников — и любой сможет верифицировать результат.
 */
function generateDrawSeed(
  giveawayId: string,
  endAt: Date | null,
  participants: Array<{ userId: string; ticketsBase: number; ticketsExtra: number }>
): string {
  const sorted = [...participants]
    .sort((a, b) => a.userId.localeCompare(b.userId))
    .map(p => ({ id: p.userId, tickets: p.ticketsBase + p.ticketsExtra }));
  const payload = `${giveawayId}|${endAt?.toISOString() ?? ''}|${JSON.stringify(sorted)}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
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
      // 14.8 Уведомления каталога: если появились новые активные розыгрыши — уведомляем подписчиков
      notifyCatalogSubscribers().catch(err =>
        console.error('[Scheduler] Ошибка уведомлений каталога:', err)
      );
    }
    
    // 1.5 SANDBOX: удаляем истёкшие sandbox розыгрыши (TTL 24ч)
    const expiredSandbox = await prisma.giveaway.findMany({
      where: {
        isSandbox: true,
        endAt: { lte: now },
        status: { notIn: [GiveawayStatus.CANCELLED] },
      },
      select: { id: true },
    });
    for (const s of expiredSandbox) {
      await prisma.giveaway.update({
        where: { id: s.id },
        data: { status: GiveawayStatus.CANCELLED },
      });
    }
    if (expiredSandbox.length > 0) {
      console.log(`[Scheduler] Истёкших sandbox розыгрышей отменено: ${expiredSandbox.length}`);
    }

    // 1.6 Автоматическая модерация каталога (17.1)
    runCatalogAutoModeration().catch(err =>
      console.error('[Scheduler] Ошибка модерации каталога:', err)
    );

    // 2. ACTIVE → FINISHED (когда наступил endAt, не sandbox)
    const toFinish = await prisma.giveaway.findMany({
      where: {
        status: GiveawayStatus.ACTIVE,
        endAt: { lte: now },
        isSandbox: false,
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
 * 
 * Алгоритм: cumulative sum + binary search + crypto.randomInt()
 * Прозрачность: drawSeed (SHA256) сохраняется в БД
 * Честность: subscriptionVerified filter + fraudScore threshold
 * Reserve: создаются резервные победители (isReserve=true)
 */
export async function finishGiveaway(giveawayId: string): Promise<{
  ok: boolean;
  winnersCount?: number;
  drawSeed?: string;
  error?: string;
}> {
  try {
    // Загружаем розыгрыш с участниками и данными о подписках
    const giveaway = await prisma.giveaway.findUnique({
      where: { id: giveawayId },
      include: {
        owner: {
          select: { id: true, telegramUserId: true, username: true, firstName: true },
        },
        requiredSubscriptions: { select: { id: true } },
        participations: {
          where: { status: ParticipationStatus.JOINED },
          include: {
            user: {
              select: { id: true, telegramUserId: true, firstName: true, username: true, notificationsBlocked: true },
            },
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

    const allParticipants = giveaway.participations;
    const hasRequiredSubscriptions = giveaway.requiredSubscriptions.length > 0;

    // ── Фильтр 1: subscriptionVerified (только если есть обязательные подписки)
    // ── Фильтр 2: fraudScore (исключаем явных мошенников)
    const eligibleParticipants = allParticipants.filter(p => {
      if (hasRequiredSubscriptions && !p.subscriptionVerified) return false;
      if (p.fraudScore >= FRAUD_SCORE_THRESHOLD) return false;
      return true;
    });

    console.log(
      `[Scheduler] Розыгрыш ${giveawayId}: всего участников=${allParticipants.length}, ` +
      `допущено=${eligibleParticipants.length} (фильтр: subscriptionVerified=${hasRequiredSubscriptions}, fraud<${FRAUD_SCORE_THRESHOLD})`
    );

    // Если нет допущенных участников — отменяем
    if (eligibleParticipants.length === 0) {
      await prisma.giveaway.update({
        where: { id: giveawayId },
        data: { status: GiveawayStatus.CANCELLED },
      });
      console.log(`[Scheduler] Розыгрыш ${giveawayId} отменён — нет допущенных участников`);
      return { ok: true, winnersCount: 0 };
    }

    // ── Генерируем audit seed (SHA256) ──────────────────────────────────────
    const drawSeed = generateDrawSeed(giveawayId, giveaway.endAt, eligibleParticipants);
    console.log(`[Scheduler] Draw seed: ${drawSeed}`);

    // ── Выбираем основных победителей ───────────────────────────────────────
    const mainWinnersCount = Math.min(giveaway.winnersCount, eligibleParticipants.length);
    const reserveWinnersCount = Math.min(
      giveaway.reserveWinnersCount,
      eligibleParticipants.length - mainWinnersCount
    );

    let remaining = [...eligibleParticipants];
    const mainWinners: Array<{ userId: string; place: number; ticketsUsed: number; isReserve: boolean }> = [];

    // Выбираем по одному с cumulative sum + binary search
    for (let place = 1; place <= mainWinnersCount; place++) {
      const pool = buildCumulativePool(remaining);
      const selected = weightedRandomSelect(pool);
      mainWinners.push({ userId: selected.userId, place, ticketsUsed: selected.ticketsUsed, isReserve: false });
      remaining = remaining.filter(p => p.userId !== selected.userId);
    }

    // ── Выбираем резервных победителей (если reserveWinnersCount > 0) ───────
    const reserveWinners: Array<{ userId: string; place: number; ticketsUsed: number; isReserve: boolean }> = [];

    for (let i = 0; i < reserveWinnersCount; i++) {
      if (remaining.length === 0) break;
      const pool = buildCumulativePool(remaining);
      const selected = weightedRandomSelect(pool);
      reserveWinners.push({
        userId: selected.userId,
        place: mainWinnersCount + i + 1,
        ticketsUsed: selected.ticketsUsed,
        isReserve: true,
      });
      remaining = remaining.filter(p => p.userId !== selected.userId);
    }

    const allWinners = [...mainWinners, ...reserveWinners];

    // ── Сохраняем в транзакции ───────────────────────────────────────────────
    await prisma.$transaction(async (tx) => {
      for (const winner of allWinners) {
        await tx.winner.create({
          data: {
            giveawayId,
            userId: winner.userId,
            place: winner.place,
            ticketsUsed: winner.ticketsUsed,
            isReserve: winner.isReserve,
          },
        });
      }
      await tx.giveaway.update({
        where: { id: giveawayId },
        data: {
          status: GiveawayStatus.FINISHED,
          drawSeed,
        },
      });
    });

    console.log(
      `[Scheduler] Розыгрыш ${giveawayId} завершён. ` +
      `Победителей: ${mainWinners.length}, резервных: ${reserveWinners.length}`
    );

    // ── Асинхронные post-finish задачи (fire-and-forget) ────────────────────
    publishResults(giveawayId).catch(err =>
      console.error('[Scheduler] Ошибка публикации результатов:', err)
    );
    notifyWinners(giveawayId).catch(err =>
      console.error('[Scheduler] Ошибка уведомлений победителей:', err)
    );
    notifyCreatorFinished(giveawayId).catch(err =>
      console.error('[Scheduler] Ошибка уведомления создателя:', err)
    );

    // 14.5 Бейджи: начисляем победителям (fire-and-forget)
    Promise.all(mainWinners.map((w) => awardWinnerBadges(w.userId)))
      .catch((err) => console.error('[Badges] Ошибка начисления бейджей победителям:', err));

    return { ok: true, winnersCount: mainWinners.length, drawSeed };

  } catch (error) {
    console.error(`[Scheduler] Ошибка завершения розыгрыша ${giveawayId}:`, error);
    return { ok: false, error: 'Внутренняя ошибка' };
  }
}

/**
 * Отправить Telegram-сообщение напрямую через Bot API
 */
async function sendTelegramMessage(
  telegramUserId: string,
  text: string,
  replyMarkup?: object
): Promise<boolean> {
  if (!config.botToken) return false;
  try {
    const body: Record<string, unknown> = {
      chat_id: telegramUserId,
      text,
      parse_mode: 'HTML',
    };
    if (replyMarkup) body.reply_markup = replyMarkup;

    const res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json() as { ok: boolean; description?: string };
    if (!data.ok) {
      // 403 — пользователь заблокировал бота
      if (data.description?.includes('blocked') || data.description?.includes('Forbidden')) {
        await prisma.user.updateMany({
          where: { telegramUserId: BigInt(telegramUserId) },
          data: { notificationsBlocked: true },
        });
      }
    }
    return data.ok;
  } catch {
    return false;
  }
}

/**
 * Уведомление победителям с учётом prizeDeliveryMethod и notificationsBlocked
 */
async function notifyWinners(giveawayId: string): Promise<void> {
  // Загружаем полные данные розыгрыша для формирования сообщений
  const giveaway = await prisma.giveaway.findUnique({
    where: { id: giveawayId },
    select: {
      title: true,
      prizeDescription: true,
      prizeDeliveryMethod: true,
      prizeInstruction: true,
      owner: { select: { username: true, firstName: true } },
      winners: {
        where: { isReserve: false },
        orderBy: { place: 'asc' },
        include: {
          user: {
            select: {
              id: true,
              telegramUserId: true,
              notificationsBlocked: true,
            },
          },
        },
      },
      _count: { select: { winners: { where: { isReserve: false } } } },
    },
  });

  if (!giveaway || !config.botToken) return;

  const totalWinners = giveaway._count.winners;
  const creatorHandle = giveaway.owner?.username
    ? `@${giveaway.owner.username}`
    : giveaway.owner?.firstName || 'организатором';

  for (const winner of giveaway.winners) {
    // Пропускаем если пользователь заблокировал уведомления
    if (winner.user.notificationsBlocked) {
      console.log(`[Notify] Пропуск победителя ${winner.userId} (notificationsBlocked)`);
      continue;
    }

    const tid = winner.user.telegramUserId.toString();
    const titleSafe = escapeHtml(giveaway.title);
    const prizeText = giveaway.prizeDescription
      ? `\n🎁 Приз: ${escapeHtml(giveaway.prizeDescription)}`
      : '';

    let messageText: string;
    let replyMarkup: object | undefined;

    switch (giveaway.prizeDeliveryMethod) {
      case 'CONTACT_CREATOR':
        messageText =
          `🎉 <b>Поздравляем! Вы выиграли!</b>\n\n` +
          `Вы победили в розыгрыше "<b>${titleSafe}</b>"!\n` +
          `🏆 Ваше место: <b>${winner.place}</b> из ${totalWinners}${prizeText}\n\n` +
          `📩 Свяжитесь с организатором: ${creatorHandle}`;
        if (giveaway.owner?.username) {
          replyMarkup = {
            inline_keyboard: [[
              { text: '💬 Написать организатору', url: `https://t.me/${giveaway.owner.username}` },
            ]],
          };
        }
        break;

      case 'BOT_INSTRUCTION':
        messageText =
          `🎉 <b>Поздравляем! Вы выиграли!</b>\n\n` +
          `Вы победили в розыгрыше "<b>${titleSafe}</b>"!\n` +
          `🏆 Ваше место: <b>${winner.place}</b> из ${totalWinners}${prizeText}\n\n` +
          `📋 <b>Инструкция по получению приза:</b>\n` +
          `${escapeHtml(giveaway.prizeInstruction || 'Свяжитесь с организатором.')}`;
        break;

      case 'FORM':
        messageText =
          `🎉 <b>Поздравляем! Вы выиграли!</b>\n\n` +
          `Вы победили в розыгрыше "<b>${titleSafe}</b>"!\n` +
          `🏆 Ваше место: <b>${winner.place}</b> из ${totalWinners}${prizeText}\n\n` +
          `📝 Заполните форму для получения приза:`;
        replyMarkup = {
          inline_keyboard: [[
            {
              text: '📝 Заполнить форму',
              web_app: { url: `${config.webappUrl}/prize-form/${giveawayId}` },
            },
          ]],
        };
        break;

      default: // CONTACT_CREATOR fallback
        messageText =
          `🎉 <b>Поздравляем! Вы выиграли!</b>\n\n` +
          `Вы победили в розыгрыше "<b>${titleSafe}</b>"!\n` +
          `🏆 Ваше место: <b>${winner.place}</b> из ${totalWinners}${prizeText}\n\n` +
          `Свяжитесь с организатором для получения приза.`;
    }

    try {
      const ok = await sendTelegramMessage(tid, messageText, replyMarkup);
      if (ok) {
        await prisma.winner.update({
          where: { id: winner.id },
          data: { notifiedAt: new Date() },
        });
      }
    } catch (err) {
      console.error(`[Notify] Ошибка уведомления победителя ${winner.userId}:`, err);
    }

    // Rate limit: Telegram allows 30 messages/sec, добавляем паузу для больших розыгрышей
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

/**
 * Уведомление создателя о завершении розыгрыша с итогами
 */
async function notifyCreatorFinished(giveawayId: string): Promise<void> {
  const giveaway = await prisma.giveaway.findUnique({
    where: { id: giveawayId },
    select: {
      title: true,
      drawSeed: true,
      owner: { select: { telegramUserId: true, notificationsBlocked: true } },
      winners: {
        where: { isReserve: false },
        orderBy: { place: 'asc' },
        include: { user: { select: { firstName: true, username: true } } },
      },
      _count: { select: { participations: { where: { status: 'JOINED' } } } },
    },
  });

  if (!giveaway || !config.botToken) return;
  if (giveaway.owner.notificationsBlocked) return;

  const creatorTid = giveaway.owner.telegramUserId.toString();
  const winnersLines = giveaway.winners.map(w => {
    const medals = ['🥇', '🥈', '🥉'];
    const medal = w.place <= 3 ? medals[w.place - 1] : '🏅';
    const name = w.user.username
      ? `@${escapeHtml(w.user.username)}`
      : escapeHtml(w.user.firstName || 'Пользователь');
    return `${medal} ${w.place}. ${name}`;
  });

  const resultsUrl = `https://t.me/${BOT_USERNAME}/participate?startapp=results_${giveawayId}`;

  const text =
    `✅ <b>Розыгрыш «${escapeHtml(giveaway.title)}» завершён!</b>\n\n` +
    `🏆 <b>Победители:</b>\n${winnersLines.join('\n')}\n\n` +
    `👥 Всего участников: ${giveaway._count.participations}\n\n` +
    (giveaway.drawSeed ? `🔑 Seed: <code>${giveaway.drawSeed.slice(0, 16)}…</code>\n\n` : '') +
    `📊 Подробная статистика в приложении`;

  await sendTelegramMessage(creatorTid, text, {
    inline_keyboard: [[
      { text: '📊 Открыть статистику', url: resultsUrl },
    ]],
  });
}

/**
 * Уведомление участникам (и создателю) об отмене розыгрыша
 * Вызывается из cancel route. Fire-and-forget.
 */
export async function notifyCancelToAll(
  giveawayId: string,
  giveawayTitle: string,
  ownerUserId: string
): Promise<void> {
  if (!config.botToken) return;

  const titleSafe = escapeHtml(giveawayTitle);

  // 1. Уведомляем создателя
  try {
    const owner = await prisma.user.findUnique({
      where: { id: ownerUserId },
      select: { telegramUserId: true, notificationsBlocked: true },
    });
    if (owner && !owner.notificationsBlocked) {
      await sendTelegramMessage(
        owner.telegramUserId.toString(),
        `❌ <b>Розыгрыш «${titleSafe}» отменён.</b>`
      );
    }
  } catch (err) {
    console.error('[Notify] Ошибка уведомления создателя об отмене:', err);
  }

  // 2. Уведомляем участников (батчами, 30 в секунду)
  const participants = await prisma.participation.findMany({
    where: { giveawayId, status: ParticipationStatus.JOINED },
    select: {
      user: { select: { telegramUserId: true, notificationsBlocked: true } },
    },
  });

  const message = `⚠️ Розыгрыш "<b>${titleSafe}</b>" был отменён организатором.\n\nНе расстраивайтесь — впереди ещё много интересных розыгрышей! 🍀`;
  let sent = 0;

  for (const p of participants) {
    if (p.user.notificationsBlocked) continue;
    try {
      await sendTelegramMessage(p.user.telegramUserId.toString(), message);
      sent++;
      // Rate limit: 30 msg/sec
      if (sent % 30 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        await new Promise(resolve => setTimeout(resolve, 33));
      }
    } catch {
      // Ignore individual send errors
    }
  }

  console.log(`[Notify] Отмена розыгрыша ${giveawayId}: уведомлено ${sent}/${participants.length} участников`);
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
 * Тип для розыгрыша с связями (используется в publish-функциях)
 */
interface GiveawayWithRelations {
  id: string;
  title: string;
  publishResultsMode: PublishResultsMode;
  drawSeed: string | null;
  postTemplate: { text: string; mediaType: string } | null;
  messages: Array<{
    id: string;
    channelId: string;
    kind: GiveawayMessageKind;
    telegramMessageId: number;
  }>;
  winners: Array<{
    place: number;
    isReserve: boolean;
    user: {
      telegramUserId: bigint;
      firstName: string | null;
      username: string | null;
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
 * Форматирование списка победителей (только основные, без резервных)
 * Обрезает список если нужно соблюдать 4096-символьный лимит Telegram.
 */
function formatWinnersText(
  winners: GiveawayWithRelations['winners'],
  maxLength?: number
): string {
  const mainWinners = winners.filter(w => !w.isReserve);

  if (mainWinners.length === 0) {
    return '❌ Розыгрыш завершён. Победителей нет.';
  }

  const lines = ['🏆 <b>Победители:</b>', ''];
  let truncated = false;

  for (const winner of mainWinners) {
    const medal = getMedal(winner.place);
    const name = winner.user.username
      ? `@${escapeHtml(winner.user.username)}`
      : escapeHtml(winner.user.firstName || `User${winner.user.telegramUserId.toString().slice(-4)}`);
    const mention = `<a href="tg://user?id=${winner.user.telegramUserId}">${name}</a>`;
    const line = `${medal} ${winner.place}. ${mention}`;

    if (maxLength !== undefined) {
      const currentLength = lines.join('\n').length + line.length + 1;
      if (currentLength > maxLength - 60) {
        // Оставляем место для "... и ещё N победителей"
        truncated = true;
        break;
      }
    }
    lines.push(line);
  }

  if (truncated) {
    const shown = lines.length - 2; // минус заголовок и пустая строка
    lines.push(`…и ещё ${mainWinners.length - shown} победителей`);
  }

  return lines.join('\n');
}

/**
 * Форматирование полного поста с результатами.
 * Соблюдает TG_MAX_MESSAGE_LENGTH (4096 символов).
 */
function formatResultsPost(giveaway: GiveawayWithRelations): string {
  const resultsUrl = `https://t.me/${BOT_USERNAME}/participate?startapp=results_${giveaway.id}`;
  const footer = `\n\n👥 Участников: ${giveaway._count.participations}\n🏆 <a href="${resultsUrl}">Подробнее</a>`;
  const header = `🎉 <b>Розыгрыш "${escapeHtml(giveaway.title)}" завершён!</b>\n\n`;
  const maxWinnersLen = TG_MAX_MESSAGE_LENGTH - header.length - footer.length - 20;

  const winnersText = formatWinnersText(giveaway.winners, maxWinnersLen);
  const full = `${header}${winnersText}${footer}`;

  // Hard truncate if still over limit (shouldn't happen after soft truncate above)
  if (full.length > TG_MAX_MESSAGE_LENGTH) {
    return full.slice(0, TG_MAX_MESSAGE_LENGTH - 3) + '...';
  }
  return full;
}

/**
 * Публикация результатов розыгрыша
 */
async function publishResults(giveawayId: string): Promise<void> {
  const giveaway = await prisma.giveaway.findUnique({
    where: { id: giveawayId },
    include: {
      postTemplate: { select: { text: true, mediaType: true } },
      messages: { where: { kind: GiveawayMessageKind.START } },
      winners: {
        orderBy: { place: 'asc' },
        include: {
          user: { select: { telegramUserId: true, firstName: true, username: true } },
        },
      },
      resultsChannels: {
        include: {
          channel: { select: { id: true, telegramChatId: true, title: true } },
        },
      },
      _count: { select: { participations: true } },
    },
    // Include drawSeed directly
  });

  if (!giveaway) {
    console.error(`[PublishResults] Розыгрыш ${giveawayId} не найден`);
    return;
  }

  const publishMode = giveaway.publishResultsMode;
  console.log(`[PublishResults] Режим: ${publishMode}, Победителей: ${giveaway.winners.filter(w => !w.isReserve).length}`);

  if (publishMode === PublishResultsMode.RANDOMIZER) {
    await publishRandomizerTeaser(giveaway as unknown as GiveawayWithRelations);
  } else if (publishMode === PublishResultsMode.EDIT_START_POST) {
    await publishResultsSamePost(giveaway as unknown as GiveawayWithRelations);
  } else {
    await publishResultsSeparatePosts(giveaway as unknown as GiveawayWithRelations);
  }
}

/**
 * Режим RANDOMIZER — отправить тизер-сообщение (без списка победителей)
 * Создатель потом объявит победителей на сайте через рандомайзер
 */
async function publishRandomizerTeaser(giveaway: GiveawayWithRelations): Promise<void> {
  const randomizerUrl = `${config.siteUrl}/winner/${giveaway.id}`;
  const teaserText =
    `🎉 <b>Розыгрыш «${escapeHtml(giveaway.title)}» завершён!</b>\n\n` +
    `🎲 Победители будут объявлены создателем в прямом эфире с помощью рандомайзера.\n\n` +
    `Следите за трансляцией — скоро вы узнаете результаты! 🔥\n\n` +
    `👥 Участников: ${giveaway._count.participations}`;

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
          replyMarkup: {
            inline_keyboard: [[
              { text: '🎲 Смотреть рандомайзер', url: randomizerUrl },
            ]],
          },
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
 * Режим EDIT_START_POST — редактировать оригинальные посты.
 * Соблюдает лимит 4096 символов (текст) и 1024 символа (caption для медиа).
 */
async function publishResultsSamePost(giveaway: GiveawayWithRelations): Promise<void> {
  const startMessages = giveaway.messages;

  if (startMessages.length === 0) {
    console.log(`[PublishResults] Нет стартовых сообщений для редактирования`);
    // Fallback: отправляем отдельные посты
    return publishResultsSeparatePosts(giveaway);
  }

  const resultsUrl = `https://t.me/${BOT_USERNAME}/participate?startapp=results_${giveaway.id}`;
  const hasMedia = giveaway.postTemplate?.mediaType && giveaway.postTemplate.mediaType !== 'NONE';
  // Telegram: text max 4096, caption max 1024
  const maxLen = hasMedia ? 1024 : TG_MAX_MESSAGE_LENGTH;
  const separator = '\n\n' + '─'.repeat(20) + '\n\n';
  const originalText = giveaway.postTemplate?.text || '';

  // Вычисляем сколько места есть под список победителей
  const maxWinnersLen = maxLen - originalText.length - separator.length - 20;
  const winnersText = maxWinnersLen > 50
    ? formatWinnersText(giveaway.winners, maxWinnersLen)
    : `🏆 Победители объявлены! Смотрите подробнее по ссылке.`;

  let newText = `${originalText}${separator}${winnersText}`;

  // Hard truncate if still over limit
  if (newText.length > maxLen) {
    newText = newText.slice(0, maxLen - 3) + '...';
  }

  const replyMarkup = {
    inline_keyboard: [[
      { text: '🏆 Результаты', url: resultsUrl },
    ]],
  };

  for (const msg of startMessages) {
    const channel = await prisma.channel.findUnique({
      where: { id: msg.channelId },
      select: { telegramChatId: true, title: true },
    });
    if (!channel) continue;

    try {
      const requestBody: Record<string, unknown> = {
        chatId: channel.telegramChatId.toString(),
        messageId: msg.telegramMessageId,
        parseMode: 'HTML',
        replyMarkup,
      };

      if (hasMedia) {
        requestBody.caption = newText;
      } else {
        requestBody.text = newText;
      }

      const response = await fetch(`${config.apiUrl}/internal/edit-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Token': config.internalApiToken },
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

// ============================================================================
// 14.8 Уведомления каталога
// ============================================================================

/**
 * Отправляет уведомления пользователям, подписавшимся на новые розыгрыши в каталоге.
 * Запускается когда появляются новые ACTIVE розыгрыши с catalogEnabled.
 * Для производительности использует cursor-based пагинацию с паузами.
 */
async function notifyCatalogSubscribers(): Promise<void> {
  // Находим розыгрыши, которые только что стали активными и включены в каталог
  // (startAt в последние 90 секунд)
  const since = new Date(Date.now() - 90_000);
  const newCatalogGiveaways = await prisma.giveaway.findMany({
    where: {
      status: GiveawayStatus.ACTIVE,
      startAt: { gte: since },
      draftPayload: { path: ['catalogEnabled'], equals: true },
    },
    select: {
      id: true,
      title: true,
      type: true,
      winnersCount: true,
      shortCode: true,
      owner: {
        select: { firstName: true, username: true },
      },
    },
    take: 5, // Не более 5 розыгрышей за раз
  });

  if (newCatalogGiveaways.length === 0) return;

  // Находим подписчиков каталога батчами
  const BATCH = 50;
  let cursor: string | undefined;

  for (let attempt = 0; attempt < 200; attempt++) {
    const users = await prisma.user.findMany({
      where: {
        catalogNotificationsEnabled: true,
        notificationsBlocked: false,
        notificationsEnabled: true,
      },
      select: { id: true, telegramUserId: true, language: true },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
    });

    if (users.length === 0) break;

    for (const user of users) {
      const lang = (user.language || 'ru') as 'ru' | 'en' | 'kk';

      for (const g of newCatalogGiveaways) {
        const text = lang === 'en'
          ? `🎁 <b>New giveaway in the catalog!</b>\n\n<b>${g.title}</b>\n👥 Winners: ${g.winnersCount}\n\nOpen the app to participate!`
          : lang === 'kk'
          ? `🎁 <b>Каталогта жаңа ұтыс ойыны!</b>\n\n<b>${g.title}</b>\n👥 Жеңімпаздар: ${g.winnersCount}\n\nҚатысу үшін қолданбаны ашыңыз!`
          : `🎁 <b>Новый розыгрыш в каталоге!</b>\n\n<b>${g.title}</b>\n👥 Победителей: ${g.winnersCount}\n\nОткройте приложение, чтобы участвовать!`;

        await sendTelegramMessage(user.telegramUserId.toString(), text, {
          inlineKeyboard: [[{
            text: lang === 'en' ? '🎁 Participate' : lang === 'kk' ? '🎁 Қатысу' : '🎁 Участвовать',
            url: `https://t.me/${BOT_USERNAME}/app?startapp=join_${g.id}`,
          }]],
        });

        // Микропауза между сообщениями чтобы не перегружать Bot API
        await new Promise((r) => setTimeout(r, 80));
      }
    }

    if (users.length < BATCH) break;
    cursor = users[users.length - 1].id;

    // Пауза между батчами
    await new Promise((r) => setTimeout(r, 1000));
  }
}

// ============================================================================
// 17.1 Автоматическая модерация каталога
// ============================================================================

/**
 * Автоматическая модерация розыгрышей для попадания в каталог.
 *
 * Условия для одобрения:
 *   1. status = ACTIVE
 *   2. isPublicInCatalog = true (тумблер "Продвижение" включён)
 *   3. totalParticipants >= 100
 *   4. catalogApproved = false (ещё не одобрен)
 *   5. Создатель НЕ в SystemBan
 *   6. Заголовок и текст поста НЕ содержат стоп-слов (checkContent)
 *
 * Если все условия выполнены → catalogApproved=true, catalogApprovedAt=now()
 * Запускается каждый цикл планировщика.
 */
async function runCatalogAutoModeration(): Promise<void> {
  try {
    // Находим кандидатов: активные, с продвижением, ≥100 участников, ещё не одобренные
    const candidates = await prisma.giveaway.findMany({
      where: {
        status: GiveawayStatus.ACTIVE,
        isPublicInCatalog: true,
        catalogApproved: false,
        totalParticipants: { gte: 100 },
      },
      select: {
        id: true,
        title: true,
        totalParticipants: true,
        ownerUserId: true,
        owner: {
          select: {
            id: true,
            username: true,
            systemBan: { select: { id: true, expiresAt: true } },
          },
        },
        postTemplate: {
          select: { text: true },
        },
      },
    });

    if (candidates.length === 0) return;

    console.log(`[CatalogModeration] Кандидатов для проверки: ${candidates.length}`);

    for (const giveaway of candidates) {
      // 1. Проверяем системный бан создателя
      const ban = giveaway.owner.systemBan;
      if (ban) {
        // Если бан истёк — игнорируем
        const banActive = !ban.expiresAt || ban.expiresAt > new Date();
        if (banActive) {
          console.log(`[CatalogModeration] Пропускаем ${giveaway.id}: создатель в бане`);
          continue;
        }
      }

      // 2. Проверяем стоп-слова в названии и тексте поста
      const textToCheck = [
        giveaway.title || '',
        giveaway.postTemplate?.text || '',
      ].join(' ');

      const contentCheck = checkContent(textToCheck);

      if (!contentCheck.clean) {
        console.log(
          `[CatalogModeration] Пропускаем ${giveaway.id}: найдены стоп-слова: ${contentCheck.flaggedWords.join(', ')}`
        );
        continue;
      }

      // Все проверки пройдены — одобряем в каталог
      await prisma.giveaway.update({
        where: { id: giveaway.id },
        data: {
          catalogApproved: true,
          catalogApprovedAt: new Date(),
        },
      });

      console.log(
        `[CatalogModeration] Одобрен в каталог: ${giveaway.title} (${giveaway.id}), участников: ${giveaway.totalParticipants}`
      );

      // 17.2 Уведомляем администратора об одобрении
      notifyCatalogApproved({
        giveawayTitle: giveaway.title || 'Без названия',
        giveawayId: giveaway.id,
        participantCount: giveaway.totalParticipants,
      });
    }
  } catch (error) {
    console.error('[CatalogModeration] Ошибка модерации каталога:', error);
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
