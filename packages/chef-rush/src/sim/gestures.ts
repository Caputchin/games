// Deterministic gesture geometry. Sqrt-free / trig-free integer + IEEE-754 division
// only, so classification is bit-identical in the browser and the replay isolate.

import {
  MIN_GESTURE_SPAN,
  STATIONS,
  STATION_R,
  STIR_NET_DEN,
  STIR_NET_NUM,
  STIR_PATH_DEN,
  STIR_PATH_NUM,
} from './constants';
import type { GestureKind, Stroke } from './types';

/** Max-axis (Chebyshev) distance between two points. Sqrt-free. Used both for the
 *  per-segment path-length steps and the station anchor test. */
export function cheb(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(bx - ax), Math.abs(by - ay));
}

/** The station whose centre the stroke's anchor (press point) is nearest to, if
 *  within STATION_R; otherwise -1 (the gesture is not aimed at any station). */
export function nearestStation(x: number, y: number): number {
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

/** Classify a completed stroke into a cooking gesture:
 *    0 chop  - a near-straight stroke that travels downward,
 *    1 stir  - a looping path (long relative to its span, ending near its start),
 *    2 flip  - a near-straight stroke that travels upward,
 *   -1        - too small to be a gesture, or an ambiguous (sideways) stroke.
 *
 *  A stir is tested first because its long path would otherwise read as a chop/flip;
 *  chop vs flip is then decided by the sign of the dominant (vertical) axis. */
export function classifyGesture(s: Stroke): GestureKind {
  const span = Math.max(s.maxX - s.minX, s.maxY - s.minY);
  if (span < MIN_GESTURE_SPAN) return -1; // tap / nick: below the genuine-gesture floor

  const netX = s.lastX - s.anchorX;
  const netY = s.lastY - s.anchorY;
  const absNetX = Math.abs(netX);
  const netCheb = Math.max(absNetX, Math.abs(netY));

  // Stir: path length well beyond the span AND it ends near where it began.
  if (s.pathLen * STIR_PATH_DEN >= span * STIR_PATH_NUM && netCheb * STIR_NET_DEN <= span * STIR_NET_NUM) {
    return 1;
  }
  // Otherwise a near-straight stroke: dominant vertical direction decides chop/flip.
  if (netY >= absNetX) return 0; // travels down -> chop
  if (-netY >= absNetX) return 2; // travels up -> flip
  return -1; // mostly sideways: not one of our gestures
}
