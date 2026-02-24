import { describe, it, expect } from 'vitest';
import {
  buildCumulativePool,
  binarySearchIndex,
  weightedRandomSelect,
  selectWinners,
  generateDrawSeed,
  type ParticipantEntry,
} from '../utils/winners.js';

// =============================================================================
// Helpers
// =============================================================================

function makeParticipant(overrides: Partial<ParticipantEntry> = {}): ParticipantEntry {
  return {
    userId: `user_${Math.random().toString(36).slice(2)}`,
    id: `part_${Math.random().toString(36).slice(2)}`,
    ticketsBase: 1,
    ticketsExtra: 0,
    ...overrides,
  };
}

// =============================================================================
// buildCumulativePool
// =============================================================================

describe('buildCumulativePool', () => {
  it('returns empty array for empty input', () => {
    expect(buildCumulativePool([])).toEqual([]);
  });

  it('assigns minimum weight of 1 even if tickets sum to 0', () => {
    const p = makeParticipant({ ticketsBase: 0, ticketsExtra: 0 });
    const pool = buildCumulativePool([p]);
    expect(pool[0].ticketsUsed).toBe(1);
    expect(pool[0].cumulativeWeight).toBe(1);
  });

  it('builds correct cumulative weights for single participant', () => {
    const p = makeParticipant({ ticketsBase: 5, ticketsExtra: 3 });
    const pool = buildCumulativePool([p]);
    expect(pool).toHaveLength(1);
    expect(pool[0].ticketsUsed).toBe(8);
    expect(pool[0].cumulativeWeight).toBe(8);
  });

  it('builds correct cumulative weights for multiple participants', () => {
    const participants: ParticipantEntry[] = [
      makeParticipant({ ticketsBase: 1, ticketsExtra: 0 }), // weight 1, cum 1
      makeParticipant({ ticketsBase: 3, ticketsExtra: 0 }), // weight 3, cum 4
      makeParticipant({ ticketsBase: 6, ticketsExtra: 0 }), // weight 6, cum 10
    ];
    const pool = buildCumulativePool(participants);
    expect(pool[0].cumulativeWeight).toBe(1);
    expect(pool[1].cumulativeWeight).toBe(4);
    expect(pool[2].cumulativeWeight).toBe(10);
  });

  it('correctly maps userId and participationId', () => {
    const p = makeParticipant({ userId: 'u1', id: 'p1' });
    const pool = buildCumulativePool([p]);
    expect(pool[0].userId).toBe('u1');
    expect(pool[0].participationId).toBe('p1');
  });

  it('handles ticketsExtra correctly', () => {
    const p = makeParticipant({ ticketsBase: 2, ticketsExtra: 5 });
    const pool = buildCumulativePool([p]);
    expect(pool[0].ticketsUsed).toBe(7);
  });
});

// =============================================================================
// binarySearchIndex
// =============================================================================

describe('binarySearchIndex', () => {
  it('finds first index with cumulativeWeight >= target', () => {
    const pool = [
      { cumulativeWeight: 1 } as any,
      { cumulativeWeight: 4 } as any,
      { cumulativeWeight: 10 } as any,
    ];
    expect(binarySearchIndex(pool, 1)).toBe(0);
    expect(binarySearchIndex(pool, 2)).toBe(1);
    expect(binarySearchIndex(pool, 4)).toBe(1);
    expect(binarySearchIndex(pool, 5)).toBe(2);
    expect(binarySearchIndex(pool, 10)).toBe(2);
  });

  it('handles single-element pool', () => {
    const pool = [{ cumulativeWeight: 5 } as any];
    expect(binarySearchIndex(pool, 1)).toBe(0);
    expect(binarySearchIndex(pool, 5)).toBe(0);
  });
});

// =============================================================================
// weightedRandomSelect
// =============================================================================

describe('weightedRandomSelect', () => {
  it('throws for empty pool', () => {
    expect(() => weightedRandomSelect([])).toThrow('Empty weighted pool');
  });

  it('always selects the only participant in a single-entry pool', () => {
    const p = makeParticipant({ userId: 'only_one', ticketsBase: 10 });
    const pool = buildCumulativePool([p]);
    for (let i = 0; i < 100; i++) {
      expect(weightedRandomSelect(pool).userId).toBe('only_one');
    }
  });

  it('returns an entry that exists in the pool', () => {
    const participants = Array.from({ length: 5 }, () => makeParticipant({ ticketsBase: 2 }));
    const userIds = new Set(participants.map(p => p.userId));
    const pool = buildCumulativePool(participants);

    for (let i = 0; i < 50; i++) {
      const selected = weightedRandomSelect(pool);
      expect(userIds.has(selected.userId)).toBe(true);
    }
  });

  it('favours participant with more tickets (statistical test)', () => {
    const heavy = makeParticipant({ userId: 'heavy', ticketsBase: 90 });
    const light = makeParticipant({ userId: 'light', ticketsBase: 10 });
    const pool = buildCumulativePool([heavy, light]);

    const counts: Record<string, number> = { heavy: 0, light: 0 };
    const TRIALS = 1000;
    for (let i = 0; i < TRIALS; i++) {
      counts[weightedRandomSelect(pool).userId]++;
    }

    // heavy должен выиграть примерно 90% времени (±5%)
    expect(counts.heavy / TRIALS).toBeGreaterThan(0.8);
    expect(counts.heavy / TRIALS).toBeLessThan(1.0);
  });

  it('equal tickets → roughly equal distribution (statistical test)', () => {
    const participants = Array.from({ length: 4 }, (_, i) =>
      makeParticipant({ userId: `user_${i}`, ticketsBase: 1 })
    );
    const pool = buildCumulativePool(participants);
    const counts: Record<string, number> = {};
    participants.forEach(p => (counts[p.userId] = 0));

    const TRIALS = 4000;
    for (let i = 0; i < TRIALS; i++) {
      counts[weightedRandomSelect(pool).userId]++;
    }

    // Каждый должен выиграть примерно 25% ± 5%
    for (const userId of participants.map(p => p.userId)) {
      const ratio = counts[userId] / TRIALS;
      expect(ratio).toBeGreaterThan(0.2);
      expect(ratio).toBeLessThan(0.35);
    }
  });
});

// =============================================================================
// selectWinners
// =============================================================================

describe('selectWinners', () => {
  it('returns empty arrays for empty participants list', () => {
    const result = selectWinners([], 1, 0);
    expect(result.main).toHaveLength(0);
    expect(result.reserve).toHaveLength(0);
  });

  it('selects correct number of winners', () => {
    const participants = Array.from({ length: 10 }, () => makeParticipant());
    const result = selectWinners(participants, 3, 2);
    expect(result.main).toHaveLength(3);
    expect(result.reserve).toHaveLength(2);
  });

  it('all selected winners are unique (no duplicates)', () => {
    const participants = Array.from({ length: 20 }, () => makeParticipant());
    const result = selectWinners(participants, 5, 3);
    const allIds = [
      ...result.main.map(w => w.userId),
      ...result.reserve.map(w => w.userId),
    ];
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });

  it('assigns places correctly (1-based)', () => {
    const participants = Array.from({ length: 5 }, () => makeParticipant());
    const result = selectWinners(participants, 3);
    expect(result.main.map(w => w.place)).toEqual([1, 2, 3]);
  });

  it('caps winners at number of participants', () => {
    const participants = Array.from({ length: 3 }, () => makeParticipant());
    const result = selectWinners(participants, 10, 0);
    expect(result.main.length).toBeLessThanOrEqual(3);
  });

  it('selects from participants with correct userId', () => {
    const participants = Array.from({ length: 5 }, (_, i) =>
      makeParticipant({ userId: `user_${i}` })
    );
    const validIds = new Set(participants.map(p => p.userId));
    const result = selectWinners(participants, 2, 1);
    for (const w of [...result.main, ...result.reserve]) {
      expect(validIds.has(w.userId)).toBe(true);
    }
  });

  it('works with a single participant (1 winner)', () => {
    const p = makeParticipant({ userId: 'solo' });
    const result = selectWinners([p], 1, 0);
    expect(result.main).toHaveLength(1);
    expect(result.main[0].userId).toBe('solo');
    expect(result.reserve).toHaveLength(0);
  });

  it('reserve is empty when winnersCount >= participants count', () => {
    const participants = Array.from({ length: 3 }, () => makeParticipant());
    const result = selectWinners(participants, 3, 2);
    expect(result.reserve).toHaveLength(0); // нет кому быть резервным
  });
});

// =============================================================================
// generateDrawSeed
// =============================================================================

describe('generateDrawSeed', () => {
  const giveawayId = 'giveaway_123';
  const endAt = new Date('2026-03-01T12:00:00.000Z');
  const participants = [
    { userId: 'u1', ticketsBase: 2, ticketsExtra: 1 },
    { userId: 'u2', ticketsBase: 1, ticketsExtra: 0 },
    { userId: 'u3', ticketsBase: 5, ticketsExtra: 2 },
  ];

  it('returns a 64-character hex string (SHA256)', () => {
    const seed = generateDrawSeed(giveawayId, endAt, participants);
    expect(seed).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — same inputs produce same seed', () => {
    const s1 = generateDrawSeed(giveawayId, endAt, participants);
    const s2 = generateDrawSeed(giveawayId, endAt, participants);
    expect(s1).toBe(s2);
  });

  it('is sorted by userId — order of participants does not matter', () => {
    const shuffled = [...participants].reverse();
    const s1 = generateDrawSeed(giveawayId, endAt, participants);
    const s2 = generateDrawSeed(giveawayId, endAt, shuffled);
    expect(s1).toBe(s2);
  });

  it('changes when giveawayId changes', () => {
    const s1 = generateDrawSeed(giveawayId, endAt, participants);
    const s2 = generateDrawSeed('other_id', endAt, participants);
    expect(s1).not.toBe(s2);
  });

  it('changes when endAt changes', () => {
    const s1 = generateDrawSeed(giveawayId, endAt, participants);
    const s2 = generateDrawSeed(giveawayId, new Date('2026-04-01T00:00:00.000Z'), participants);
    expect(s1).not.toBe(s2);
  });

  it('handles null endAt without crashing', () => {
    const seed = generateDrawSeed(giveawayId, null, participants);
    expect(seed).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when participant list changes', () => {
    const s1 = generateDrawSeed(giveawayId, endAt, participants);
    const different = [...participants, { userId: 'u4', ticketsBase: 1, ticketsExtra: 0 }];
    const s2 = generateDrawSeed(giveawayId, endAt, different);
    expect(s1).not.toBe(s2);
  });

  it('changes when ticket count changes', () => {
    const s1 = generateDrawSeed(giveawayId, endAt, participants);
    const modified = participants.map((p, i) =>
      i === 0 ? { ...p, ticketsExtra: p.ticketsExtra + 1 } : p
    );
    const s2 = generateDrawSeed(giveawayId, endAt, modified);
    expect(s1).not.toBe(s2);
  });

  it('handles empty participants', () => {
    const seed = generateDrawSeed(giveawayId, endAt, []);
    expect(seed).toMatch(/^[0-9a-f]{64}$/);
  });
});
