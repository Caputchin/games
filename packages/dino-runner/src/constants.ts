// Physics + geometry constants for Dino Runner, ported from the Chrome
// "t-rex runner" offline game so the feel matches the original. All values
// are in a fixed logical coordinate space (WORLD_WIDTH x WORLD_HEIGHT);
// styles.ts scales that space to whatever pixel size the iframe gives us,
// so the physics never has to be re-tuned per viewport.
//
// SINGLE SOURCE OF TRUTH: geometry, physics, and collision constants live in
// src/sim/constants.ts so the render layer and the server replay share one
// set of values. This file re-exports the shared constants and adds the
// render-only ones (frame-rate references, animation cadences, scenery ratios)
// that have no replay counterpart.

// Re-export all shared geometry + physics from the sim layer so every render
// module can still `import from './constants.js'` without changes.
export {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  BOTTOM_PAD,
  GROUND_BASELINE,
  GROUND_Y,
  RUNNER_WIDTH,
  RUNNER_HEIGHT,
  RUNNER_WIDTH_DUCK,
  RUNNER_START_X,
  JUMP_DROP_VELOCITY,
  JUMP_SPEED_DROP_COEFFICIENT,
  JUMP_MIN_JUMP_RISE,
  JUMP_AUTO_CAP_RISE,
  JUMP_CEILING_Y,
  SCORE_COEFFICIENT,
  MAX_OBSTACLE_LENGTH,
  MAX_OBSTACLE_DUPLICATION,
  BIRD_SPEED_OFFSET,
} from './sim/constants.js';

import { DEFAULT_GRAVITY, DEFAULT_JUMP_VELOCITY } from './sim/config.js';

/** Fixed reference frame rate the render loop is tuned against (60fps). The
 *  sim uses FIXED_TIMESTEP_MS (16ms = 62.5fps); the render layer animates at
 *  this reference cadence so animation timers stay consistent. */
export const FPS = 60;
export const MS_PER_FRAME = 1000 / FPS; // 16.67ms

/** Ground tile strip height — render-only, no physics use. */
export const GROUND_LINE_HEIGHT = 12;

/** Runner box dimensions as an object, kept for the render layer's existing
 *  destructuring imports (`RUNNER.width`, `RUNNER.height`, etc.). Values are
 *  canonical from sim/constants.ts; this wrapper exists purely for API compat. */
import {
  RUNNER_WIDTH,
  RUNNER_HEIGHT,
  RUNNER_WIDTH_DUCK,
  RUNNER_START_X,
  JUMP_DROP_VELOCITY,
  JUMP_SPEED_DROP_COEFFICIENT,
  JUMP_MIN_JUMP_RISE,
  JUMP_AUTO_CAP_RISE,
  JUMP_CEILING_Y,
} from './sim/constants.js';

export const RUNNER = {
  width: RUNNER_WIDTH,
  height: RUNNER_HEIGHT,
  widthDuck: RUNNER_WIDTH_DUCK,
  startX: RUNNER_START_X,
} as const;

/** Jump tuning, kept as an object for the render layer's `JUMP.gravity` etc.
 *  Note: `gravity` + `initialVelocity` come from the resolved DinoConfig
 *  (user-configurable); these object entries match the `default` preset values
 *  and are used only by the render-side Runner class for its update() method.
 *  The SIM reads gravity + jumpVelocity from SimConfig, not from here.
 *  DEFAULT_GRAVITY + DEFAULT_JUMP_VELOCITY are imported from sim/config.ts so
 *  the fallback literals live in one place only. */
export const JUMP = {
  gravity: DEFAULT_GRAVITY,
  initialVelocity: -DEFAULT_JUMP_VELOCITY,
  dropVelocity: JUMP_DROP_VELOCITY,
  speedDropCoefficient: JUMP_SPEED_DROP_COEFFICIENT,
  minJumpRise: JUMP_MIN_JUMP_RISE,
  autoCapRise: JUMP_AUTO_CAP_RISE,
  ceilingY: JUMP_CEILING_Y,
} as const;

/** Horizontal-speed progression defaults. Used only by config.ts to build the
 *  DinoConfig fallbacks; the sim reads speed from SimConfig. */
export const SPEED = {
  initial: 6,
  max: 13,
  acceleration: 0.001,
} as const;

/** Obstacle spacing default coefficient; used only by config.ts fallback. */
export const GAP_COEFFICIENT = 0.6;

/** Sprite-frame animation cadences (ms per reference frame). Render-only. */
export const ANIM_MS = {
  run: 1000 / 12,
  duck: 1000 / 8,
  bird: 1000 / 6,
  blink: 7000,
} as const;

/** Background scenery motion, expressed as a fraction of the run speed. Render-only. */
export const CLOUD_SPEED_RATIO = 0.2;
export const STAR_SPEED_RATIO = 0.3;
export const MOON_SPEED_RATIO = 0.25;
export const MAX_CLOUDS = 6;
