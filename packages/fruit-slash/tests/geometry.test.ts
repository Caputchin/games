import { describe, it, expect } from 'vitest';
import {
  distSqPointToSegment,
  segmentIntersectsCircle,
  swipeHitsCircle,
} from '../src/sim/geometry.js';

describe('distSqPointToSegment', () => {
  it('is zero for a point on the segment', () => {
    expect(distSqPointToSegment({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(0);
  });

  it('measures perpendicular distance to the segment interior', () => {
    expect(distSqPointToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(9);
  });

  it('clamps to the nearest endpoint when the foot is past the segment', () => {
    // foot would be at x=-5; clamps to endpoint A (0,0); distance^2 = 25 + 0
    expect(distSqPointToSegment({ x: -5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(25);
  });

  it('handles a degenerate (zero-length) segment as point distance', () => {
    expect(distSqPointToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(25);
  });
});

describe('segmentIntersectsCircle', () => {
  it('true when the segment passes through the circle', () => {
    expect(segmentIntersectsCircle({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 2, r: 3 })).toBe(true);
  });
  it('false when the segment misses the circle', () => {
    expect(segmentIntersectsCircle({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 9, r: 3 })).toBe(false);
  });
  it('true exactly at the radius boundary', () => {
    expect(segmentIntersectsCircle({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 3, r: 3 })).toBe(true);
  });
});

describe('swipeHitsCircle', () => {
  it('single-point path degrades to point-in-circle', () => {
    expect(swipeHitsCircle([{ x: 5, y: 5 }], { x: 5, y: 5, r: 2 })).toBe(true);
    expect(swipeHitsCircle([{ x: 5, y: 5 }], { x: 50, y: 50, r: 2 })).toBe(false);
  });

  it('hits when a MIDDLE sub-segment crosses, though both endpoints miss', () => {
    // Endpoints far from the circle, but the path bends through it.
    const path = [
      { x: 0, y: 0 },
      { x: 50, y: 50 }, // passes through the circle at (50,50)
      { x: 100, y: 0 },
    ];
    const circle = { x: 50, y: 50, r: 5 };
    // Each endpoint alone is > r from center, but a vertex sits on it.
    expect(swipeHitsCircle(path, circle)).toBe(true);
  });

  it('false for an empty path', () => {
    expect(swipeHitsCircle([], { x: 0, y: 0, r: 1 })).toBe(false);
  });
});
