import { describe, it, expect } from 'vitest';
import { createBoard, pieceCells, collides, lockPiece, clearFullRows } from '../src/sim/board.js';
import type { Active } from '../src/sim/types.js';

describe('board', () => {
  it('creates a rows x cols field of zeros', () => {
    const b = createBoard(4, 3);
    expect(b.length).toBe(3);
    expect(b[0]!.length).toBe(4);
    expect(b.flat().every((c) => c === 0)).toBe(true);
  });

  it('pieceCells offsets the piece template by its position', () => {
    const a: Active = { type: 1, rot: 0, x: 2, y: 3 }; // O piece
    const cells = pieceCells(a);
    expect(cells).toContainEqual([3, 3]);
    expect(cells).toContainEqual([4, 4]);
    expect(cells.length).toBe(4);
  });

  it('collides with walls, floor, and filled cells but allows overhang above the top', () => {
    const b = createBoard(4, 4);
    b[3]![1] = 1; // a filled floor cell
    expect(collides(b, [[-1, 0]], 4, 4)).toBe(true); // left wall
    expect(collides(b, [[4, 0]], 4, 4)).toBe(true); // right wall
    expect(collides(b, [[0, 4]], 4, 4)).toBe(true); // floor
    expect(collides(b, [[1, 3]], 4, 4)).toBe(true); // filled
    expect(collides(b, [[0, -2]], 4, 4)).toBe(false); // above the top is allowed
    expect(collides(b, [[0, 0]], 4, 4)).toBe(false); // empty
  });

  it('locks a piece into the field as type + 1', () => {
    const b = createBoard(4, 4);
    lockPiece(b, [[0, 0], [1, 0]], 5);
    expect(b[0]![0]).toBe(6);
    expect(b[0]![1]).toBe(6);
  });

  it('clears full rows and shifts the stack down', () => {
    const b = createBoard(3, 4);
    b[3] = [1, 1, 1]; // full bottom row
    b[2]![0] = 2; // a cell above
    const cleared = clearFullRows(b, 3);
    expect(cleared).toBe(1);
    expect(b.length).toBe(4); // height preserved
    expect(b[3]![0]).toBe(2); // the cell above dropped into the cleared row
    expect(b[0]!.every((c) => c === 0)).toBe(true); // new empty row on top
  });

  it('clears multiple full rows at once', () => {
    const b = createBoard(2, 4);
    b[2] = [1, 1];
    b[3] = [1, 1];
    expect(clearFullRows(b, 2)).toBe(2);
    expect(b.flat().every((c) => c === 0)).toBe(true);
  });
});
