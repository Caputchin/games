import { describe, it, expect } from 'vitest';
import { pointInCircle, pickHoleAt, computeHoleCenters, type HoleCircle } from '../src/geometry.js';
import { HOLE_COUNT, WORLD_WIDTH } from '../src/sim/constants.js';

describe('pointInCircle', () => {
  it('is true inside and at the boundary, false outside', () => {
    expect(pointInCircle(0, 0, 0, 0, 5)).toBe(true);
    expect(pointInCircle(5, 0, 0, 0, 5)).toBe(true); // on the edge
    expect(pointInCircle(6, 0, 0, 0, 5)).toBe(false);
  });
});

describe('pickHoleAt', () => {
  const holes: HoleCircle[] = [
    { cx: 100, cy: 100, r: 40 },
    { cx: 300, cy: 100, r: 40 },
    { cx: 100, cy: 300, r: 40 },
  ];
  it('returns the index of the containing hole', () => {
    expect(pickHoleAt({ x: 100, y: 100 }, holes)).toBe(0);
    expect(pickHoleAt({ x: 300, y: 110 }, holes)).toBe(1);
    expect(pickHoleAt({ x: 100, y: 300 }, holes)).toBe(2);
  });
  it('returns -1 when the tap misses every hole', () => {
    expect(pickHoleAt({ x: 200, y: 200 }, holes)).toBe(-1);
  });
});

describe('computeHoleCenters', () => {
  it('lays out HOLE_COUNT centers inside the world bounds', () => {
    const centers = computeHoleCenters(600);
    expect(centers).toHaveLength(HOLE_COUNT);
    for (const c of centers) {
      expect(c.x).toBeGreaterThan(0);
      expect(c.x).toBeLessThan(WORLD_WIDTH);
      expect(c.y).toBeGreaterThan(0);
      expect(c.y).toBeLessThan(600);
    }
  });
  it('spaces columns and rows evenly (row-major)', () => {
    const centers = computeHoleCenters(600);
    const dxCol = centers[1]!.x - centers[0]!.x; // same row, next column
    const dxCol2 = centers[2]!.x - centers[1]!.x;
    expect(dxCol).toBeCloseTo(dxCol2, 6);
    const dyRow = centers[3]!.y - centers[0]!.y; // next row, same column
    expect(dyRow).toBeGreaterThan(0);
    expect(centers[0]!.y).toBeCloseTo(centers[1]!.y, 6); // row 0 shares a y
  });
});
