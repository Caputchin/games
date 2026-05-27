// Default SimConfig for Leaf Memory. Mirrors the L1 (2-pair) defaults
// from DIFFICULTY_LADDER so MVP runs (config=null) use the canonical
// easiest level. The gate reads pairs/budgetTicks from this config -
// never from the trace.

import { FIXED_TIMESTEP_MS } from './constants.js';
import type { SimConfig } from './types.js';

/** Build a SimConfig from the human-readable per-level knobs so the
 *  conversion stays in one place. flipBackMs = mismatch flip-back delay. */
export function makeSimConfig(pairs: number, timeSec: number, flipBackMs: number): SimConfig {
  return {
    pairs,
    budgetTicks: Math.round((timeSec * 1000) / FIXED_TIMESTEP_MS),
    flipBackTicks: Math.ceil(flipBackMs / FIXED_TIMESTEP_MS),
  };
}

/** Default config = L1 (2 pairs, 5s budget, 600ms flip-back).
 *  Server passes null until per-site config injection (Phase 11). */
export const DEFAULT_SIM_CONFIG: SimConfig = makeSimConfig(2, 5, 600);
