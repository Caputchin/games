import { describe, it, expect } from 'vitest';
import { makeRng } from '../src/rng.js';
import { launchBounds } from '../src/constants.js';
import { Spawner } from '../src/spawner.js';

const bounds = launchBounds(1400);

describe('Spawner', () => {
  it('emits spawns over time and never exceeds maxConcurrent', () => {
    const sp = new Spawner(makeRng(7), bounds, { spawnRate: 2, hazardChance: 0.2, maxConcurrent: 5 });
    let totalSpawned = 0;
    for (let i = 0; i < 600; i++) {
      const { spawned } = sp.update(1 / 60);
      totalSpawned += spawned.length;
      expect(sp.live.length).toBeLessThanOrEqual(5);
    }
    expect(totalSpawned).toBeGreaterThan(0);
  });

  it('reports targets that exit off the bottom (a missed good fruit)', () => {
    const sp = new Spawner(makeRng(42), bounds, { spawnRate: 1.5, hazardChance: 0, maxConcurrent: 6 });
    let escapedGood = 0;
    // ~8 simulated seconds with no slicing: launched fruit must arc and fall.
    for (let i = 0; i < 8 * 60; i++) {
      const { escaped } = sp.update(1 / 60);
      escapedGood += escaped.filter((t) => t.kind === 'good').length;
    }
    expect(escapedGood).toBeGreaterThan(0);
  });

  it('drops a target marked sliced without reporting it as escaped', () => {
    const sp = new Spawner(makeRng(3), bounds, { spawnRate: 3, hazardChance: 0, maxConcurrent: 6 });
    // advance until at least one is live
    while (sp.live.length === 0) sp.update(1 / 60);
    const victim = sp.live[0]!;
    victim.sliced = true;
    const { escaped } = sp.update(1 / 60);
    expect(escaped.some((t) => t.id === victim.id)).toBe(false);
    expect(sp.live.some((t) => t.id === victim.id)).toBe(false);
  });

  it('reset clears all state', () => {
    const sp = new Spawner(makeRng(9), bounds, { spawnRate: 3, hazardChance: 0.2, maxConcurrent: 6 });
    for (let i = 0; i < 120; i++) sp.update(1 / 60);
    sp.reset();
    expect(sp.live.length).toBe(0);
  });
});
