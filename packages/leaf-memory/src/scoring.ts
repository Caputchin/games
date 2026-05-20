// Internal scoring rubric for Leaf Memory.
//
// score = difficulty × (maxTime − elapsedSec)
// difficulty = pairs / 2
// maxTime is per-level (see DIFFICULTY_LADDER in difficulty.ts), no
// longer derived from pairs — earlier levels get tight budgets so 2×2
// doesn't drag, later levels get enough room to recover from mistakes.
//
// L1 2×2 (2 pairs, 1 difficulty,   10s) → score range [0, 10]
// L2 3×2 (3 pairs, 1.5 difficulty, 20s) → score range [0, 30]
// L3 4×2 (4 pairs, 2 difficulty,   35s) → score range [0, 70]
// L4 4×3 (6 pairs, 3 difficulty,   60s) → score range [0, 180]
//
// If elapsedSec ≥ maxTime, the round is a timeout. The game does NOT
// call bridge.pass — silence is the failure signal per ADR-0030.

export function difficultyForPairs(pairs: number): number {
  return pairs / 2;
}

export function isWithinTimeBudget(maxTimeSec: number, elapsedSec: number): boolean {
  return elapsedSec < maxTimeSec;
}

export function score(pairs: number, maxTimeSec: number, elapsedSec: number): number {
  const difficulty = difficultyForPairs(pairs);
  const remaining = maxTimeSec - elapsedSec;
  return difficulty * remaining;
}
