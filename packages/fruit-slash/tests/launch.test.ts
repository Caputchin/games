import { describe, it, expect } from 'vitest';
import { launchBounds } from '../src/sim/constants.js';
import {
  deriveLaunch,
  apexY,
  horizontalSpan,
  integrate,
  isOffBottom,
  type LaunchState,
} from '../src/sim/launch.js';

// A deterministic [0,1) generator for the test (mirrors what cap.rng provides at
// runtime). deriveLaunch takes a bare `next: () => number` so it stays agnostic
// to the rng implementation.
function makeNext(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The containment invariant: a derived launch must enter and exit ONLY through
// the bottom border, never crossing a side or the top. Proven analytically by
// deriveLaunch; asserted here over thousands of seeded launches.
describe('deriveLaunch containment invariant', () => {
  const b = launchBounds(1400);

  it('every launch stays on-screen (apex below top, horizontal within sides, enters from bottom)', () => {
    const next = makeNext(12345);
    for (let i = 0; i < 10000; i++) {
      const s = deriveLaunch(next, b);
      // Enters from below the bottom border, moving up.
      expect(s.y).toBeGreaterThanOrEqual(b.height);
      expect(s.vy).toBeLessThan(0);
      // Apex top edge stays at/below the top margin (never crosses the top).
      const apexTopEdge = apexY(s, b.gravity) - b.radius;
      expect(apexTopEdge).toBeGreaterThanOrEqual(b.apexMarginTop - 1e-6);
      // Horizontal center stays within the side margins for the whole flight.
      const span = horizontalSpan(s, b.gravity);
      expect(span.minX).toBeGreaterThanOrEqual(b.sideMargin - 1e-6);
      expect(span.maxX).toBeLessThanOrEqual(b.width - b.sideMargin + 1e-6);
      // Fruit edge never reaches a side border (sideMargin > radius).
      expect(span.minX - b.radius).toBeGreaterThan(0);
      expect(span.maxX + b.radius).toBeLessThan(b.width);
    }
  });

  it('a simulated flight rises into view then exits through the bottom', () => {
    const next = makeNext(999);
    const s0 = deriveLaunch(next, b);
    let s: LaunchState = s0;
    let minY = s.y;
    let exited = false;
    // Step at a fine dt for up to ~6 simulated seconds.
    for (let i = 0; i < 6 * 240; i++) {
      s = integrate(s, b.gravity, 1 / 240);
      minY = Math.min(minY, s.y);
      if (isOffBottom(s, b.height, b.radius)) {
        exited = true;
        break;
      }
    }
    expect(minY).toBeLessThan(b.height); // rose into view
    expect(exited).toBe(true); // and left through the bottom
  });
});
