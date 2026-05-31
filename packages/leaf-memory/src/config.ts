// Configuration plumbing for Leaf Memory.
//
// Maps the RAW dashboard config payload (a flat `Record<string, scalar>`
// resolved by the widget from caputchin.json) into a typed `LeafMemoryConfig`
// the game can apply directly. Takes the raw config object (or `null`) so the
// SAME resolver serves the live driver (display ladder + level navigation) and
// the headless engine (which calls it inside `init` to derive the sim params) -
// one transform site, no live/replay divergence. Missing or malformed keys
// fall back to the hardcoded defaults below, which mirror the `default` preset
// in caputchin.json so the game still plays sensibly with `config === null`
// (e.g. authors who haven't shipped a configurations block).
//
// Per-level fields are flat (e.g. `memorize_seconds_level_3`) rather than
// nested because the schema DSL doesn't support nested objects.

import manifestJson from '../caputchin.json';
import { DIFFICULTY_LADDER, MAX_LEVEL, type DifficultyLevel } from './difficulty.js';

export interface LeafMemoryConfig {
  /** 0-based index into the effective ladder where the first round begins. */
  startIndex: number;
  /** Effective level ladder. Each entry preserves the static layout fields
   *  (pairs / cols / rows) and applies per-level timing overrides. */
  levels: readonly DifficultyLevel[];
  showHighScore: boolean;
  showLevelIndicator: boolean;
  mismatchFlipBackMs: number;
}

/** Fallback values if the widget passes no config payload. Derived from
 *  the JSON's `default` preset at module init so the two sources can't
 *  drift: editing caputchin.json automatically refreshes these. Hardcoded
 *  literals only kick in if the JSON itself is missing the field. Same
 *  pattern as widget skin / widget-config shells. */
const DEFAULT_PRESET = (manifestJson.configurations?.presets?.default ?? {}) as Record<string, unknown>;
function jsonNumber(key: string, hardcoded: number): number {
  const v = DEFAULT_PRESET[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : hardcoded;
}
function jsonBoolean(key: string, hardcoded: boolean): boolean {
  const v = DEFAULT_PRESET[key];
  return typeof v === 'boolean' ? v : hardcoded;
}
const FALLBACK = {
  startIndex: Math.max(0, Math.min(MAX_LEVEL - 1, Math.round(jsonNumber('start_level', 1)) - 1)),
  showHighScore: jsonBoolean('show_high_score', true),
  showLevelIndicator: jsonBoolean('show_level_indicator', true),
  mismatchFlipBackMs: jsonNumber('mismatch_flip_back_ms', 600),
};

function readNumber(cfg: Record<string, unknown> | null, key: string): number | null {
  if (!cfg) return null;
  const v = cfg[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function readBoolean(cfg: Record<string, unknown> | null, key: string): boolean | null {
  if (!cfg) return null;
  const v = cfg[key];
  return typeof v === 'boolean' ? v : null;
}

export function resolveLeafMemoryConfig(
  config: Record<string, unknown> | null | undefined,
): LeafMemoryConfig {
  const cfg = (config ?? null) as Record<string, unknown> | null;

  const startLevel = readNumber(cfg, 'start_level');
  const startIndex = startLevel === null
    ? FALLBACK.startIndex
    : Math.max(0, Math.min(MAX_LEVEL - 1, Math.round(startLevel) - 1));

  const levels = DIFFICULTY_LADDER.map((level) => {
    const peekSeconds = readNumber(cfg, `memorize_seconds_level_${level.level}`);
    const solveSeconds = readNumber(cfg, `solve_seconds_level_${level.level}`);
    return {
      ...level,
      peekMs: peekSeconds === null ? level.peekMs : Math.round(peekSeconds * 1000),
      timeSec: solveSeconds === null ? level.timeSec : solveSeconds,
    };
  });

  return {
    startIndex,
    levels,
    showHighScore: readBoolean(cfg, 'show_high_score') ?? FALLBACK.showHighScore,
    showLevelIndicator: readBoolean(cfg, 'show_level_indicator') ?? FALLBACK.showLevelIndicator,
    mismatchFlipBackMs: readNumber(cfg, 'mismatch_flip_back_ms') ?? FALLBACK.mismatchFlipBackMs,
  };
}
