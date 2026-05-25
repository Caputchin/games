import { describe, it, expect } from 'vitest';
import { buildLadder } from '../src/levels.js';
import { DECOY_CAP, LEVEL_COUNT, MIN_UPTIME_FLOOR_MS } from '../src/constants.js';

describe('buildLadder', () => {
  const ladder = buildLadder({ baseUptimeMs: 800, baseDecoyChance: 0.1, passHits: 10 });

  it('produces one entry per level', () => {
    expect(ladder).toHaveLength(LEVEL_COUNT);
  });

  it('ramps difficulty monotonically: faster spawns, briefer uptime, more decoys', () => {
    for (let n = 1; n < ladder.length; n++) {
      expect(ladder[n]!.spawnRate).toBeGreaterThan(ladder[n - 1]!.spawnRate);
      expect(ladder[n]!.uptimeMs).toBeLessThanOrEqual(ladder[n - 1]!.uptimeMs);
      expect(ladder[n]!.decoyChance).toBeGreaterThanOrEqual(ladder[n - 1]!.decoyChance);
    }
  });

  it('caps decoy chance and floors uptime', () => {
    const aggressive = buildLadder({ baseUptimeMs: 360, baseDecoyChance: 0.5, passHits: 9 });
    for (const lvl of aggressive) {
      expect(lvl.decoyChance).toBeLessThanOrEqual(DECOY_CAP);
      expect(lvl.uptimeMs).toBeGreaterThanOrEqual(MIN_UPTIME_FLOOR_MS);
    }
  });

  it('splits the pass goal across levels (sums to passHits, each at least 1)', () => {
    const sum = ladder.reduce((acc, l) => acc + l.goal, 0);
    expect(sum).toBe(10);
    for (const l of ladder) expect(l.goal).toBeGreaterThanOrEqual(1);
  });
});
