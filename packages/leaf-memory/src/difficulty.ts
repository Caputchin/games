// Difficulty ladder for Leaf Memory.
//
// Each level binds a pairs count (drives scoring + board sizing) to a
// cols × rows grid layout. The top-level grid (L4: 3×4) sets the fixed
// stage footprint in styles.ts; smaller grids center inside it so the
// iframe never resizes between levels.

export interface DifficultyLevel {
  level: 1 | 2 | 3 | 4;
  pairs: number;
  cols: number;
  rows: number;
  /** How long the cards stay revealed at the start of the round so the
   *  player can memorize positions. Scales with card count: 4 cards =
   *  short glance, 12 cards = enough to plan a strategy. */
  peekMs: number;
  /** Round time budget in seconds. Tuned per level — 2×2 is trivial so
   *  10s is plenty; 3×4 wants enough time to recover from a couple of
   *  early mismatches. */
  timeSec: number;
}

export const DIFFICULTY_LADDER: readonly DifficultyLevel[] = [
  { level: 1, pairs: 2, cols: 2, rows: 2, peekMs: 800,  timeSec: 10 },
  { level: 2, pairs: 3, cols: 3, rows: 2, peekMs: 1200, timeSec: 20 },
  { level: 3, pairs: 4, cols: 4, rows: 2, peekMs: 1800, timeSec: 35 },
  { level: 4, pairs: 6, cols: 4, rows: 3, peekMs: 2500, timeSec: 60 },
];

export const MAX_LEVEL = DIFFICULTY_LADDER.length;

export function levelAt(index: number): DifficultyLevel {
  const entry = DIFFICULTY_LADDER[index];
  if (!entry) {
    throw new Error(`leaf-memory: no difficulty at index ${index}`);
  }
  return entry;
}
