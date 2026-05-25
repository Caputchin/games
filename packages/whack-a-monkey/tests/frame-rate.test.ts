// Permanent guard against per-frame coupling. Every simulation step is scaled
// by real dt seconds, so the mole's emergence + uptime play at the same
// real-world speed on a 60Hz or a 240Hz display. A regression that ties motion
// to frames (the classic bug) would make 240Hz run ~4x faster and fail here.

import { describe, it, expect } from 'vitest';
import { spawnMole, stepMole } from '../src/mole.js';
import { MAX_DT } from '../src/constants.js';

function simulate(dt: number, totalTime: number): ReturnType<typeof spawnMole> {
  let m = spawnMole(0, 0, 'monkey', null, 5); // long uptime so it stays up
  let t = 0;
  while (t < totalTime - 1e-9) {
    const step = Math.min(dt, totalTime - t);
    m = stepMole(m, step);
    t += step;
  }
  return m;
}

describe('frame-rate independence', () => {
  it('the emergence spring reaches the same place in the same real time, any refresh', () => {
    const a = simulate(1 / 60, 0.5);
    const b = simulate(1 / 240, 0.5);
    const c = simulate(MAX_DT, 0.5);
    expect(Math.abs(a.scaleY - b.scaleY)).toBeLessThan(0.03);
    expect(Math.abs(a.scaleY - c.scaleY)).toBeLessThan(0.06);
    for (const m of [a, b, c]) expect(m.scaleY).toBeGreaterThan(0.9); // converged, not 4x ahead
  });

  it('age tracks real time exactly regardless of step size', () => {
    expect(simulate(1 / 60, 0.5).age).toBeCloseTo(0.5, 6);
    expect(simulate(1 / 240, 0.5).age).toBeCloseTo(0.5, 6);
  });

  it('a monkey retracts by its uptime at any refresh', () => {
    const up = 0.3;
    for (const dt of [1 / 60, 1 / 240]) {
      let m = spawnMole(0, 0, 'monkey', null, up);
      let t = 0;
      let retracted = false;
      while (t < 0.5) {
        m = stepMole(m, dt);
        t += dt;
        if (m.phase !== 'up') { retracted = true; break; }
      }
      expect(retracted).toBe(true);
      expect(m.age).toBeGreaterThanOrEqual(up);
      expect(m.age).toBeLessThan(up + dt + 1e-6);
    }
  });
});
