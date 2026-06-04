// Connectivity gate (the maze.ts comment promises this). A stranded pellet =
// an unwinnable round = a false-reject of a real player, so every pellet AND
// every chaser spawn must be reachable from the runner spawn. BFS over open
// cells, per maze. Guards future maze edits in CI.

import { describe, it, expect } from 'vitest';
import { parseMaze, isOpen, mazeCount, generateMaze } from '../src/sim/maze.js';
import { rng, type Seed } from '@caputchin/preset-melonjs';

const STEPS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

function reachable(
  start: { cx: number; cy: number },
  walls: readonly boolean[],
  cols: number,
  rows: number,
): Set<number> {
  const seen = new Set<number>([start.cy * cols + start.cx]);
  const queue: number[] = [start.cy * cols + start.cx];
  while (queue.length > 0) {
    const idx = queue.shift() as number;
    const cx = idx % cols;
    const cy = Math.floor(idx / cols);
    for (const step of STEPS) {
      const nx = cx + step[0];
      const ny = cy + step[1];
      if (!isOpen(walls, cols, rows, nx, ny)) continue;
      const ni = ny * cols + nx;
      if (!seen.has(ni)) {
        seen.add(ni);
        queue.push(ni);
      }
    }
  }
  return seen;
}

describe('Monkey Maze mazes - connectivity (no unwinnable round)', () => {
  for (let id = 0; id < mazeCount(); id += 1) {
    it(`maze ${id}: every pellet + chaser spawn reachable from the runner spawn`, () => {
      const m = parseMaze(id);
      const seen = reachable(m.runnerSpawn, m.walls, m.cols, m.rows);

      let pelletCount = 0;
      for (let i = 0; i < m.pellets.length; i += 1) {
        const p = m.pellets[i] ?? 0;
        if (p > 0) {
          pelletCount += 1;
          expect(seen.has(i), `maze ${id}: pellet at cell ${i} is unreachable`).toBe(true);
        }
      }

      for (const g of m.ghostSpawns) {
        expect(seen.has(g.cy * m.cols + g.cx), `maze ${id}: chaser spawn unreachable`).toBe(true);
      }

      expect(m.pelletsLeft, `maze ${id}: pelletsLeft must equal pellet count`).toBe(pelletCount);
    });
  }
});

describe('Monkey Maze generated mazes - every seed connected + well-formed', () => {
  for (let s = 0; s < 40; s += 1) {
    it(`seed ${s}: all pellets + chaser pen reachable, 4 power dots`, () => {
      const seed = [s + 1, s * 7 + 3, s * 13 + 5, s * 97 + 11] as unknown as Seed;
      const r = rng(seed);
      const m = generateMaze(() => r.next());

      const seen = reachable(m.runnerSpawn, m.walls, m.cols, m.rows);
      let pelletCount = 0;
      let powerCount = 0;
      for (let i = 0; i < m.pellets.length; i += 1) {
        const p = m.pellets[i] ?? 0;
        if (p > 0) {
          pelletCount += 1;
          if (p === 2) powerCount += 1;
          expect(seen.has(i), `seed ${s}: pellet at cell ${i} unreachable (unwinnable round)`).toBe(true);
        }
      }
      for (const g of m.ghostSpawns) {
        expect(seen.has(g.cy * m.cols + g.cx), `seed ${s}: chaser pen unreachable`).toBe(true);
      }
      expect(m.pelletsLeft, `seed ${s}: pelletsLeft must equal pellet count`).toBe(pelletCount);
      expect(powerCount, `seed ${s}: expected 4 power dots`).toBe(4);
      expect(pelletCount, `seed ${s}: maze should hold a meaningful dot count`).toBeGreaterThan(40);
    });
  }
});
