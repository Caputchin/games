import { describe, it, expect } from 'vitest';
import { lineScore } from '../src/sim/scoring.js';

describe('lineScore', () => {
  it('scores 0 for no clear and scales by clear size', () => {
    expect(lineScore(0)).toBe(0);
    expect(lineScore(1)).toBe(100);
    expect(lineScore(2)).toBe(300);
    expect(lineScore(3)).toBe(500);
    expect(lineScore(4)).toBe(800);
  });

  it('rewards multi-line clears disproportionately', () => {
    expect(lineScore(2)).toBeGreaterThan(lineScore(1) * 2);
  });

  it('clamps out-of-range clear counts', () => {
    expect(lineScore(9)).toBe(800);
    expect(lineScore(-1)).toBe(0);
  });
});
