// One transform site: the RAW server-resolved dashboard config (snake_case
// scalar map, or null) -> the sim's clamped SimConfig. Live play and replay both
// call this with the same raw object, so they cannot diverge. Unknown shape is
// never trusted - every field is validated + clamped, null resolves to defaults.

import { DEFAULT_CLEAR_PERCENT, DEFAULT_GHOSTS } from './constants.js';
import type { SimConfig } from './types.js';

function int(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function resolveSimConfig(raw: Record<string, unknown> | null): SimConfig {
  const cfg = raw ?? {};
  return {
    clearPercent: int(cfg['clear_percent'], DEFAULT_CLEAR_PERCENT, 10, 100),
    ghosts: int(cfg['ghosts'], DEFAULT_GHOSTS, 1, 4),
  };
}
