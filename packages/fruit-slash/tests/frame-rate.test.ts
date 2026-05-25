import { describe, it, expect } from 'vitest';
import { integrate, type LaunchState } from '../src/launch.js';

// THE REGRESSION GUARD. A prior attempt coupled physics to frame rate and ran
// ~4x too fast on a 240Hz display. This asserts the trajectory is identical
// regardless of step size: stepping the same launch over the same real-time
// horizon at 60Hz vs 240Hz vs one big step must converge. If anyone reintroduces
// per-frame coupling (e.g. ignoring dt, or `frames = dt / MS_PER_FRAME`), this
// goes red.

const GRAVITY = 1400;

function stepN(start: LaunchState, gravity: number, totalT: number, steps: number): LaunchState {
  const dt = totalT / steps;
  let s = start;
  for (let i = 0; i < steps; i++) s = integrate(s, gravity, dt);
  return s;
}

describe('frame-rate independence of the integrator', () => {
  const start: LaunchState = { x: 100, y: 640, vx: 120, vy: -900 };
  const T = 1.2; // seconds of real time

  it('produces the same trajectory at 60Hz, 144Hz, 240Hz, and one big step', () => {
    const at1 = stepN(start, GRAVITY, T, 1);
    const at60 = stepN(start, GRAVITY, T, 72); // ~60fps over 1.2s
    const at144 = stepN(start, GRAVITY, T, 173);
    const at240 = stepN(start, GRAVITY, T, 288);

    for (const r of [at60, at144, at240]) {
      expect(r.x).toBeCloseTo(at1.x, 6);
      expect(r.y).toBeCloseTo(at1.y, 6);
      expect(r.vx).toBeCloseTo(at1.vx, 6);
      expect(r.vy).toBeCloseTo(at1.vy, 6);
    }
  });

  it('240Hz does NOT run faster than 60Hz (the exact bug we are guarding)', () => {
    // Same real time -> same displacement. A frame-coupled bug would make the
    // 240-step result move ~4x as far.
    const at60 = stepN(start, GRAVITY, 1, 60);
    const at240 = stepN(start, GRAVITY, 1, 240);
    expect(Math.abs(at240.y - at60.y)).toBeLessThan(1e-6);
  });

  it('a single clamped step does not teleport (bounded displacement)', () => {
    // game.ts clamps dt to MAX_DT (1/30s). One clamped step from a fast fruit
    // must move only a small, bounded amount, never across the whole world.
    const MAX_DT = 1 / 30;
    const fast: LaunchState = { x: 400, y: 300, vx: 0, vy: -1200 };
    const after = integrate(fast, GRAVITY, MAX_DT);
    expect(Math.abs(after.y - fast.y)).toBeLessThan(60); // << world height 600
  });
});
