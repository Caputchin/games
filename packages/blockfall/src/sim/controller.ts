// The Blockfall rules as a pure state machine. It owns the board, the falling
// piece, gravity, lock delay, line clears, scoring, the pass latch, and top-out.
// Randomness is INJECTED (the seeded puzzle + the 7-bag shuffle), so the
// controller is deterministic by construction and unit-testable without KAPLAY.
// game.ts drives one step per fixed tick and projects the state to the renderer.
//
// The round does not start from an empty well: it starts from a seeded "puzzle"
// (a near-complete wall with open-top slots) and a deal queue of O "keys", then
// falls back to the random 7-bag. Win = clear `passLines` rows.

import type { Active, Board, PieceType, SimConfig } from './types.js';
import { pieceCells, collides, lockPiece, clearFullRows } from './board.js';
import { PIECE_COUNT, KICKS } from './pieces.js';
import { lineScore } from './scoring.js';
import { generatePuzzle } from './puzzle.js';
import { SOFT_DROP_INTERVAL, FAST_FALL_INTERVAL, DAS_DELAY, ARR, SPAWN_ROW } from './constants.js';

/** One tick of input: held flags for continuous actions, edges for discrete ones. */
export interface ControllerInput {
  leftHeld: boolean;
  rightHeld: boolean;
  leftPressed: boolean;
  rightPressed: boolean;
  softHeld: boolean;
  rotateCW: boolean;
  rotateCCW: boolean;
  hardDrop: boolean;
}

export interface ControllerState {
  readonly board: Board;
  readonly active: Active | null;
  readonly score: number;
  readonly lines: number;
  readonly over: boolean;
  readonly passed: boolean;
}

export interface StepResult {
  /** Lines cleared on this tick (0-4). */
  readonly cleared: number;
  /** True on the tick the active piece locked (for a lock "thunk" cue). */
  readonly locked: boolean;
}

export interface Controller {
  readonly state: ControllerState;
  step(input: ControllerInput): StepResult;
}

/**
 * Build a controller. `rand(n)` is a seeded integer source in `[0, n)` (the
 * puzzle layout) and `shuffle` is a seeded permutation (the 7-bag) — both from
 * the preset api, so live play and the headless replay are bit-identical.
 */
export function createController(
  cfg: SimConfig,
  rand: (n: number) => number,
  shuffle: (arr: number[]) => number[],
): Controller {
  const puzzle = generatePuzzle(cfg, rand);
  const board: Board = puzzle.board;
  const deal: PieceType[] = puzzle.queue.slice();
  let bag: number[] = [];
  let active: Active | null = null;
  let gravityAcc = 0;
  let lockTimer = 0;
  // Set by a drop input; makes the active piece fall fast (one cell per tick) and
  // commit on landing. Reset per piece in spawn(). The piece still descends cell
  // by cell - visibly - rather than teleporting to the floor.
  let fastFall = false;
  let lines = 0;
  let score = 0;
  let over = false;
  let passed = false;
  const das = {
    left: { timer: 0, charged: false },
    right: { timer: 0, charged: false },
  };

  function refill(): void {
    while (bag.length < PIECE_COUNT) bag.push(...shuffle([0, 1, 2, 3, 4, 5, 6]));
  }
  function nextType(): PieceType {
    if (deal.length > 0) return deal.shift() as PieceType;
    refill();
    return bag.shift() as PieceType;
  }
  function fits(a: Active): boolean {
    return !collides(board, pieceCells(a), cfg.cols, cfg.rows);
  }
  function spawn(): void {
    const type = nextType();
    const a: Active = { type, rot: 0, x: Math.floor((cfg.cols - 4) / 2), y: SPAWN_ROW };
    if (!fits(a)) {
      over = true;
      active = null;
      return;
    }
    active = a;
    gravityAcc = 0;
    lockTimer = 0;
    fastFall = false;
  }
  function shift(dx: number, dy: number): boolean {
    if (!active) return false;
    const n: Active = { ...active, x: active.x + dx, y: active.y + dy };
    if (fits(n)) {
      active = n;
      return true;
    }
    return false;
  }
  function rotate(dir: number): void {
    if (!active) return;
    const rot = (active.rot + dir + 4) % 4;
    for (const kick of KICKS) {
      const n: Active = { ...active, rot, x: active.x + kick };
      if (fits(n)) {
        active = n;
        return;
      }
    }
  }
  function settle(): number {
    if (!active) return 0;
    lockPiece(board, pieceCells(active), active.type);
    active = null;
    const cleared = clearFullRows(board, cfg.cols);
    if (cleared > 0) {
      score += lineScore(cleared);
      lines += cleared;
    }
    if (!passed && lines >= cfg.passLines) passed = true;
    return cleared;
  }
  function handleDir(side: 'left' | 'right', dx: number, held: boolean, pressed: boolean): void {
    const st = das[side];
    if (pressed) {
      shift(dx, 0);
      st.timer = 0;
      st.charged = false;
    } else if (held) {
      st.timer++;
      if (!st.charged) {
        if (st.timer >= DAS_DELAY) {
          st.charged = true;
          st.timer = 0;
        }
      } else if (st.timer >= ARR) {
        shift(dx, 0);
        st.timer = 0;
      }
    } else {
      st.timer = 0;
      st.charged = false;
    }
  }

  spawn();

  const state: ControllerState = {
    get board() {
      return board;
    },
    get active() {
      return active;
    },
    get score() {
      return score;
    },
    get lines() {
      return lines;
    },
    get over() {
      return over;
    },
    get passed() {
      return passed;
    },
  };

  return {
    state,
    step(input): StepResult {
      if (over) return { cleared: 0, locked: false };
      if (!active) {
        spawn();
        if (over || !active) return { cleared: 0, locked: false };
      }

      if (input.rotateCW) rotate(1);
      if (input.rotateCCW) rotate(-1);
      handleDir('left', -1, input.leftHeld, input.leftPressed);
      handleDir('right', 1, input.rightHeld, input.rightPressed);

      // A drop input engages a fast fall: the piece keeps descending one cell per
      // tick (visibly, not teleporting) until it lands, then commits.
      if (input.hardDrop) fastFall = true;

      const interval = fastFall
        ? FAST_FALL_INTERVAL
        : input.softHeld
          ? Math.min(cfg.gravity, SOFT_DROP_INTERVAL)
          : cfg.gravity;
      gravityAcc++;
      if (gravityAcc >= interval) {
        gravityAcc = 0;
        shift(0, 1);
      }

      if (active && !fits({ ...active, y: active.y + 1 })) {
        // On the floor: a fast fall commits at once; a gently-falling piece waits
        // out the lock delay so it can still be nudged at the last moment.
        if (fastFall || ++lockTimer >= cfg.lockDelay) return { cleared: settle(), locked: true };
      } else {
        lockTimer = 0;
      }
      return { cleared: 0, locked: false };
    },
  };
}
