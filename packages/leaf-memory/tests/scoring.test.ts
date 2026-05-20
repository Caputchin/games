import { describe, it, expect } from 'vitest';
import { difficultyForPairs, isWithinTimeBudget, score } from '../src/scoring';

describe('difficultyForPairs', () => {
  it('returns pairs/2', () => {
    expect(difficultyForPairs(2)).toBe(1);
    expect(difficultyForPairs(3)).toBe(1.5);
    expect(difficultyForPairs(4)).toBe(2);
    expect(difficultyForPairs(6)).toBe(3);
  });
});

describe('isWithinTimeBudget', () => {
  it('true while below budget', () => {
    expect(isWithinTimeBudget(10, 0)).toBe(true);
    expect(isWithinTimeBudget(10, 9.9)).toBe(true);
    expect(isWithinTimeBudget(60, 59.9)).toBe(true);
  });

  it('false at or past budget', () => {
    expect(isWithinTimeBudget(10, 10)).toBe(false);
    expect(isWithinTimeBudget(10, 10.1)).toBe(false);
    expect(isWithinTimeBudget(60, 60)).toBe(false);
  });
});

describe('score', () => {
  it('L1 (2 pairs, 10s) instant completion → 10', () => {
    expect(score(2, 10, 0)).toBe(10);
  });

  it('L1 at the buzzer → 0', () => {
    expect(score(2, 10, 10)).toBe(0);
  });

  it('L2 (3 pairs, 20s) instant completion → 30', () => {
    expect(score(3, 20, 0)).toBe(30);
  });

  it('L3 (4 pairs, 35s) instant completion → 70', () => {
    expect(score(4, 35, 0)).toBe(70);
  });

  it('L4 (6 pairs, 60s) instant completion → 180', () => {
    expect(score(6, 60, 0)).toBe(180);
  });

  it('L4 mid-game (30s elapsed) → 90', () => {
    expect(score(6, 60, 30)).toBe(90);
  });

  it('formula = difficulty × (maxTime − elapsed)', () => {
    const pairs = 4;
    const maxTime = 35;
    const elapsed = 12.5;
    const d = difficultyForPairs(pairs);
    expect(score(pairs, maxTime, elapsed)).toBeCloseTo(d * (maxTime - elapsed));
  });
});
