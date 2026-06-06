import { describe, it, expect } from 'vitest';
import { pickInterval, spawnOne } from '../src/sim/spawn.js';
import { launchBounds } from '../src/sim/constants.js';
import { GOOD, HAZARD } from '../src/sim/types.js';
import { apexY, horizontalSpan } from '../src/sim/launch.js';

const bounds = launchBounds(1400);

function makeNext(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('pickInterval', () => {
  it('stays within the jittered bounds and respects the floor', () => {
    const next = makeNext(7);
    for (let i = 0; i < 1000; i++) {
      const iv = pickInterval(next, 2);
      expect(iv).toBeGreaterThanOrEqual(0.15);
      // base = 1/2 = 0.5; jitter is +/- 40% -> [0.3, 0.7], floored at 0.15.
      expect(iv).toBeLessThanOrEqual(0.7 + 1e-9);
    }
  });

  it('is deterministic for the same next sequence', () => {
    expect(pickInterval(makeNext(42), 1.3)).toBe(pickInterval(makeNext(42), 1.3));
  });
});

describe('spawnOne', () => {
  it('produces a bit-identical target for the same draw sequence', () => {
    const a = spawnOne(makeNext(99), bounds, 0.2, 5, 0);
    const b = spawnOne(makeNext(99), bounds, 0.2, 5, 0);
    expect(a).toEqual(b);
  });

  it('honors hazardChance at the extremes', () => {
    expect(spawnOne(makeNext(1), bounds, 0, 0, 0).kind).toBe(GOOD); // never a bomb
    expect(spawnOne(makeNext(1), bounds, 1, 0, 0).kind).toBe(HAZARD); // always a bomb
  });

  it('launches on-screen (apex below the top, horizontal within the sides)', () => {
    const next = makeNext(3);
    for (let i = 0; i < 2000; i++) {
      const t = spawnOne(next, bounds, 0.18, i, i);
      const s = { x: t.x, y: t.y, vx: t.vx, vy: t.vy };
      expect(apexY(s, bounds.gravity) - bounds.radius).toBeGreaterThanOrEqual(bounds.apexMarginTop - 1e-6);
      const span = horizontalSpan(s, bounds.gravity);
      expect(span.minX).toBeGreaterThanOrEqual(bounds.sideMargin - 1e-6);
      expect(span.maxX).toBeLessThanOrEqual(bounds.width - bounds.sideMargin + 1e-6);
      expect(t.hue).toBeGreaterThanOrEqual(0);
      expect(t.hue).toBeLessThanOrEqual(2);
    }
  });
});
