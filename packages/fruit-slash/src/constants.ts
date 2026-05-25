// Logical world + physics tuning. ALL physics are expressed PER SECOND, never
// per frame: the loop in game.ts advances the simulation by real elapsed time
// (dt seconds) every frame, so motion runs at identical real-world speed on a
// 60Hz or a 240Hz display. There is deliberately NO "per-frame" / "MS_PER_FRAME"
// constant anywhere in this game — that coupling is the bug we are designing
// out (see tests/frame-rate.test.ts, the permanent guard).

import type { LaunchBounds } from './launch.js';

/** Fixed logical world. The canvas backing store is sized to the container and
 *  the scene is scaled to fit; entities live in these units so physics never
 *  needs to know the pixel size. */
export const WORLD_WIDTH = 800;
export const WORLD_HEIGHT = 600;

/** Largest simulation step honored in one frame (seconds). After a tab-stall or
 *  breakpoint the real delta can be huge; clamping keeps the world from
 *  teleporting. NOT a fixed timestep — just an upper bound on dt. */
export const MAX_DT = 1 / 30;

/** Downward acceleration, logical units per second squared (positive = down). */
export const GRAVITY = 1400;

/** Fruit / hazard radius (logical units). */
export const TARGET_RADIUS = 42;

/** Extra slack added to the radius for the slice hit-test only (not the draw):
 *  a swipe that grazes close enough still counts, so fast flicks feel
 *  responsive rather than pixel-precise. */
export const HIT_PAD = 16;

/** How long (seconds) a blade-trail sample stays alive for the fade. */
export const BLADE_TRAIL_S = 0.22;

/** Splatter particles spawned per slice and their lifetime in seconds. */
export const SPLATTER = { count: 10, ttl: 0.45, speed: 280 } as const;

/** Hard cap on fruit airborne at once, so a fast spawn rate can't flood the
 *  field beyond what is sliceable. */
export const MAX_CONCURRENT = 7;

/** Launch envelope, consumed by launch.deriveLaunch. Tuned so a fruit enters
 *  from the bottom border, arcs up with its apex kept below the top border,
 *  and falls back out the bottom — never crossing a side or the top.
 *  `sideMargin` exceeds `TARGET_RADIUS` so the fruit stays fully on screen. */
export function launchBounds(gravity: number): LaunchBounds {
  return {
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    gravity,
    radius: TARGET_RADIUS,
    apexMarginTop: 80,
    sideMargin: 70,
  };
}
