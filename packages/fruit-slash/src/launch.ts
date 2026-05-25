// Pure projectile launch + integration. Real physics, fully contained on
// screen by construction: a fruit spawns just below the bottom border, is
// thrown upward, and gravity is the only vertical force. Horizontal velocity
// is constant (no air resistance). We derive the launch from an on-screen
// entry-x and exit-x plus an apex capped below the top border, so the parabola
// enters and exits ONLY through the bottom border, crossing no other edge.
//
// `integrate` uses the EXACT closed-form update for constant acceleration
// (y += vy*dt + 0.5*g*dt^2), which composes exactly across any step size.
// That is what makes the trajectory identical at 60Hz, 144Hz, or 240Hz, and
// is asserted to 1e-9 in tests/frame-rate.test.ts.

import type { Rng } from './rng.js';

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

/** Peak (minimum-y, i.e. highest) center position of the arc. With vy < 0 the
 *  rise is vy^2/(2g), so apex center y = launchY - vy^2/(2g). */
export function apexY(s: LaunchState, gravity: number): number {
  return s.y - (s.vy * s.vy) / (2 * gravity);
}

/** Total flight time (seconds) from launch back down to the launch Y level. */
export function flightTime(s: LaunchState, gravity: number): number {
  // y returns to y0 when vy*T + 0.5*g*T^2 = 0  ->  T = -2*vy/g (vy < 0).
  return (-2 * s.vy) / gravity;
}

/** Horizontal extent over the whole flight. x is linear (constant vx), so the
 *  span is just the two endpoints. */
export function horizontalSpan(s: LaunchState, gravity: number): { minX: number; maxX: number } {
  const exitX = s.x + s.vx * flightTime(s, gravity);
  return { minX: Math.min(s.x, exitX), maxX: Math.max(s.x, exitX) };
}

/** Derive a launch that is guaranteed on-screen: enters from the bottom,
 *  apex stays >= apexMarginTop below the top, horizontal stays within
 *  [sideMargin, width - sideMargin]. Deterministic given `rng`. */
export function deriveLaunch(rng: Rng, b: LaunchBounds): LaunchState {
  const y0 = b.height + b.radius; // spawn just below the bottom border
  // Apex center range: highest allowed keeps the top edge below apexMarginTop;
  // lowest still rises well into view.
  const apexMin = b.apexMarginTop + b.radius;
  const apexMax = b.height * 0.55;
  const apexCenter = apexMin + rng() * (apexMax - apexMin);
  const rise = y0 - apexCenter; // > 0
  const vy = -Math.sqrt(2 * b.gravity * rise); // upward (negative)
  const t = (-2 * vy) / b.gravity; // flight time back to y0

  const minX = b.sideMargin;
  const maxX = b.width - b.sideMargin;
  const entryX = minX + rng() * (maxX - minX);
  const exitX = minX + rng() * (maxX - minX);
  const vx = (exitX - entryX) / t; // constant horizontal velocity

  return { x: entryX, y: y0, vx, vy };
}

/** True once the fruit has fallen fully below the bottom border (exited). */
export function isOffBottom(s: LaunchState, height: number, radius: number): boolean {
  return s.y - radius > height && s.vy > 0;
}
