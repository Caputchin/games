// Pure difficulty ladder. The round runs through LEVEL_COUNT discrete levels,
// each faster, briefer, and more decoy-heavy than the last (no intra-level
// sub-ramp, by design). Clearing a level means hitting its per-level monkey
// goal; the goals sum to the configured passHits, so clearing the final level
// is exactly reaching the pass goal. Kept pure + unit-tested (tests/levels.test.ts).

import {
  BASE_SPAWN_RATE,
  DECOY_ADD_PER_LVL,
  DECOY_CAP,
  LEVEL_COUNT,
  MIN_UPTIME_FLOOR_MS,
  RATE_PER_LEVEL,
  UPTIME_SHRINK_PER_LVL,
} from './constants.js';

export interface LevelParams {
  /** Monkeys + decoys launched per second this level. */
  spawnRate: number;
  /** How long a mole stays up before ducking (ms). */
  uptimeMs: number;
  /** Probability a spawned mole is a decoy, 0..1. */
  decoyChance: number;
  /** Good hits needed to clear this level. */
  goal: number;
}

export interface LadderBase {
  /** Level-1 mole uptime (ms), from the resolved config (difficulty preset). */
  baseUptimeMs: number;
  /** Level-1 decoy chance, from the resolved config. */
  baseDecoyChance: number;
  /** Total monkeys to hit to pass, from the resolved config. */
  passHits: number;
}

/** Split `passHits` into LEVEL_COUNT per-level goals that sum to passHits, each
 *  at least 1, with any remainder landing on the final (longest) level. */
function splitGoals(passHits: number): number[] {
  const total = Math.max(LEVEL_COUNT, Math.round(passHits));
  const base = Math.floor(total / LEVEL_COUNT);
  const goals: number[] = [];
  for (let i = 0; i < LEVEL_COUNT; i++) {
    goals.push(i === LEVEL_COUNT - 1 ? total - base * (LEVEL_COUNT - 1) : base);
  }
  return goals;
}

/** Build the per-level params. Level index 0..LEVEL_COUNT-1. Monotonic by
 *  construction: spawn rate climbs, uptime shrinks (floored), decoy chance
 *  climbs (capped). */
export function buildLadder(base: LadderBase): LevelParams[] {
  const goals = splitGoals(base.passHits);
  const levels: LevelParams[] = [];
  for (let n = 0; n < LEVEL_COUNT; n++) {
    levels.push({
      spawnRate: BASE_SPAWN_RATE * (1 + RATE_PER_LEVEL * n),
      uptimeMs: Math.max(MIN_UPTIME_FLOOR_MS, base.baseUptimeMs * (1 - UPTIME_SHRINK_PER_LVL * n)),
      decoyChance: Math.min(DECOY_CAP, base.baseDecoyChance + DECOY_ADD_PER_LVL * n),
      goal: goals[n]!,
    });
  }
  return levels;
}
