// Deterministic gesture + drop geometry. Sqrt-free / trig-free integer + IEEE-754
// division only, so it is bit-identical in the browser and the replay isolate.

import {
  MIN_GESTURE_SPAN,
  PREP,
  PREP_R,
  STATIONS,
  STATION_R,
  STIR_NET_DEN,
  STIR_NET_NUM,
  STIR_PATH_DEN,
  STIR_PATH_NUM,
  TRASH,
  TRASH_R,
} from './constants';
import { DROP_NONE, DROP_TRASH, type GestureKind } from './types';

/** One pointer stroke, accumulated across ticks (the geometry classifyGesture reads). */
export interface Stroke {
  active: boolean;
  anchorX: number;
  anchorY: number;
  lastX: number;
  lastY: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  pathLen: number;
}

/** Max-axis (Chebyshev) distance between two points. Sqrt-free. */
export function cheb(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(bx - ax), Math.abs(by - ay));
}

/** Does the segment (a -> b) pass within `r` (r2 = r squared) of the circle centred
 *  at (cx, cy)? Squared distance from the segment to the point; no sqrt, so it cannot
 *  diverge across environments. Used to require a cooking gesture to actually cut
 *  through the station's circle (not just happen somewhere on the counter). */
export function swipeHitsCircle(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  r2: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 0) {
    t = ((cx - ax) * dx + (cy - ay) * dy) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
  }
  const px = ax + t * dx;
  const py = ay + t * dy;
  const ex = px - cx;
  const ey = py - cy;
  return ex * ex + ey * ey <= r2;
}

/** Is the press point on the prep-counter ingredient (so a drag should start)? */
export function onPrepItem(x: number, y: number): boolean {
  return cheb(x, y, PREP.x, PREP.y) <= PREP_R;
}

/** The station whose centre the point is nearest to, if within STATION_R; else -1. */
export function nearStation(x: number, y: number): number {
  let best = -1;
  let bestD = STATION_R;
  for (let i = 0; i < STATIONS.length; i++) {
    const s = STATIONS[i]!;
    const d = cheb(x, y, s.x, s.y);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Where a drag ended: a station index (0..2), DROP_TRASH, or DROP_NONE (dropped on
 *  empty space - the item stays on the counter). Stations win ties over the trash. */
export function dropTarget(x: number, y: number): number {
  const st = nearStation(x, y);
  if (st >= 0) return st;
  if (cheb(x, y, TRASH.x, TRASH.y) <= TRASH_R) return DROP_TRASH;
  return DROP_NONE;
}

/** Has the stroke COMPLETED the motion gesture `kind` requires? Checked incrementally
 *  each sample, so a gesture registers the moment its motion is done - mid-hold, with
 *  the button still pressed - not on release:
 *    0 chop - travelled down >= MIN_GESTURE_SPAN, dominantly vertical,
 *    1 stir - looped (long path) and returned near its start,
 *    2 flip - travelled up >= MIN_GESTURE_SPAN, dominantly vertical.
 *  The start point does not matter, so a slash that begins outside the station and
 *  cuts down through it still registers. */
export function isGestureComplete(s: Stroke, kind: number): boolean {
  const span = Math.max(s.maxX - s.minX, s.maxY - s.minY);
  if (span < MIN_GESTURE_SPAN) return false;
  const netX = s.lastX - s.anchorX;
  const netY = s.lastY - s.anchorY;
  const absNetX = Math.abs(netX);
  if (kind === 0) return netY >= MIN_GESTURE_SPAN && netY >= absNetX; // chop: down
  if (kind === 2) return -netY >= MIN_GESTURE_SPAN && -netY >= absNetX; // flip: up
  if (kind === 1) {
    const netCheb = Math.max(absNetX, Math.abs(netY));
    return s.pathLen * STIR_PATH_DEN >= span * STIR_PATH_NUM && netCheb * STIR_NET_DEN <= span * STIR_NET_NUM; // stir
  }
  return false;
}

/** Classify a completed stroke into a cooking gesture: 0 chop (downward), 1 stir
 *  (a loop), 2 flip (upward), or -1 (too small / sideways). Stir is tested first
 *  because its long path would otherwise read as chop/flip.
 *
 *  Spec-anchor (test-only): the LIVE verdict uses `isGestureComplete` (incremental,
 *  mid-hold) - this post-hoc classifier pins the same chop/stir/flip thresholds under
 *  direct unit coverage, so a drift in either path is caught. */
export function classifyGesture(s: Stroke): GestureKind {
  const span = Math.max(s.maxX - s.minX, s.maxY - s.minY);
  if (span < MIN_GESTURE_SPAN) return -1; // tap / nick: below the genuine-gesture floor

  const netX = s.lastX - s.anchorX;
  const netY = s.lastY - s.anchorY;
  const absNetX = Math.abs(netX);
  const netCheb = Math.max(absNetX, Math.abs(netY));

  if (s.pathLen * STIR_PATH_DEN >= span * STIR_PATH_NUM && netCheb * STIR_NET_DEN <= span * STIR_NET_NUM) {
    return 1; // loops back on itself -> stir
  }
  if (netY >= absNetX) return 0; // travels down -> chop
  if (-netY >= absNetX) return 2; // travels up -> flip
  return -1; // mostly sideways: not one of our gestures
}
