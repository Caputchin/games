// The sim's default config (ADR-0069). Single source for both live driver
// and replay run, so live play and server replay execute under identical
// params → identical verdict. Values mirror caputchin.json `default` preset.

import manifestJson from '../../caputchin.json';
import type { SimConfig } from './types.js';

const DEFAULT_PRESET = (manifestJson.configurations?.presets?.default ?? {}) as Record<string, unknown>;

function jsonNumber(key: string, hardcoded: number): number {
  const v = DEFAULT_PRESET[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : hardcoded;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export const DEFAULT_SIM_CONFIG: SimConfig = {
  passHits: Math.max(3, Math.min(30, Math.round(jsonNumber('pass_hits', 10)))),
  baseUptimeMs: clamp(jsonNumber('base_uptime_ms', 800), 350, 2000),
  baseDecoyChance: clamp(jsonNumber('base_decoy_chance', 0.1), 0, 0.5),
  seconds: Math.max(5, Math.min(90, Math.round(jsonNumber('seconds', 25)))),
};
