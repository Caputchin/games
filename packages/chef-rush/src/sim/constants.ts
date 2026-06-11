// Fixed sim constants. The world is a fixed integer-pixel space the sim reasons
// in; the live renderer letterboxes it into the container. All gameplay geometry
// is integer / fixed-point with no transcendentals, so the sim is deterministic
// across the browser and the replay isolate (the determinism path for this slot:
// logic / geometry, no float physics).

import { REACTION_FLOOR_MS } from '@caputchin/engine-kit';
import { GAME_WAITING, type GamePhase } from './types';

/** Virtual ms per logical tick. MUST equal the preset's FIXED_TIMESTEP_MS
 *  (50 Hz). Defined locally (not imported from the preset) so this pure sim module
 *  does not pull the Excalibur engine into a unit-test / red-team import graph. */
const FIXED_TIMESTEP_MS = 20;

/** Fixed world the sim reasons in (pointer coords are in this space). */
export const WORLD_W = 800;
export const WORLD_H = 600;

/** The prep counter, on the left, where the current ingredient waits to be dragged. */
export const PREP = { x: 108, y: 372 } as const;
/** The trash bin, below the prep counter - drag a wrong / rotten ingredient here. */
export const TRASH = { x: 108, y: 532 } as const;

/** The three cooking stations, spread across the counter, left to right. The array
 *  index is the station id AND the required gesture id (0 board/chop, 1 pot/stir,
 *  2 pan/flip). Well separated so they read as three distinct stations. */
export const STATIONS: ReadonlyArray<{ readonly x: number; readonly y: number }> = [
  { x: 312, y: 372 }, // board
  { x: 498, y: 372 }, // pot
  { x: 684, y: 372 }, // pan
];

/** Ingredient draw radius on the counter / at a station. */
export const ITEM_R = 56;
/** How close the press point must be to the prep item to start dragging it. */
export const PREP_R = 80;
/** Drop target radius around a station (the gesture itself starts on any press). */
export const STATION_R = 92;
/** A cooking gesture only counts if its path cuts within this radius of the station
 *  it is meant for (so a slash in empty space does nothing). The item's drawn circle
 *  plus a little slack. */
export const GESTURE_HIT_R = ITEM_R + 16;
/** Drop target radius around the trash bin. */
export const TRASH_R = 84;

/** A drag must travel at least this far (max-axis / Chebyshev, sqrt-free) to count
 *  as a drag rather than a tap - filters an accidental nick on the item. */
export const MIN_DRAG_SPAN = 30;

/** Genuine-gesture span floor (rule U6): a cooking gesture only registers once the
 *  stroke's bounding box has swept at least this far. A tap never reaches it, so the
 *  captured motor input lands in the rich path (drag) channel the judge scores. */
export const MIN_GESTURE_SPAN = 46;

// --- Gesture shape thresholds (integer-ratio comparisons, sqrt-free) -------------
/** Stir if pathLen >= STIR_PATH_NUM/STIR_PATH_DEN * span (>= 2.0x). */
export const STIR_PATH_NUM = 2;
export const STIR_PATH_DEN = 1;
/** ...and the net displacement is small vs the span (<= 0.6x). */
export const STIR_NET_NUM = 3;
export const STIR_NET_DEN = 5;

/** Reaction-time floor in ticks (rule R1): a cook landing fewer than this many ticks
 *  after the ingredient appeared is superhuman and does not count. */
export const REACTION_TICKS = Math.ceil(REACTION_FLOOR_MS / FIXED_TIMESTEP_MS);

/** Hard tick ceiling: a replay longer than this is truncated. Generous, because a
 *  winning trace can include failed attempts the player retried before passing
 *  (~180s at 50 Hz). The pass normally latches far earlier. */
export const MAX_TICKS = 9000;

/** The overlay card + its single button (start / keep playing / try again). The sim
 *  hit-tests a tap against the button rect to advance the lifecycle, and the renderer
 *  draws the card + button from the SAME numbers, so a tap only counts on the button
 *  the player actually sees. */
export const OVERLAY_CARD_W = 496;
export const OVERLAY_CARD_H_WAITING = 372;
export const OVERLAY_CARD_H_END = 300;
export const OVERLAY_BTN_W = 232;
export const OVERLAY_BTN_H = 60;

/** The overlay button rect (world coords) for the given lifecycle phase. */
export function overlayButtonRect(gamePhase: GamePhase): { x: number; y: number; w: number; h: number } {
  const cardH = gamePhase === GAME_WAITING ? OVERLAY_CARD_H_WAITING : OVERLAY_CARD_H_END;
  const cardY = (WORLD_H - cardH) / 2;
  return {
    x: WORLD_W / 2 - OVERLAY_BTN_W / 2,
    y: cardY + cardH - OVERLAY_BTN_H - 24,
    w: OVERLAY_BTN_W,
    h: OVERLAY_BTN_H,
  };
}
