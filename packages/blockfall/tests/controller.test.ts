import { describe, it, expect } from 'vitest';
import { createController, type ControllerInput } from '../src/sim/controller.js';
import { pieceCells } from '../src/sim/board.js';
import type { Active, Board, SimConfig } from '../src/sim/types.js';

const identity = (a: number[]): number[] => a.slice();

/** A small seeded integer source so the generated puzzle is reproducible. */
function lcg(seed: number): (n: number) => number {
  let s = seed >>> 0;
  return (n) => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return n > 0 ? s % n : 0;
  };
}

const NONE: ControllerInput = {
  leftHeld: false,
  rightHeld: false,
  leftPressed: false,
  rightPressed: false,
  softHeld: false,
  rotateCW: false,
  rotateCCW: false,
  hardDrop: false,
};
const HARD: ControllerInput = { ...NONE, hardDrop: true };
const LEFT: ControllerInput = { ...NONE, leftPressed: true };
const RIGHT: ControllerInput = { ...NONE, rightPressed: true };

function cfg(over: Partial<SimConfig> = {}): SimConfig {
  return { cols: 7, rows: 9, passLines: 2, gravity: 1000, lockDelay: 0, sound: false, ...over };
}

const minCol = (a: Active): number => Math.min(...pieceCells(a).map(([c]) => c));

/** The leftmost 2-wide empty slot in the bottom row (an open-top gap to plug). */
function findGap(board: Board, cols: number, rows: number): number {
  const r = rows - 1;
  for (let x = 0; x + 1 < cols; x++) {
    if (board[r]![x] === 0 && board[r]![x + 1] === 0) return x;
  }
  return -1;
}

/** Whether the two spawn columns (where a fresh piece appears) are both filled. */
function spawnBlocked(board: Board, cols: number, rows: number): boolean {
  const x = Math.floor((cols - 4) / 2);
  return board[rows - 1]![x + 1] !== 0 && board[rows - 1]![x + 2] !== 0;
}

describe('controller / puzzle', () => {
  it('the starting puzzle has no pre-completed row (no free clear at tick 0)', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const c = createController(cfg(), lcg(seed), identity);
      expect(c.state.lines).toBe(0);
      expect(c.state.over).toBe(false);
      const board = c.state.board;
      const anyFull = board.some((row) => row.every((cell) => cell !== 0));
      expect(anyFull).toBe(false);
    }
  });

  it('is solvable: dropping the dealt O keys into the gaps clears passLines and passes', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const c = createController(cfg(), lcg(seed), identity);
      let guard = 0;
      while (!c.state.passed && !c.state.over && guard++ < 300) {
        const a = c.state.active;
        if (!a) {
          c.step(NONE);
          continue;
        }
        const gap = findGap(c.state.board, 7, 9);
        if (gap < 0) {
          c.step(HARD);
          continue;
        }
        const m = minCol(a);
        if (m > gap) c.step(LEFT);
        else if (m < gap) c.step(RIGHT);
        else c.step(HARD);
      }
      expect(c.state.passed, `seed ${seed} should be solvable`).toBe(true);
      expect(c.state.lines).toBeGreaterThanOrEqual(2);
    }
  });

  it('is deterministic: same seed + inputs => identical board', () => {
    const seq = [HARD, NONE, LEFT, HARD, NONE, RIGHT, HARD];
    const run = (): string => {
      const c = createController(cfg({ passLines: 9 }), lcg(42), identity);
      for (const s of seq) c.step(s);
      return JSON.stringify(c.state.board);
    };
    expect(run()).toBe(run());
  });

  it('tops out when pieces pile on the spawn columns without clearing', () => {
    // cols=8: pick a seed whose gaps avoid the two spawn columns, so repeatedly
    // hard-dropping (no move) piles pieces there. The gaps elsewhere never fill,
    // so no row clears and the stack must reach the spawn rows -> top out.
    let c = createController(cfg({ cols: 8, rows: 8, passLines: 9 }), lcg(1), identity);
    let ok = false;
    for (let seed = 1; seed <= 60 && !ok; seed++) {
      c = createController(cfg({ cols: 8, rows: 8, passLines: 9 }), lcg(seed), identity);
      ok = spawnBlocked(c.state.board, 8, 8);
    }
    expect(ok, 'a seed with filled spawn columns exists').toBe(true);
    let guard = 0;
    while (!c.state.over && guard++ < 400) c.step(HARD);
    expect(c.state.over).toBe(true);
  });

  it('a held direction auto-repeats after the DAS delay', () => {
    const c = createController(cfg({ passLines: 9 }), lcg(1), identity);
    const startX = c.state.active!.x;
    const LEFT_HELD: ControllerInput = { ...NONE, leftHeld: true };
    c.step({ ...NONE, leftHeld: true, leftPressed: true });
    for (let i = 0; i < 40; i++) c.step(LEFT_HELD);
    expect(c.state.active!.x).toBeLessThan(startX);
  });
});
