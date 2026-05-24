import { describe, it, expect } from 'vitest';
import { toScore, evaluatePass } from '../src/scoring.js';
import { SCORE_COEFFICIENT } from '../src/constants.js';

describe('toScore', () => {
  it('scales distance by the score coefficient and floors', () => {
    expect(toScore(0)).toBe(0);
    expect(toScore(1000)).toBe(Math.floor(1000 * SCORE_COEFFICIENT));
    expect(toScore(40)).toBe(1); // 40 * 0.025 = 1
    expect(toScore(39)).toBe(0); // 0.975 floors to 0
  });
});

describe('evaluatePass', () => {
  it('does not pass below the threshold', () => {
    const d = evaluatePass(50, 100, -1);
    expect(d.pass).toBe(false);
    expect(d.bestPassed).toBe(-1);
  });

  it('passes the first run that clears the threshold', () => {
    const d = evaluatePass(120, 100, -1);
    expect(d.pass).toBe(true);
    expect(d.score).toBe(120);
    expect(d.bestPassed).toBe(120);
  });

  it('passes again only on a new best', () => {
    const same = evaluatePass(120, 100, 120);
    expect(same.pass).toBe(false);
    expect(same.bestPassed).toBe(120);

    const better = evaluatePass(200, 100, 120);
    expect(better.pass).toBe(true);
    expect(better.bestPassed).toBe(200);
  });

  it('does not pass a worse run even above threshold', () => {
    const d = evaluatePass(150, 100, 200);
    expect(d.pass).toBe(false);
    expect(d.bestPassed).toBe(200);
  });
});
