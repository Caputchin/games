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

/** The three stations on the counter, left to right. The array index is the
 *  station id AND the required gesture id (0 board/chop, 1 pot/stir, 2 pan/flip).
 *  An ingredient appears at its station and is worked with the matching gesture. */
export const STATIONS: ReadonlyArray<{ readonly x: number; readonly y: number }> = [
  { x: 158, y: 432 }, // board
  { x: 400, y: 432 }, // pot
  { x: 642, y: 432 }, // pan
];

/** How close a stroke's anchor (press point) must be to a station centre for the
 *  gesture to be aimed at it. Stations are 242px apart, so this never overlaps. */
export const STATION_R = 150;

/** Ingredient draw / footprint radius at its station. */
export const ITEM_R = 60;

/** Genuine-gesture span floor (rule U6): a gesture only registers once the stroke's
 *  bounding box has swept at least this far (max-axis / Chebyshev extent, sqrt-free).
 *  A tap / point-nick never reaches it, so the captured motor input lands in the
 *  rich path (drag) channel the input-signature judge scores, not a contentless tap. */
export const MIN_GESTURE_SPAN = 46;

// --- Gesture shape thresholds (integer-ratio comparisons, sqrt-free) -------------
// A STIR loops back on itself: its path length is well beyond its bounding span and
// it ends near where it started. A CHOP/FLIP is a near-straight stroke whose net
// displacement is vertical (down = chop, up = flip). All compared as cross-multiplied
// integers so there is no division and no environment drift.

/** Stir if pathLen >= STIR_PATH_NUM/STIR_PATH_DEN * span (i.e. >= 2.0x). */
export const STIR_PATH_NUM = 2;
export const STIR_PATH_DEN = 1;
/** ...and the net displacement is small vs the span: netCheb <= STIR_NET_NUM/STIR_NET_DEN * span (<= 0.6x). */
export const STIR_NET_NUM = 3;
export const STIR_NET_DEN = 5;

/** Reaction-time floor in ticks (rule R1): a gesture landing fewer than this many
 *  ticks after an ingredient appeared is superhuman and does not count. Derived
 *  from the canonical human floor at this slot's fixed timestep. */
export const REACTION_TICKS = Math.ceil(REACTION_FLOOR_MS / FIXED_TIMESTEP_MS);

/** Hard tick ceiling: a replay longer than this is truncated (a fail). The round
 *  normally ends far earlier (pass / out of lives / time budget). ~60s at 50 Hz. */
export const MAX_TICKS = 3000;

/** Difficulty ramp: spawns get faster and distractors more common as the round
 *  progresses. Linear over RAMP_TICKS, then held. */
export const RAMP_TICKS = 1800; // ~36s
export const SPAWN_INTERVAL_MIN_TICKS = 22; // fastest spawn cadence at full ramp
export const DISTRACTOR_CHANCE_MAX = 0.58; // distractor probability at full ramp
