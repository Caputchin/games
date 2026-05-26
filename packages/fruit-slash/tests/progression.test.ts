import { describe, it, expect } from 'vitest';
import { difficultyAt } from '../src/sim/progression.js';

const base = { spawnRate: 0.9, hazardChance: 0.18 };

describe('difficultyAt', () => {
  it('equals the base at t=0', () => {
    const d = difficultyAt(0, base);
    expect(d.spawnRate).toBeCloseTo(base.spawnRate);
    expect(d.hazardChance).toBeCloseTo(base.hazardChance);
  });

  it('ramps spawn rate and bomb chance monotonically with time', () => {
    let prevSpawn = -1;
    let prevHazard = -1;
    for (let t = 0; t <= 180; t += 10) {
      const d = difficultyAt(t, base);
      expect(d.spawnRate).toBeGreaterThanOrEqual(prevSpawn);
      expect(d.hazardChance).toBeGreaterThanOrEqual(prevHazard);
      prevSpawn = d.spawnRate;
      prevHazard = d.hazardChance;
    }
  });

  it('caps difficulty so it never becomes unfair', () => {
    const late = difficultyAt(100000, base);
    // spawn rate approaches base * (1 + growth); stays bounded
    expect(late.spawnRate).toBeLessThan(base.spawnRate * 3);
    expect(late.spawnRate).toBeGreaterThan(base.spawnRate * 2);
    // bomb chance hard-capped
    expect(late.hazardChance).toBeLessThanOrEqual(0.45 + 1e-9);
  });

  it('respects the bomb-chance cap even from a high base', () => {
    const d = difficultyAt(100000, { spawnRate: 1, hazardChance: 0.4 });
    expect(d.hazardChance).toBeLessThanOrEqual(0.45 + 1e-9);
  });

  it('treats negative elapsed as zero (no underflow)', () => {
    const d = difficultyAt(-5, base);
    expect(d.spawnRate).toBeCloseTo(base.spawnRate);
  });
});
