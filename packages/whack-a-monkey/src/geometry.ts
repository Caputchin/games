// Pure tap geometry + grid layout. A tap is a point; each hole is a circle.
// A tap lands when it falls inside a hole's (scaled) hit circle. Holes never
// overlap, so at most one hole matches. Dependency-free + side-effect-free so
// it unit-tests in isolation (tests/geometry.test.ts).

import { GRID_COLS, GRID_ROWS, GRID_MARGIN, WORLD_WIDTH } from './sim/constants.js';

export interface Vec {
  x: number;
  y: number;
}

/** A hole's hit circle in world units. `r` already folds in the live mole
 *  scale + hit-pad; geometry does not know about springs. */
export interface HoleCircle {
  cx: number;
  cy: number;
  r: number;
}

/** True when point (px,py) is within radius r of center (cx,cy). Squared
 *  compare avoids a sqrt on the hot path. */
export function pointInCircle(px: number, py: number, cx: number, cy: number, r: number): boolean {
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

/** Index of the hole whose hit circle contains the point, or -1 if none. Holes
 *  do not overlap, so the first containing hole is the only one. */
export function pickHoleAt(p: Vec, holes: readonly HoleCircle[]): number {
  for (let i = 0; i < holes.length; i++) {
    const h = holes[i]!;
    if (pointInCircle(p.x, p.y, h.cx, h.cy, h.r)) return i;
  }
  return -1;
}

/** Fixed hole centers for the grid, in world units. Evenly spaced cells inside
 *  a margin so the grid never crowds the world edges. Index is row-major
 *  (row 0 = top). `worldHeight` is passed because the live world height adapts
 *  to the container aspect at runtime. */
export function computeHoleCenters(worldHeight: number): Vec[] {
  const marginX = WORLD_WIDTH * GRID_MARGIN;
  const marginY = worldHeight * GRID_MARGIN;
  const usableW = WORLD_WIDTH - marginX * 2;
  const usableH = worldHeight - marginY * 2;
  const cellW = usableW / GRID_COLS;
  const cellH = usableH / GRID_ROWS;
  const centers: Vec[] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      centers.push({
        x: marginX + (col + 0.5) * cellW,
        y: marginY + (row + 0.5) * cellH,
      });
    }
  }
  return centers;
}
