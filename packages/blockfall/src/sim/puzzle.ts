// The seeded starting puzzle. Blockfall does not start from an empty well; it
// starts as a near-complete "wall" with a few 2-wide, open-top slots cut into it.
// Dropping an O-piece ("key") into each slot completes the bottom `passLines`
// rows -> a clean, satisfying multi-line clear that ends the round in a handful
// of placements. The layout is a pure function of the round's seeded RNG, so the
// browser and the headless replay build the identical puzzle.
//
// Why this is ALWAYS solvable: each slot is a 2-wide vertical channel open to the
// top, and dropping an O fills the bottom 2 cells of that channel. With one O per
// slot in the deal queue (and the random bag behind it), completing every slot
// completes the bottom rows. Slots are separated by at least one filled column,
// so the wall reads as a wall, not a sieve.

import type { Board, PieceType, SimConfig } from './types.js';
import { createBoard } from './board.js';
import { WALL_ROWS, GAP_SLOTS_MIN, GAP_SLOTS_MAX } from './constants.js';

/** O is the square tetromino (index 1 in the piece table); a 2x2 "key". */
const O_PIECE: PieceType = 1;

export interface Puzzle {
  /** The starting wall, with open-top slots already carved. */
  readonly board: Board;
  /** Pieces dealt before the random bag takes over: one O "key" per slot. */
  readonly queue: PieceType[];
}

/**
 * Build the deterministic starting puzzle. `rand(n)` returns an integer in
 * `[0, n)` from the round's seeded RNG.
 */
export function generatePuzzle(cfg: SimConfig, rand: (n: number) => number): Puzzle {
  const board: Board = createBoard(cfg.cols, cfg.rows);
  const wallTop = Math.max(0, cfg.rows - WALL_ROWS);
  const clearRows = Math.min(cfg.passLines, WALL_ROWS); // rows the keys actually complete
  const keysPerSlot = Math.max(1, Math.ceil(clearRows / 2)); // each O covers 2 rows

  // Two-tone brick wall (seeded), distinct enough to read as masonry. The sim
  // only cares that a cell is non-zero; the value picks the render colour.
  const tintA: number = 1 + rand(7);
  let tintB: number = 1 + rand(7);
  if (tintB === tintA) tintB = 1 + (tintA % 7);
  for (let r = wallTop; r < cfg.rows; r++) {
    for (let c = 0; c < cfg.cols; c++) {
      board[r]![c] = (c + (r % 2)) % 2 === 0 ? tintA : tintB;
    }
  }

  // Candidate 2-wide slots, each separated from the next by a filled column
  // (step of 3), with a seeded 0/1 horizontal offset for variety.
  const offset = rand(2);
  const starts: number[] = [];
  for (let x = offset; x + 1 < cfg.cols; x += 3) starts.push(x);

  // How many slots to actually open: bounded so the wall keeps more filled
  // columns than gaps.
  const maxSlots = Math.min(GAP_SLOTS_MAX, starts.length, Math.floor(cfg.cols / 3));
  const minSlots = Math.min(GAP_SLOTS_MIN, maxSlots);
  const slotCount = minSlots + (maxSlots > minSlots ? rand(maxSlots - minSlots + 1) : 0);

  // Seeded selection of which candidate starts to open (Fisher-Yates prefix).
  const pool = starts.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }
  const chosen = pool.slice(0, slotCount).sort((a, b) => a - b);

  const queue: PieceType[] = [];
  for (const x of chosen) {
    // Carve a 2-wide channel through the whole wall (open to the top); the key
    // fills only the bottom `clearRows`, leaving the upper wall decorative.
    for (let r = wallTop; r < cfg.rows; r++) {
      board[r]![x] = 0;
      board[r]![x + 1] = 0;
    }
    for (let i = 0; i < keysPerSlot; i++) queue.push(O_PIECE);
  }

  return { board, queue };
}
