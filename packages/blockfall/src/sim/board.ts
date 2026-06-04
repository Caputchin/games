import type { Active, Board, PieceType } from './types.js';
import { PIECES } from './pieces.js';

/** A `rows x cols` field of zeros (empty). */
export function createBoard(cols: number, rows: number): Board {
  const board: Board = [];
  for (let r = 0; r < rows; r++) board.push(new Array<number>(cols).fill(0));
  return board;
}

/** Absolute [col, row] cells of a piece in its current position. */
export function pieceCells(a: Active): [number, number][] {
  return PIECES[a.type]![a.rot & 3]!.map(([dx, dy]) => [a.x + dx, a.y + dy] as [number, number]);
}

/**
 * Whether `cells` collide with the walls, floor, or a locked cell. Cells above
 * the field (row < 0) are allowed (spawn / rotation overhang); only the floor,
 * the side walls, and filled cells block.
 */
export function collides(board: Board, cells: readonly (readonly [number, number])[], cols: number, rows: number): boolean {
  for (const [x, y] of cells) {
    if (x < 0 || x >= cols || y >= rows) return true;
    if (y >= 0 && board[y]![x] !== 0) return true;
  }
  return false;
}

/** Write a piece's cells into the field as `type + 1`. */
export function lockPiece(board: Board, cells: readonly (readonly [number, number])[], type: PieceType): void {
  for (const [x, y] of cells) {
    if (y >= 0 && y < board.length && x >= 0 && x < board[0]!.length) board[y]![x] = type + 1;
  }
}

/** Remove every full row in place and prepend empty rows; returns the count cleared. */
export function clearFullRows(board: Board, cols: number): number {
  let cleared = 0;
  for (let r = board.length - 1; r >= 0; r--) {
    if (board[r]!.every((c) => c !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array<number>(cols).fill(0));
      cleared++;
      r++; // re-check the row that shifted down into r
    }
  }
  return cleared;
}
