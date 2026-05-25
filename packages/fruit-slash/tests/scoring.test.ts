import { describe, it, expect } from 'vitest';
import { evaluate, onGoodSlice, onLifeLost, type RoundState } from '../src/scoring.js';

const base: RoundState = { sliced: 0, lives: 3, passScore: 3 };

describe('scoring', () => {
  it('onGoodSlice increments and fires pass exactly at the threshold', () => {
    let s = base;
    let r = onGoodSlice(s); // 1
    expect(r.event).toBe('none');
    s = r.state;
    r = onGoodSlice(s); // 2
    expect(r.event).toBe('none');
    s = r.state;
    r = onGoodSlice(s); // 3 == passScore
    expect(r.event).toBe('pass');
    expect(r.state.sliced).toBe(3);
  });

  it('stays "pass" after the threshold (orchestrator latch enforces single fire)', () => {
    expect(evaluate({ sliced: 5, lives: 3, passScore: 3 })).toBe('pass');
  });

  it('onLifeLost decrements and fires gameover at zero', () => {
    let s: RoundState = { sliced: 0, lives: 2, passScore: 8 };
    let r = onLifeLost(s);
    expect(r.event).toBe('none');
    expect(r.state.lives).toBe(1);
    s = r.state;
    r = onLifeLost(s);
    expect(r.event).toBe('gameover');
    expect(r.state.lives).toBe(0);
  });

  it('gameover takes precedence over pass when out of lives', () => {
    expect(evaluate({ sliced: 99, lives: 0, passScore: 8 })).toBe('gameover');
  });

  it('lives floor at zero', () => {
    expect(onLifeLost({ sliced: 0, lives: 0, passScore: 8 }).state.lives).toBe(0);
  });
});
