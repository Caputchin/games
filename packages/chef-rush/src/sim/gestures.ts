// Deterministic chop geometry. Sqrt-free / trig-free integer + IEEE-754 division
// only, so it is bit-identical in the browser and the replay isolate.

/** Max-axis (Chebyshev) displacement between two points - the genuine-gesture
 *  span (rule U6). Sqrt-free so it cannot diverge across environments. */
export function span(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(bx - ax), Math.abs(by - ay));
}

/** Does the swipe segment (a -> b) pass within `r` (r2 = r squared) of the
 *  circle centred at (cx, cy)? Squared-distance from segment to point; no sqrt. */
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
