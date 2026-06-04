import { describe, it, expect } from 'vitest';
import { generatePuzzle } from '../src/sim/puzzle.js';
import { WALL_ROWS, GAP_SLOTS_MIN } from '../src/sim/constants.js';
import type { SimConfig } from '../src/sim/types.js';

function lcg(seed: number): (n: number) => number {
  let s = seed >>> 0;
  return (n) => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return n > 0 ? s % n : 0;
  };
}

const CFG: SimConfig = { cols: 7, rows: 9, passLines: 2, gravity: 26, lockDelay: 16, sound: false };

describe('generatePuzzle', () => {
  it('deals only O "keys", at least one per slot', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { queue } = generatePuzzle(CFG, lcg(seed));
      expect(queue.length).toBeGreaterThanOrEqual(GAP_SLOTS_MIN);
      expect(queue.every((t) => t === 1)).toBe(true);
    }
  });

  it('builds a wall in the bottom rows and leaves the rest empty', () => {
    const { board } = generatePuzzle(CFG, lcg(5));
    const wallTop = CFG.rows - WALL_ROWS;
    for (let r = 0; r < wallTop; r++) {
      expect(board[r]!.every((c) => c === 0), `row ${r} above the wall is empty`).toBe(true);
    }
    // The wall band has substantial fill (it is a wall, not a sieve).
    let filled = 0;
    for (let r = wallTop; r < CFG.rows; r++) for (const c of board[r]!) if (c !== 0) filled++;
    expect(filled).toBeGreaterThan(WALL_ROWS * CFG.cols * 0.4);
  });

  it('every clear row keeps an open gap (no pre-completed row)', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { board } = generatePuzzle(CFG, lcg(seed));
      const anyFull = board.some((row) => row.every((c) => c !== 0));
      expect(anyFull, `seed ${seed} must not pre-complete a row`).toBe(false);
    }
  });

  it('carves 2-wide open-top slots (one per dealt key)', () => {
    const rand = lcg(9);
    const { board, queue } = generatePuzzle(CFG, rand);
    const r = CFG.rows - 1;
    let twoWideGaps = 0;
    for (let x = 0; x + 1 < CFG.cols; x++) {
      if (board[r]![x] === 0 && board[r]![x + 1] === 0 && (x === 0 || board[r]![x - 1] !== 0)) twoWideGaps++;
    }
    expect(twoWideGaps).toBe(queue.length);
    // each gap column is empty all the way up (open top)
    for (let c = 0; c < CFG.cols; c++) {
      if (board[r]![c] === 0) {
        for (let rr = 0; rr < r; rr++) expect(board[rr]![c]).toBe(0);
      }
    }
  });
});
