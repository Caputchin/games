// Internal scoring rubric for Leaf Memory.
//
// score = difficulty × (maxTime − elapsedSec)
// maxTime = difficulty × 30 seconds
// difficulty = pairs / 2
//
// 2×2 grid (1 difficulty) → maxTime 30s → score range [0, 30]
// 3×4 grid (3 difficulty) → maxTime 90s → score range [0, 270]
// 4×4 grid (4 difficulty) → maxTime 120s → score range [0, 480]
//
// If elapsedSec ≥ maxTime, the round is a timeout. The game does NOT
// call bridge.pass — silence is the failure signal per ADR-0030.

export const SECONDS_PER_DIFFICULTY = 30;

export function difficultyForPairs(pairs: number): number {
  return pairs / 2;
}

export function maxTimeSec(pairs: number): number {
  return difficultyForPairs(pairs) * SECONDS_PER_DIFFICULTY;
}

export function isWithinTimeBudget(pairs: number, elapsedSec: number): boolean {
  return elapsedSec < maxTimeSec(pairs);
}

export function score(pairs: number, elapsedSec: number): number {
  const difficulty = difficultyForPairs(pairs);
  const remaining = maxTimeSec(pairs) - elapsedSec;
  return difficulty * remaining;
}
