import { describe, it, expect } from 'vitest';
import { Spawner, type SpawnConfig } from '../src/spawner.js';
import { makeRng } from '../src/rng.js';
import { HOLE_COUNT, MAX_CONCURRENT, MAX_CONCURRENT_DECOY } from '../src/constants.js';

const CFG: SpawnConfig = { spawnRate: 3, decoyChance: 0.3, uptimeMs: 800 };

function run(seed: number, steps: number, dt = 1 / 60): Spawner {
  const sp = new Spawner(makeRng(seed), HOLE_COUNT, CFG);
  for (let i = 0; i < steps; i++) sp.update(dt);
  return sp;
}

describe('Spawner caps', () => {
  it('never exceeds the up-mole caps for either kind', () => {
    const sp = new Spawner(makeRng(7), HOLE_COUNT, { spawnRate: 8, decoyChance: 0.4, uptimeMs: 1500 });
    for (let i = 0; i < 4000; i++) {
      sp.update(1 / 120);
      const up = sp.moles.filter((m) => m.phase === 'up');
      expect(up.filter((m) => m.kind === 'monkey').length).toBeLessThanOrEqual(MAX_CONCURRENT);
      expect(up.filter((m) => m.kind === 'decoy').length).toBeLessThanOrEqual(MAX_CONCURRENT_DECOY);
    }
  });

  it('never puts two moles in one hole', () => {
    const sp = new Spawner(makeRng(99), HOLE_COUNT, { spawnRate: 8, decoyChance: 0.4, uptimeMs: 1500 });
    for (let i = 0; i < 2000; i++) {
      sp.update(1 / 120);
      const holes = sp.moles.map((m) => m.holeIndex);
      expect(new Set(holes).size).toBe(holes.length);
    }
  });
});

describe('Spawner determinism', () => {
  it('produces identical mole streams for the same seed', () => {
    const a = run(42, 500);
    const b = run(42, 500);
    const idA = a.moles.map((m) => `${m.id}:${m.holeIndex}:${m.kind}`).sort();
    const idB = b.moles.map((m) => `${m.id}:${m.holeIndex}:${m.kind}`).sort();
    expect(idA).toEqual(idB);
  });
});

describe('Spawner tap', () => {
  it('returns the kind of the tapped mole and consumes it', () => {
    const sp = new Spawner(makeRng(5), HOLE_COUNT, { spawnRate: 3, decoyChance: 0, uptimeMs: 800 });
    let tapped = false;
    for (let i = 0; i < 600 && !tapped; i++) {
      sp.update(1 / 60);
      const up = sp.moles.find((m) => m.phase === 'up' && m.kind === 'monkey');
      if (up) {
        expect(sp.tap(up.holeIndex)).toBe('monkey');
        // the tapped mole is no longer tappable (it is retracting)
        expect(sp.tap(up.holeIndex)).toBeNull();
        tapped = true;
      }
    }
    expect(tapped).toBe(true);
  });
});

describe('Spawner reset + empty tap', () => {
  it('reset clears all live moles', () => {
    const sp = run(11, 300);
    sp.reset();
    expect(sp.moles).toHaveLength(0);
  });

  it('tap on an empty hole returns null', () => {
    const sp = new Spawner(makeRng(1), HOLE_COUNT, CFG);
    expect(sp.tap(0)).toBeNull();
  });
});
