// Pure projectile launch + integration. Real physics, fully contained on screen
// by construction: a fruit spawns just below the bottom border, is thrown upward,
// gravity is the only vertical force, horizontal velocity is constant. The launch
// is derived from an on-screen entry-x and exit-x plus an apex capped below the
// top border, so the parabola enters and exits ONLY through the bottom border.
//
// `integrate` uses the EXACT closed-form update for constant acceleration
// (y += vy*dt + 0.5*g*dt^2), which composes exactly across any step size - the
// trajectory is identical whatever the timestep.
//
// Determinism: the one transcendental, the launch's `sqrt`, goes
// through `capMath.sqrt` (IEEE-754 correctly-rounded, so bit-identical across
// runtimes). Randomness arrives as an injected `next: () => number` drawn from
// `rng`, never `Math.random`.

import { rng, capMath } from '@caputchin/determinism';

export interface LaunchState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface LaunchBounds {
  width: number;
  height: number;
  gravity: number;
  radius: number;
  /** Min gap kept between the apex (top edge of the fruit) and the top border. */
  apexMarginTop: number;
  /** Min distance the fruit center keeps from the left/right borders. */
  sideMargin: number;
}

/** Advance a projectile by `dt` seconds. Exact for constant acceleration:
 *  composing N steps of dt/N equals one step of dt to floating precision. */
export function integrate(s: LaunchState, gravity: number, dt: number): LaunchState {
  return {
    x: s.x + s.vx * dt,
    y: s.y + s.vy * dt + 0.5 * gravity * dt * dt,
    vx: s.vx,
    vy: s.vy + gravity * dt,
  };
}

/** Peak (minimum-y, highest) center position of the arc. */
export function apexY(s: LaunchState, gravity: number): number {
  return s.y - (s.vy * s.vy) / (2 * gravity);
}

/** Total flight time (seconds) from launch back down to the launch Y level. */
export function flightTime(s: LaunchState, gravity: number): number {
  return (-2 * s.vy) / gravity;
}

/** Horizontal extent over the whole flight (x is linear, so it is the endpoints). */
export function horizontalSpan(s: LaunchState, gravity: number): { minX: number; maxX: number } {
  const exitX = s.x + s.vx * flightTime(s, gravity);
  return { minX: Math.min(s.x, exitX), maxX: Math.max(s.x, exitX) };
}

/** Derive a launch guaranteed on-screen: enters from the bottom, apex stays
 *  >= apexMarginTop below the top, horizontal stays within the side margins.
 *  Deterministic given `next` (a `rng` draw function). */
export function deriveLaunch(next: () => number, b: LaunchBounds): LaunchState {
  const y0 = b.height + b.radius; // spawn just below the bottom border
  // Apex center range. Top clearance scales down on short fields so the range
  // stays valid (apexMin < apexMax).
  const topClear = Math.min(b.apexMarginTop, b.height * 0.25);
  const apexMin = topClear + b.radius;
  const apexMax = Math.max(apexMin + 10, b.height * 0.62);
  const apexCenter = apexMin + next() * (apexMax - apexMin);
  const rise = y0 - apexCenter; // > 0
  const vy = -capMath.sqrt(2 * b.gravity * rise); // upward (negative)
  const t = (-2 * vy) / b.gravity; // flight time back to y0

  const minX = b.sideMargin;
  const maxX = b.width - b.sideMargin;
  const entryX = minX + next() * (maxX - minX);
  const exitX = minX + next() * (maxX - minX);
  const vx = (exitX - entryX) / t; // constant horizontal velocity

  return { x: entryX, y: y0, vx, vy };
}

/** True once the fruit has fallen fully below the bottom border (exited). */
export function isOffBottom(s: LaunchState, height: number, radius: number): boolean {
  return s.y - radius > height && s.vy > 0;
}
