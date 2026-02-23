/**
 * Логика рандомайзера победителей
 * Адаптировано из winner-show-old
 */

import { formatParticipantName } from './helpers';

// ============================================================================
// Типы
// ============================================================================

export interface Participant {
  id: string;
  telegramUserId: string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  ticketsTotal: number;
}

export interface WinnerResult {
  place: number;
  participant: Participant;
}

export interface RandomizerCallbacks {
  onSlotChange: (name: string) => void;
  onCountdown: (seconds: number) => void;
  onRevealWinner: (place: number, winner: Participant) => void;
  onFinish: (winners: WinnerResult[]) => void;
  onPlaceChange: (place: number) => void;
}

export interface RandomizerControl {
  pause: () => void;
  resume: () => void;
  skip: () => void;
  isPaused: () => boolean;
}

// ============================================================================
// Утилиты
// ============================================================================

/**
 * Криптографически безопасный целочисленный random в [0, max) через Web Crypto API.
 * Использует rejection sampling для устранения bias (не допускает mod bias).
 */
function secureRandomInt(max: number): number {
  if (max <= 0) return 0;
  // Определяем маску для диапазона
  let mask = max - 1;
  mask |= mask >> 1;
  mask |= mask >> 2;
  mask |= mask >> 4;
  mask |= mask >> 8;
  mask |= mask >> 16;

  const buf = new Uint32Array(1);
  let result: number;
  // Rejection sampling: откидываем значения вне [0, max)
  do {
    crypto.getRandomValues(buf);
    result = buf[0] & mask;
  } while (result >= max);
  return result;
}

/**
 * Fisher-Yates shuffle — честное перемешивание массива
 * с криптографически безопасным ГСЧ (Web Crypto API).
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Задержка с возможностью прерывания
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Получить задержку перед показом места (время анимации слотов)
 */
function getSlotDuration(place: number): number {
  if (place >= 20) return 3000;   // 3 секунды
  if (place >= 9) return 5000;    // 5 секунд
  if (place >= 4) return 8000;    // 8 секунд
  return 10000;                    // 10 секунд (топ-3)
}

/**
 * Получить паузу после показа победителя
 */
function getPostRevealDelay(place: number): number {
  if (place >= 20) return 2000;   // 2 секунды
  if (place >= 9) return 3000;    // 3 секунды
  if (place >= 4) return 4000;    // 4 секунды
  return 3000;                     // 3 секунды (топ-3, после обратного отсчёта)
}

/**
 * Cumulative-sum entry for weighted random selection
 */
interface WeightedEntry {
  participant: Participant;
  weight: number;
  cumulativeWeight: number;
}

/**
 * Выбрать победителей с учётом веса (билетов).
 * Алгоритм: cumulative sum + binary search + crypto.getRandomValues().
 * Соответствует серверному алгоритму в giveaway-lifecycle.ts.
 */
function selectWeightedWinners(participants: Participant[], count: number): Participant[] {
  if (participants.length === 0 || count <= 0) return [];

  let remaining = participants.map(p => p);
  const winners: Participant[] = [];

  for (let i = 0; i < count && remaining.length > 0; i++) {
    // Строим cumulative pool
    const pool: WeightedEntry[] = [];
    let cumulative = 0;
    for (const p of remaining) {
      const weight = Math.max(p.ticketsTotal || 1, 1);
      cumulative += weight;
      pool.push({ participant: p, weight, cumulativeWeight: cumulative });
    }

    // crypto.getRandomValues() — [1, totalWeight]
    const totalWeight = cumulative;
    const buf = new Uint32Array(1);
    let target: number;
    // Rejection sampling to avoid mod bias
    const maxValid = Math.floor(0x100000000 / totalWeight) * totalWeight;
    do {
      crypto.getRandomValues(buf);
    } while (buf[0] >= maxValid);
    target = (buf[0] % totalWeight) + 1;

    // Binary search
    let lo = 0, hi = pool.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pool[mid].cumulativeWeight < target) lo = mid + 1;
      else hi = mid;
    }

    winners.push(pool[lo].participant);
    remaining = remaining.filter(p => p.id !== pool[lo].participant.id);
  }

  return winners;
}

// ============================================================================
// Основная функция рандомайзера
// ============================================================================

/**
 * Запускает рандомайзер
 * @returns Контроллер для паузы/продолжения/пропуска
 */
export function createRandomizer(
  participants: Participant[],
  winnersCount: number,
  callbacks: RandomizerCallbacks
): { start: () => Promise<WinnerResult[]>; control: RandomizerControl } {
  let isPaused = false;
  let skipRequested = false;
  let pausePromiseResolve: (() => void) | null = null;

  const control: RandomizerControl = {
    pause: () => {
      isPaused = true;
    },
    resume: () => {
      isPaused = false;
      if (pausePromiseResolve) {
        pausePromiseResolve();
        pausePromiseResolve = null;
      }
    },
    skip: () => {
      skipRequested = true;
      // Также резюмируем если была пауза
      if (pausePromiseResolve) {
        pausePromiseResolve();
        pausePromiseResolve = null;
      }
    },
    isPaused: () => isPaused,
  };

  // Ожидание если пауза
  const waitIfPaused = async (): Promise<void> => {
    if (isPaused) {
      await new Promise<void>(resolve => {
        pausePromiseResolve = resolve;
      });
    }
  };

  // Анимация "слот машины" — мелькание имён
  const runSlotAnimation = async (duration: number): Promise<void> => {
    const startTime = Date.now();
    let interval = 50; // начальная скорость (мс)
    
    while (Date.now() - startTime < duration) {
      // Проверяем пропуск
      if (skipRequested) {
        skipRequested = false;
        return;
      }
      
      // Ожидаем если пауза
      await waitIfPaused();
      
      // Случайный участник
      const randomParticipant = participants[Math.floor(Math.random() * participants.length)];
      const displayName = formatParticipantName(randomParticipant);
      callbacks.onSlotChange(displayName);
      
      // Замедление к концу анимации
      const progress = (Date.now() - startTime) / duration;
      interval = 50 + progress * 200; // от 50ms до 250ms
      
      await sleep(interval);
    }
  };

  // Обратный отсчёт для топ-3
  const runCountdown = async (): Promise<void> => {
    for (let i = 3; i >= 1; i--) {
      if (skipRequested) {
        skipRequested = false;
        return;
      }
      await waitIfPaused();
      callbacks.onCountdown(i);
      await sleep(1000);
    }
    callbacks.onCountdown(0);
  };

  const start = async (): Promise<WinnerResult[]> => {
    // 1. Выбираем победителей
    const winners = selectWeightedWinners(participants, winnersCount);
    const results: WinnerResult[] = [];
    
    // 2. Показываем от последнего к первому месту
    for (let place = winnersCount; place >= 1; place--) {
      await waitIfPaused();
      
      const winner = winners[place - 1];
      if (!winner) continue;
      
      // Уведомляем о текущем месте
      callbacks.onPlaceChange(place);
      
      // Анимация слотов
      const slotDuration = getSlotDuration(place);
      await runSlotAnimation(slotDuration);
      
      // Обратный отсчёт для топ-3
      if (place <= 3) {
        await runCountdown();
      }
      
      // Показываем победителя
      callbacks.onRevealWinner(place, winner);
      results.push({ place, participant: winner });
      
      // Пауза перед следующим
      if (place > 1) {
        const postDelay = getPostRevealDelay(place);
        await sleep(postDelay);
      }
    }
    
    // 3. Завершение
    callbacks.onFinish(results);
    return results;
  };

  return { start, control };
}
