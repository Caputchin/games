// SimConfig derivation for Leaf Memory. The RAW dashboard config (or null) is
// turned into the level's SimConfig HERE, in one place: `engine.init` calls
// `resolveSimConfig`, and both the live driver and the headless replay reach
// the engine through that same `init`, so the sim params can never drift
// between play and verification. The gate reads pairs/budgetTicks from this
// resolved config - never from the trace.

import { FIXED_TIMESTEP_MS } from './constants.js';
import type { SimConfig } from './types.js';
import { resolveLeafMemoryConfig } from '../config.js';

/** Build a SimConfig from the human-readable per-level knobs so the
 *  conversion stays in one place. flipBackMs = mismatch flip-back delay. */
export function makeSimConfig(pairs: number, timeSec: number, flipBackMs: number): SimConfig {
  return {
    pairs,
    budgetTicks: Math.round((timeSec * 1000) / FIXED_TIMESTEP_MS),
    flipBackTicks: Math.ceil(flipBackMs / FIXED_TIMESTEP_MS),
  };
}

/** Resolve the RAW dashboard config (or null) into the SimConfig for the level
 *  selected by `start_level`. `null` resolves to L1 defaults via the shared
 *  resolver, so a replay with no config matches a live game with no config.
 *  This is the SINGLE config->sim transform site for both execution paths. */
export function resolveSimConfig(raw: Record<string, unknown> | null): SimConfig {
  const resolved = resolveLeafMemoryConfig(raw);
  const level = resolved.levels[resolved.startIndex]!;
  return makeSimConfig(level.pairs, level.timeSec, resolved.mismatchFlipBackMs);
}
