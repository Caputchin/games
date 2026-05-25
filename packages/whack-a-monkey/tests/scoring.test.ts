import { describe, it, expect } from 'vitest';
import { initRound, isPass, onGoodHit, onDecoyHit } from '../src/scoring.js';
import { BASE_SCORE, DECOY_PENALTY, TIMING_BONUS_MAX } from '../src/constants.js';

describe('initRound', () => {
  it('starts at zero with the given goal', () => {
    expect(initRound(10)).toEqual({ goodHits: 0, score: 0, passHits: 10 });
  });
});

describe('onGoodHit', () => {
  it('adds a hit and awards base + timing bonus (fresh = full bonus)', () => {
    const s = onGoodHit(initRound(5), 1);
    expect(s.goodHits).toBe(1);
    expect(s.score).toBe(BASE_SCORE + TIMING_BONUS_MAX);
  });
  it('awards only the base when stale, and clamps the timing fraction', () => {
    expect(onGoodHit(initRound(5), 0).score).toBe(BASE_SCORE);
    expect(onGoodHit(initRound(5), 2).score).toBe(BASE_SCORE + TIMING_BONUS_MAX);
    expect(onGoodHit(initRound(5), -1).score).toBe(BASE_SCORE);
  });
});

describe('onDecoyHit', () => {
  it('docks points, floored at zero', () => {
    const scored = onGoodHit(initRound(5), 1);
    expect(onDecoyHit(scored).score).toBe(Math.max(0, scored.score - DECOY_PENALTY));
    expect(onDecoyHit(initRound(5)).score).toBe(0);
  });
});

describe('isPass', () => {
  it('passes once the monkey goal is reached', () => {
    let s = initRound(2);
    s = onGoodHit(s, 1);
    expect(isPass(s)).toBe(false);
    s = onGoodHit(s, 1);
    expect(isPass(s)).toBe(true);
  });
});
