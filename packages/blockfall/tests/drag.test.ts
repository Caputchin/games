import { describe, it, expect } from 'vitest';
import { dragTargetLeft } from '../src/drag.js';

// Replays the live handler's step rule: one column toward the target per move
// event, stopping when the leftmost column equals it.
function settle(startLeft: number, fingerCol: number, w: number, cols: number): { cur: number; steps: number } {
  const target = dragTargetLeft(fingerCol, w, cols);
  let cur = startLeft;
  let steps = 0;
  while (cur !== target && steps < 100) {
    cur += cur < target ? 1 : -1;
    steps++;
  }
  return { cur, steps };
}

describe('dragTargetLeft', () => {
  it('returns an integer column clamped to the board', () => {
    for (let cols = 6; cols <= 12; cols++) {
      for (let w = 1; w <= 4; w++) {
        for (let f = -3; f <= cols + 3; f++) {
          const t = dragTargetLeft(f, w, cols);
          expect(Number.isInteger(t)).toBe(true);
          expect(t).toBeGreaterThanOrEqual(0);
          expect(t).toBeLessThanOrEqual(cols - w);
        }
      }
    }
  });

  it('the O (width 2) never oscillates: it settles and a re-evaluation does not move it', () => {
    const cols = 7;
    const w = 2;
    // The reported bug: grabbing the square block flipped it between two columns.
    // From every start, against every finger column, the piece must converge and
    // then a fresh evaluation at the same finger column must leave it put.
    for (let finger = 0; finger < cols; finger++) {
      for (let start = 0; start <= cols - w; start++) {
        const { cur } = settle(start, finger, w, cols);
        const target = dragTargetLeft(finger, w, cols);
        expect(cur, `O start=${start} finger=${finger} should settle on the target`).toBe(target);
        // Re-evaluating from the settled position yields the same target => no step.
        expect(dragTargetLeft(finger, w, cols)).toBe(cur);
      }
    }
  });

  it('centres the finger over the piece (O under the finger column)', () => {
    // width 2: finger column c -> piece occupies [c, c+1] (finger over its left
    // cell, piece centre == finger cell centre), away from the edges.
    expect(dragTargetLeft(3, 2, 7)).toBe(3);
    expect(dragTargetLeft(0, 2, 7)).toBe(0);
    expect(dragTargetLeft(6, 2, 7)).toBe(5); // clamped: can't exceed cols - w
  });

  it('odd and even widths both converge from either side', () => {
    for (const w of [1, 2, 3, 4]) {
      const cols = 10;
      expect(settle(0, 8, w, cols).cur).toBe(dragTargetLeft(8, w, cols));
      expect(settle(cols - w, 1, w, cols).cur).toBe(dragTargetLeft(1, w, cols));
    }
  });
});
