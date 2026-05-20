import { describe, it, expect } from 'vitest';
import { DIFFICULTY_LADDER, MAX_LEVEL, levelAt } from '../src/difficulty';

describe('DIFFICULTY_LADDER', () => {
  it('has 4 levels, ascending difficulty', () => {
    expect(DIFFICULTY_LADDER).toHaveLength(4);
    expect(MAX_LEVEL).toBe(4);
    const pairs = DIFFICULTY_LADDER.map((l) => l.pairs);
    expect(pairs).toEqual([2, 3, 4, 6]);
  });

  it('grid dimensions match cols × rows = pairs × 2', () => {
    for (const lvl of DIFFICULTY_LADDER) {
      expect(lvl.cols * lvl.rows).toBe(lvl.pairs * 2);
    }
  });

  it('peek + time budgets increase monotonically with level', () => {
    for (let i = 1; i < DIFFICULTY_LADDER.length; i++) {
      const prev = DIFFICULTY_LADDER[i - 1]!;
      const cur = DIFFICULTY_LADDER[i]!;
      expect(cur.peekMs).toBeGreaterThan(prev.peekMs);
      expect(cur.timeSec).toBeGreaterThan(prev.timeSec);
    }
  });

  it('top level stays within the 6-leaf catalog', () => {
    const top = DIFFICULTY_LADDER[DIFFICULTY_LADDER.length - 1];
    expect(top?.pairs).toBeLessThanOrEqual(6);
  });
});

describe('levelAt', () => {
  it('returns the level for a valid index', () => {
    expect(levelAt(0).level).toBe(1);
    expect(levelAt(3).level).toBe(4);
  });

  it('throws for out-of-range indices', () => {
    expect(() => levelAt(-1)).toThrow();
    expect(() => levelAt(4)).toThrow();
  });
});
