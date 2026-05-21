// Configuration plumbing for Leaf Memory.
//
// Maps the runtime `ctx.config` payload (a flat `Record<string, scalar>`
// resolved by the widget from caputchin.json) into a typed `LeafMemoryConfig`
// the game can apply directly. Missing or malformed keys fall back to the
// hardcoded defaults below, which mirror the `default` preset in
// caputchin.json so the game still plays sensibly with `ctx.config === null`
// (e.g. authors who haven't shipped a configurations block).
//
// Per-level fields are flat (e.g. `memorize_seconds_level_3`) rather than
// nested because the schema DSL doesn't support nested objects.

import type { GameContext } from '@caputchin/game-sdk';
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

/** Fallback values if the widget passes no config payload. Mirror the
 *  `default` preset in caputchin.json. */
const FALLBACK = {
  startIndex: 0,
  showHighScore: true,
  showLevelIndicator: true,
  mismatchFlipBackMs: 600,
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

export function resolveLeafMemoryConfig(ctx: GameContext | undefined): LeafMemoryConfig {
  const cfg = (ctx?.config ?? null) as Record<string, unknown> | null;

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
