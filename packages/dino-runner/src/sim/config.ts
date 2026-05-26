// The sim's default config (ADR-0069). Single source used by both the live
// driver (engine.init) and the replay run (toRun's defaultConfig), so live play
// and server replay execute under identical gameplay params -> identical verdict.
// Values mirror the caputchin.json `default` preset; the in-code fallbacks guard
// against a manifest edit dropping a key.
//
// At MVP the server passes `null` config to `run`, so `defaultConfig` is what
// actually runs; per-site server config injection is a deferred phase.

import manifestJson from '../../caputchin.json';
import type { SimConfig } from './types.js';

const DEFAULT_PRESET = (manifestJson.configurations?.presets?.default ?? {}) as Record<string, unknown>;

function jsonNumber(key: string, hardcoded: number): number {
  const v = DEFAULT_PRESET[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : hardcoded;
}

function jsonBoolean(key: string, hardcoded: boolean): boolean {
  const v = DEFAULT_PRESET[key];
  return typeof v === 'boolean' ? v : hardcoded;
}

/** Hard-coded fallback values for the two physics constants shared with the
 *  render layer (JUMP object in constants.ts). Exported so constants.ts imports
 *  them instead of re-typing the same literals. */
export const DEFAULT_GRAVITY = 0.6;
export const DEFAULT_JUMP_VELOCITY = 10;

export const DEFAULT_SIM_CONFIG: SimConfig = {
  passScore: jsonNumber('pass_score', 100),
  startSpeed: jsonNumber('start_speed', 6),
  maxSpeed: jsonNumber('max_speed', 13),
  acceleration: jsonNumber('acceleration', 0.0022),
  gravity: jsonNumber('gravity', DEFAULT_GRAVITY),
  jumpVelocity: jsonNumber('jump_velocity', DEFAULT_JUMP_VELOCITY),
  gapCoefficient: jsonNumber('gap_coefficient', 0.6),
  birdsEnabled: jsonBoolean('birds_enabled', true),
  birdMinSpeed: jsonNumber('bird_min_speed', 7),
};
