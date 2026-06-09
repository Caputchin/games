// Deterministic gesture geometry. All sqrt-free integer/float arithmetic (no
// trig), so it is bit-identical in the browser and the replay isolate.

import { DIR_DOWN, DIR_LEFT, DIR_RIGHT, DIR_UP, STATION_R2, STATIONS } from './constants';

/** Max-axis (Chebyshev) displacement between two points - the genuine-gesture
 *  span (rule U6). Sqrt-free so it cannot diverge across environments. */
export function span(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(bx - ax), Math.abs(by - ay));
}

/** The dominant 4-way direction of the vector (dx, dy). Ties (|dx| === |dy|)
 *  resolve to the horizontal axis, deterministically. */
export function dirOf(dx: number, dy: number): number {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? DIR_RIGHT : DIR_LEFT;
  return dy >= 0 ? DIR_DOWN : DIR_UP;
}

/** Index of the station whose centre is within STATION_R of (x, y), or -1.
 *  Stations do not overlap, so at most one matches; the first wins. */
export function stationAt(x: number, y: number): number {
  for (let i = 0; i < STATIONS.length; i++) {
    const s = STATIONS[i]!;
    const dx = x - s.x;
    const dy = y - s.y;
    if (dx * dx + dy * dy <= STATION_R2) return i;
  }
  return -1;
}
