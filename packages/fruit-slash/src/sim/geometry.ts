// Pure slice geometry. The blade is a moving polyline (recent pointer samples);
// a fruit is a circle. A slice lands when any segment of the swipe passes within
// the fruit's radius. Built only from +,-,*,/ and comparisons (squared distance,
// never a sqrt) so it is bit-identical across runtimes — safe in the verdict
// path. Dependency-free + side-effect-free so it unit-tests in isolation.

export interface Vec {
  x: number;
  y: number;
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}

/** Squared distance from point P to segment AB. Squared to stay sqrt-free on the
 *  hot path; callers compare against r*r. */
export function distSqPointToSegment(p: Vec, a: Vec, b: Vec): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const abLenSq = abx * abx + aby * aby;
  // Degenerate segment (no movement): point-to-point distance.
  const t = abLenSq === 0 ? 0 : clamp01((apx * abx + apy * aby) / abLenSq);
  const cx = a.x + t * abx;
  const cy = a.y + t * aby;
  const dx = p.x - cx;
  const dy = p.y - cy;
  return dx * dx + dy * dy;
}

/** True when segment AB passes within `circle.r` of the circle center. */
export function segmentIntersectsCircle(a: Vec, b: Vec, circle: Circle): boolean {
  return distSqPointToSegment(circle, a, b) <= circle.r * circle.r;
}

/** True when any sub-segment of a swipe path passes within the circle. A
 *  single-point path degrades to a point-in-circle test. */
export function swipeHitsCircle(path: readonly Vec[], circle: Circle): boolean {
  if (path.length === 0) return false;
  if (path.length === 1) {
    const dx = path[0]!.x - circle.x;
    const dy = path[0]!.y - circle.y;
    return dx * dx + dy * dy <= circle.r * circle.r;
  }
  for (let i = 1; i < path.length; i++) {
    if (segmentIntersectsCircle(path[i - 1]!, path[i]!, circle)) return true;
  }
  return false;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
