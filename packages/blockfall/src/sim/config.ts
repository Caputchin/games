// The SINGLE site where the raw, server-resolved dashboard config (or null) is
// turned into the round's SimConfig. Both live play and the headless replay call
// this with the same raw config, so they cannot diverge. Every field is clamped;
// a missing or out-of-range value falls back to the default.

import type { SimConfig } from './types.js';
import { DEFAULT_COLS, DEFAULT_ROWS, DEFAULT_PASS_LINES, GRAVITY, LOCK_DELAY } from './constants.js';

type Raw = Record<string, unknown> | null;

function num(raw: Raw, key: string, def: number, min: number, max: number): number {
  const v = raw?.[key];
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : def;
  return Math.max(min, Math.min(max, n));
}

function bool(raw: Raw, key: string, def: boolean): boolean {
  const v = raw?.[key];
  return typeof v === 'boolean' ? v : def;
}

export function resolveSimConfig(raw: Raw): SimConfig {
  const cols = num(raw, 'cols', DEFAULT_COLS, 6, 12);
  const rows = num(raw, 'rows', DEFAULT_ROWS, 7, 16);
  return {
    cols,
    rows,
    // Clear this many rows to win. Capped to the wall depth in the generator.
    passLines: num(raw, 'pass_lines', DEFAULT_PASS_LINES, 1, 4),
    gravity: num(raw, 'gravity', GRAVITY, 4, 60),
    lockDelay: num(raw, 'lock_delay', LOCK_DELAY, 0, 60),
    sound: bool(raw, 'sound', true),
  };
}
