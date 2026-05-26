// Logical world + physics tuning for the headless SIM. Everything
// here is shared by the live driver (game.ts) and the replay run (run.ts), so it
// MUST stay deterministic and free of any render/DOM concern.
//
// Physics are expressed PER SECOND, integrated by a FIXED logical timestep
// (STEP_S) every tick — never per real frame. The live driver advances the sim
// with a fixed-step accumulator and the server replays the SAME ticks, so live
// score == replay score by construction.
//
// The logical world is FIXED at WORLD_WIDTH x WORLD_HEIGHT. It deliberately does
// NOT adapt to the embed's container aspect (the old game did): the server has no
// idea what container the player used, and launch geometry depends on the world
// height, so an adaptive world would make the replay diverge from the live play.
// The renderer letterboxes this fixed world into whatever container it gets.

import { FIXED_TIMESTEP_MS } from '@caputchin/engine-runtime';
import type { LaunchBounds } from './launch.js';

/** Fixed logical world. Entities live in these units; the renderer scales the
 *  scene to fit the canvas and letterboxes the remainder. */
export const WORLD_WIDTH = 800;
/** Fixed logical world height (also the manifest `preferred` height). Constant,
 *  NOT container-adaptive, so the launch trajectories are identical live and on
 *  replay (the server cannot know the client's container aspect). */
export const WORLD_HEIGHT = 420;

/** Fixed simulation timestep, in seconds. Derived from the kit's integer-ms
 *  timestep so duration math (endTick * FIXED_TIMESTEP_MS) stays integer. */
export const STEP_S = FIXED_TIMESTEP_MS / 1000;

/** Default downward acceleration (units/s^2). The actual value the sim uses is
 *  read from the resolved config; this is the manifest default's mirror. */
export const GRAVITY = 1400;

/** Fruit / hazard radius (logical units). */
export const TARGET_RADIUS = 42;

/** Extra slack on the slice hit-test radius (not the draw): a swipe that grazes
 *  close enough still counts, so fast flicks feel responsive. */
export const HIT_PAD = 16;

/** Hard cap on fruit airborne at once, so a fast spawn rate can't flood the
 *  field beyond what is sliceable. */
export const MAX_CONCURRENT = 7;

/** Upper bound on replay ticks (~8 min at 16ms). Guards a non-terminating trace;
 *  a real round ends on lives-out far sooner, and the captcha pass is submitted
 *  at the pass threshold well before this. A run that exceeds it is truncated +
 *  fails. */
export const MAX_TICKS = 30000;

/** Launch envelope consumed by deriveLaunch. Tuned so a fruit enters from the
 *  bottom border, arcs up with its apex kept below the top, and falls back out
 *  the bottom, never crossing a side or the top. `sideMargin` exceeds
 *  `TARGET_RADIUS` so the fruit stays fully on screen. */
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
