// Plain, JSON-serializable sim shapes. Everything here is integer math so it is
// bit-identical in the browser and in the headless replay.

/** One of the seven tetromino kinds (index into the piece table). */
export type PieceType = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** The falling piece: kind, rotation state (0-3), and top-left of its 4x4 box. */
export interface Active {
  type: PieceType;
  rot: number;
  x: number;
  y: number;
}

/** The locked field: `board[row][col]`, 0 empty or `pieceType + 1`. */
export type Board = number[][];

/** Resolved, clamped gameplay parameters for one round. */
export interface SimConfig {
  cols: number;
  rows: number;
  passLines: number;
  /** Ticks per cell of natural fall. Gentle; hard drop / tap-to-place does the placing. */
  gravity: number;
  lockDelay: number;
  /** Site default for sound effects (browser-only; never affects the verdict). */
  sound: boolean;
}
