import { describe, it, expect } from 'vitest';
import { evaluate } from '../src/sim/scoring.js';

// The pass/lives gate the reducer reads. The +1 / -1 counter mutations live
// inline in engine.ts and are covered end-to-end by engine.test.ts (the
// live==replay play); this asserts the gate decision itself.
describe('evaluate', () => {
  it('is "none" below the pass threshold with lives left', () => {
    expect(evaluate({ sliced: 2, lives: 3, passScore: 3 })).toBe('none');
  });

  it('fires "pass" exactly at the threshold and stays "pass" beyond it', () => {
    expect(evaluate({ sliced: 3, lives: 3, passScore: 3 })).toBe('pass');
    expect(evaluate({ sliced: 5, lives: 3, passScore: 3 })).toBe('pass');
  });

  it('fires "gameover" once lives hit zero', () => {
    expect(evaluate({ sliced: 0, lives: 0, passScore: 8 })).toBe('gameover');
  });

  it('gameover takes precedence over pass when out of lives', () => {
    expect(evaluate({ sliced: 99, lives: 0, passScore: 8 })).toBe('gameover');
  });
});
