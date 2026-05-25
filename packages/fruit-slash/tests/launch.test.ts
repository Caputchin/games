import { describe, it, expect } from 'vitest';
import { makeRng } from '../src/rng.js';
import { launchBounds } from '../src/constants.js';
import {
  deriveLaunch,
  apexY,
  horizontalSpan,
  integrate,
  isOffBottom,
  type LaunchState,
} from '../src/launch.js';

// The containment invariant: a derived launch must enter and exit ONLY through
// the bottom border, never crossing a side or the top. Proven analytically by
// deriveLaunch; asserted here over thousands of seeded launches.
describe('deriveLaunch containment invariant', () => {
  const b = launchBounds(1400);

  it('every launch stays on-screen (apex below top, horizontal within sides, enters from bottom)', () => {
    const rng = makeRng(12345);
    for (let i = 0; i < 10000; i++) {
      const s = deriveLaunch(rng, b);
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
    const rng = makeRng(999);
    const s0 = deriveLaunch(rng, b);
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
