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

/** The four kitchen stations, evenly spaced along the counter row. A prompt
 *  appears at one free station at a time; the player gestures at that station. */
export const STATIONS: ReadonlyArray<{ readonly x: number; readonly y: number }> = [
  { x: 100, y: 400 },
  { x: 300, y: 400 },
  { x: 500, y: 400 },
  { x: 700, y: 400 },
];
export const STATION_COUNT = STATIONS.length;
/** Hit radius of a station (a press within this of a station's centre is "at" it). */
export const STATION_R = 90;
/** Squared radius - keeps the station hit-test sqrt-free (bit-identical both ends). */
export const STATION_R2 = STATION_R * STATION_R;

/** Gesture directions. The wire/order is fixed; the prompt's requiredDir is one. */
export const DIR_UP = 0;
export const DIR_RIGHT = 1;
export const DIR_DOWN = 2;
export const DIR_LEFT = 3;
export const DIR_COUNT = 4;

/** Genuine-gesture span (rule U6): a gesture only registers once the stroke has
 *  swept at least this far (max-axis / Chebyshev displacement, sqrt-free) from
 *  where it first pressed down. A point-nick / tap never reaches it, so the
 *  captured motor input lands in the rich path (drag) channel the input-signature
 *  judge scores instead of a contentless tap. Well above the tap/drag boundary. */
export const MIN_GESTURE_SPAN = 40;

/** Reaction-time floor in ticks (rule R1): a gesture resolving fewer than this
 *  many ticks after a prompt became actionable is superhuman and does not score.
 *  Derived from the canonical human floor at this slot's fixed timestep. */
export const REACTION_TICKS = Math.ceil(REACTION_FLOOR_MS / FIXED_TIMESTEP_MS);

/** Hard tick ceiling: a replay longer than this is truncated (a fail). The round
 *  normally ends far earlier (pass / out of lives / time budget). ~60s at 50 Hz. */
export const MAX_TICKS = 3000;

/** Difficulty ramp: spawns get faster and spoiled prompts more common as the
 *  round progresses. Linear over RAMP_TICKS, then held. */
export const RAMP_TICKS = 1800; // ~36s
export const SPAWN_INTERVAL_MIN_TICKS = 26; // fastest spawn cadence at full ramp
export const SPOILED_CHANCE_MAX = 0.45; // spoiled probability at full ramp
