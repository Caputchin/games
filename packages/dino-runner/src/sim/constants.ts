// Logical world + physics tuning for the headless sim. Shared by
// the live driver (game.ts) and the replay run (run.ts); MUST stay deterministic
// and free of any render/DOM concern.
//
// Physics are expressed in terms of the fixed STEP_S timestep (derived from
// FIXED_TIMESTEP_MS = 16ms), integrated each tick. The live driver advances the
// sim with a fixed-step accumulator and the server replays the SAME ticks, so
// live score == replay score by construction.
//
// The logical world is FIXED (WORLD_WIDTH x WORLD_HEIGHT). It does NOT adapt to
// the container: the server has no container, so adaptive geometry would make
// the replay diverge from the live play. The renderer letterboxes this fixed
// world into whatever container it gets.

import { FIXED_TIMESTEP_MS } from '@caputchin/engine-runtime';

/** Fixed reference FPS constant (physics tuned against). 60fps = 16.67ms, but
 *  we use FIXED_TIMESTEP_MS (16ms) from the kit. Stored for documentation. */
export const SIM_FPS = 1000 / FIXED_TIMESTEP_MS; // 62.5 logical fps

/** Fixed logical timestep in seconds. All per-"frame" physics multiply by this
 *  instead of MS_PER_FRAME, mapping the 60fps-tuned constants to 62.5fps ticks
 *  with an imperceptible 4% stretch - keeps the kit's integer tick math. */
export const STEP_S = FIXED_TIMESTEP_MS / 1000; // 0.016 s

/** Fixed logical world footprint. */
export const WORLD_WIDTH = 600;
export const WORLD_HEIGHT = 150;

/** The runner's feet and every ground obstacle sit on GROUND_BASELINE. */
export const BOTTOM_PAD = 10;
export const GROUND_BASELINE = WORLD_HEIGHT - BOTTOM_PAD; // 140

/** Runner box dimensions. */
export const RUNNER_WIDTH = 44;
export const RUNNER_HEIGHT = 47;
export const RUNNER_WIDTH_DUCK = 59;
export const RUNNER_START_X = 50;

/** GROUND_Y: standing top-left when grounded. */
export const GROUND_Y = WORLD_HEIGHT - RUNNER_HEIGHT - BOTTOM_PAD; // 93

/** Jump tuning (from constants.ts JUMP, ported verbatim). */
export const JUMP_DROP_VELOCITY = -5;
export const JUMP_SPEED_DROP_COEFFICIENT = 3;
export const JUMP_MIN_JUMP_RISE = 30;
export const JUMP_AUTO_CAP_RISE = 63;
export const JUMP_CEILING_Y = 4;

/** Score coefficient: distanceRan * SCORE_COEFFICIENT = integer score. */
export const SCORE_COEFFICIENT = 0.025;

/** Obstacle constants. */
export const MAX_OBSTACLE_LENGTH = 3;
export const MAX_OBSTACLE_DUPLICATION = 2;

/** Bird speed offset vs ground speed. */
export const BIRD_SPEED_OFFSET = 0.8;

/** Animation cadences per STEP_S tick (derived from ANIM_MS). */
export const ANIM_TICKS_RUN = Math.round(1000 / 12 / FIXED_TIMESTEP_MS); // ~5
export const ANIM_TICKS_DUCK = Math.round(1000 / 8 / FIXED_TIMESTEP_MS);  // ~8
export const ANIM_TICKS_BIRD = Math.round(1000 / 6 / FIXED_TIMESTEP_MS);  // ~10

/** Upper bound on replay ticks (~8 min at 16ms). Guards a non-terminating trace. */
export const MAX_TICKS = 30000;

// ---- Runner collision boxes (Chrome dino verbatim) ----------------------
// Canonical source for both the sim reducer (engine.ts) and the render
// collision helper (../../collision.ts). Keeping them here means a future box
// tweak updates BOTH paths automatically.

export interface SimBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Runner collision boxes in sprite space (top-left origin). Running set
 *  traces head / neck / body / legs; duck set is one long flat box. */
export const RUNNER_BOXES_RUNNING: readonly SimBox[] = [
  { x: 22, y: 0, width: 17, height: 16 },
  { x: 1, y: 18, width: 30, height: 9 },
  { x: 10, y: 35, width: 14, height: 8 },
  { x: 1, y: 24, width: 29, height: 5 },
  { x: 5, y: 30, width: 21, height: 4 },
  { x: 9, y: 34, width: 15, height: 4 },
];

export const RUNNER_BOXES_DUCKING: readonly SimBox[] = [
  { x: 1, y: 18, width: 55, height: 25 },
];
