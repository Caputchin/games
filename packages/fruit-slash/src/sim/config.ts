// The sim's default config. This is the SINGLE source both the live
// driver (engine.init) and the replay run (toRun's defaultConfig) use, so live
// play and server replay execute under identical gameplay params -> identical
// verdict. Values mirror the caputchin.json `default` preset; the in-code
// fallbacks guard against a manifest edit dropping a key.
//
// At MVP the server passes `null` config to `run`, so `defaultConfig` is what
// actually runs; per-site server config injection is a deferred phase (the run
// already accepts it as an input, so that phase is server-only).

import manifestJson from '../../caputchin.json';
import { GRAVITY } from './constants.js';
import type { SimConfig } from './types.js';

const DEFAULT_PRESET = (manifestJson.configurations?.presets?.default ?? {}) as Record<string, unknown>;

function jsonNumber(key: string, hardcoded: number): number {
  const v = DEFAULT_PRESET[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : hardcoded;
}

/** Clamp + round the same way the live driver resolves config, so the sim
 *  defaults are exactly the values the round runs under. */
function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export const DEFAULT_SIM_CONFIG: SimConfig = {
  passScore: Math.max(1, Math.round(jsonNumber('pass_score', 8))),
  lives: Math.max(1, Math.round(jsonNumber('lives', 3))),
  spawnRate: clamp(jsonNumber('spawn_rate', 0.9), 0.1, 5),
  gravity: clamp(jsonNumber('gravity', GRAVITY), 200, 4000),
  hazardChance: clamp(jsonNumber('hazard_chance', 0.18), 0, 1),
};
