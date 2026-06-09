// Fixed sim constants. The world is a fixed integer-pixel space the sim reasons
// in; the live renderer letterboxes it into the container. All gameplay geometry
// is integer / fixed-point with no transcendentals, so the sim is deterministic
// across the browser and the replay isolate (the determinism path for this slot:
// logic / geometry, no float physics).

import { REACTION_FLOOR_MS } from '@caputchin/engine-kit';

/** Virtual ms per logical tick. MUST equal the preset's FIXED_TIMESTEP_MS
 *  (50 Hz). Defined locally (not imported from the preset) so this pure sim module
 *  does not pull the Excalibur engine into a unit-test / red-team import graph. */
const FIXED_TIMESTEP_MS = 20;

/** Fixed world the sim reasons in (pointer coords are in this space). */
export const WORLD_W = 800;
export const WORLD_H = 600;

/** The cutting-board slots an ingredient can occupy, left to right. One
 *  ingredient per slot at a time; the player chops by swiping across it. */
export const SLOTS: ReadonlyArray<{ readonly x: number; readonly y: number }> = [
  { x: 110, y: 415 },
  { x: 265, y: 415 },
  { x: 420, y: 415 },
  { x: 575, y: 415 },
  { x: 730, y: 415 },
];
export const SLOT_COUNT = SLOTS.length;

/** Ingredient hit radius (the chop swipe must cross this disc). */
export const INGREDIENT_R = 62;
/** Extra slack on the swipe-vs-ingredient hit test. */
export const HIT_PAD = 14;

/** Genuine-gesture span (rule U6): a chop only registers once the stroke has
 *  swept at least this far (max-axis / Chebyshev displacement, sqrt-free) from
 *  where it pressed down. A tap / point-nick never reaches it, so the captured
 *  motor input lands in the rich path (drag) channel the input-signature judge
 *  scores instead of a contentless tap. Well above the tap/drag boundary. */
export const MIN_CHOP_SPAN = 40;

/** Reaction-time floor in ticks (rule R1): a chop landing fewer than this many
 *  ticks after an ingredient appeared is superhuman and does not count. Derived
 *  from the canonical human floor at this slot's fixed timestep. */
export const REACTION_TICKS = Math.ceil(REACTION_FLOOR_MS / FIXED_TIMESTEP_MS);

/** Hard tick ceiling: a replay longer than this is truncated (a fail). The round
 *  normally ends far earlier (pass / out of lives / time budget). ~60s at 50 Hz. */
export const MAX_TICKS = 3000;

/** Difficulty ramp: spawns get faster and distractors more common as the round
 *  progresses. Linear over RAMP_TICKS, then held. */
export const RAMP_TICKS = 1800; // ~36s
export const SPAWN_INTERVAL_MIN_TICKS = 24; // fastest spawn cadence at full ramp
export const DISTRACTOR_CHANCE_MAX = 0.55; // distractor probability at full ramp
