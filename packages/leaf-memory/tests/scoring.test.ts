import { describe, it, expect } from 'vitest';
import {
  difficultyForPairs,
  maxTimeSec,
  isWithinTimeBudget,
  score,
  SECONDS_PER_DIFFICULTY,
} from '../src/scoring';

describe('difficultyForPairs', () => {
  it('returns pairs/2', () => {
    expect(difficultyForPairs(2)).toBe(1);
    expect(difficultyForPairs(6)).toBe(3);
    expect(difficultyForPairs(8)).toBe(4);
  });
});

describe('maxTimeSec', () => {
  it('scales with difficulty', () => {
    expect(maxTimeSec(2)).toBe(30);
    expect(maxTimeSec(6)).toBe(90);
    expect(maxTimeSec(8)).toBe(120);
  });

  it('uses the 30s-per-difficulty constant', () => {
    expect(SECONDS_PER_DIFFICULTY).toBe(30);
  });
});

describe('isWithinTimeBudget', () => {
  it('true while below budget', () => {
    expect(isWithinTimeBudget(2, 0)).toBe(true);
    expect(isWithinTimeBudget(2, 29.9)).toBe(true);
    expect(isWithinTimeBudget(6, 89.9)).toBe(true);
  });

  it('false at or past budget', () => {
    expect(isWithinTimeBudget(2, 30)).toBe(false);
    expect(isWithinTimeBudget(2, 30.1)).toBe(false);
    expect(isWithinTimeBudget(6, 90)).toBe(false);
  });
});

describe('score', () => {
  it('2×2 instant completion → 30', () => {
    expect(score(2, 0)).toBe(30);
  });

  it('2×2 at the buzzer → 0', () => {
    expect(score(2, 30)).toBe(0);
  });

  it('3×4 instant completion → 270', () => {
    expect(score(6, 0)).toBe(270);
  });

  it('3×4 mid-game (45s elapsed) → 135', () => {
    expect(score(6, 45)).toBe(135);
  });

  it('3×4 at the buzzer → 0', () => {
    expect(score(6, 90)).toBe(0);
  });

  it('4×4 instant completion → 480', () => {
    expect(score(8, 0)).toBe(480);
  });

  it('formula = difficulty × (maxTime − elapsed)', () => {
    const pairs = 6;
    const elapsed = 12.5;
    const d = difficultyForPairs(pairs);
    const max = maxTimeSec(pairs);
    expect(score(pairs, elapsed)).toBeCloseTo(d * (max - elapsed));
  });
});
