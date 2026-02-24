/**
 * Winner selection utilities
 *
 * Чистые функции вынесены отдельно чтобы их можно было:
 * 1. Тестировать независимо от Prisma/Redis
 * 2. Переиспользовать в разных маршрутах
 */

import { createHash, randomInt } from 'node:crypto';

// =============================================================================
// Types
// =============================================================================

export interface ParticipantEntry {
  userId: string;
  id: string;
  ticketsBase: number;
  ticketsExtra: number;
}

export interface WeightedEntry {
  userId: string;
  participationId: string;
  ticketsUsed: number;
  cumulativeWeight: number;
}

// =============================================================================
// Core algorithm
// =============================================================================

/**
 * Строит массив с накопленными весами (cumulative sum)
 * для weighted random selection.
 *
 * Каждый участник получает вес = ticketsBase + ticketsExtra (минимум 1).
 * cumulativeWeight[i] = сумма весов участников [0..i].
 */
export function buildCumulativePool(participants: ParticipantEntry[]): WeightedEntry[] {
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
 * Binary search: возвращает индекс первого элемента у которого
 * cumulativeWeight >= target. O(log n).
 */
export function binarySearchIndex(pool: WeightedEntry[], target: number): number {
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
 * Сложность: O(log n) благодаря binary search.
 */
export function weightedRandomSelect(pool: WeightedEntry[]): WeightedEntry {
  if (pool.length === 0) throw new Error('Empty weighted pool');
  const totalWeight = pool[pool.length - 1].cumulativeWeight;
  // randomInt(min, max) → [min, max) (max exclusive)
  // Нам нужен [1, totalWeight] → randomInt(1, totalWeight + 1)
  const target = randomInt(1, totalWeight + 1);
  const idx = binarySearchIndex(pool, target);
  return pool[idx];
}

/**
 * Выбрать N победителей из пула без повторений.
 * Возвращает массив winners и reserve (резервных).
 *
 * @param participants - список участников
 * @param winnersCount - количество основных победителей
 * @param reserveCount - количество резервных (на случай отказа основных)
 */
export function selectWinners(
  participants: ParticipantEntry[],
  winnersCount: number,
  reserveCount: number = 0
): {
  main: Array<{ userId: string; participationId: string; place: number; ticketsUsed: number }>;
  reserve: Array<{ userId: string; participationId: string; place: number; ticketsUsed: number }>;
} {
  if (participants.length === 0) {
    return { main: [], reserve: [] };
  }

  const pool = buildCumulativePool(participants);
  const selectedUserIds = new Set<string>();

  const pickOne = (currentPool: WeightedEntry[]): WeightedEntry | null => {
    const available = currentPool.filter(e => !selectedUserIds.has(e.userId));
    if (available.length === 0) return null;
    // Rebuild cumulative pool from available entries only
    const rebuildPool = buildCumulativePool(
      participants.filter(p => !selectedUserIds.has(p.userId))
    );
    return weightedRandomSelect(rebuildPool);
  };

  // Выбираем основных победителей
  const actualWinners = Math.min(winnersCount, participants.length);
  const main: Array<{ userId: string; participationId: string; place: number; ticketsUsed: number }> = [];

  for (let place = 1; place <= actualWinners; place++) {
    const selected = pickOne(pool);
    if (!selected) break;
    selectedUserIds.add(selected.userId);
    main.push({
      userId: selected.userId,
      participationId: selected.participationId,
      place,
      ticketsUsed: selected.ticketsUsed,
    });
  }

  // Выбираем резервных победителей
  const reserve: Array<{ userId: string; participationId: string; place: number; ticketsUsed: number }> = [];
  const actualReserve = Math.min(reserveCount, participants.length - main.length);

  for (let place = 1; place <= actualReserve; place++) {
    const selected = pickOne(pool);
    if (!selected) break;
    selectedUserIds.add(selected.userId);
    reserve.push({
      userId: selected.userId,
      participationId: selected.participationId,
      place,
      ticketsUsed: selected.ticketsUsed,
    });
  }

  return { main, reserve };
}

/**
 * Генерация SHA256 audit seed для прозрачности выбора победителей.
 *
 * Формат: SHA256("giveawayId|endAt|[{userId,tickets},...sorted]")
 * Опубликуй seed + список участников — и любой сможет верифицировать результат.
 */
export function generateDrawSeed(
  giveawayId: string,
  endAt: Date | null,
  participants: Array<{ userId: string; ticketsBase: number; ticketsExtra: number }>
): string {
  const sorted = [...participants]
    .sort((a, b) => a.userId.localeCompare(b.userId))
    .map(p => ({ id: p.userId, tickets: p.ticketsBase + p.ticketsExtra }));
  const payload = `${giveawayId}|${endAt?.toISOString() ?? ''}|${JSON.stringify(sorted)}`;
  return createHash('sha256').update(payload).digest('hex');
}
