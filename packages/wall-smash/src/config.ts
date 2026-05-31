// Configuration plumbing for Wall Smash.
//
// Maps the opaque, server-sourced config (a flat `Record<string, scalar>` the
// widget resolves from the manifest's snake_case keys) into the flat i32 array
// the Bevy sim reads (`SimConfig::from_ints` in sim.rs). THE single config
// transform site: both the live build (game.ts -> live.rs start) and the replay
// (run-core.ts -> ws_run) pass the SAME array into the SAME `from_ints`, so live
// play and server replay run identical params -> identical verdict.
//
// Missing/malformed keys fall back to the manifest `default` preset, then to the
// hardcoded literals (which mirror sim.rs::SimConfig::default), so the game still
// plays with config === null.

import { FP, TICK_HZ } from './constants.js';
import presetsJson from '../.caputchin/configurations.json';

export interface WallSmashConfig {
  /** Paddle width in world units. */
  paddleWidth: number;
  /** Ball speed in world units per second (converted to subunits/tick for the sim). */
  ballSpeed: number;
  /** Number of walls to clear, in order, to pass (clamped to the level table). */
  numLevels: number;
  lives: number;
  /** Solve budget in seconds (also bounds the replay tick loop -> bounds cost). */
  timeLimitSeconds: number;
}

// The default preset is identified by its `_default` flag, not a fixed name, so
// it can be renamed without breaking the fallbacks.
const PRESETS = (presetsJson.presets ?? {}) as Record<string, Record<string, unknown>>;
const DEFAULT_PRESET = (Object.values(PRESETS).find((p) => p && p['_default'] === true) ??
  {}) as Record<string, unknown>;

function jsonNumber(key: string, hardcoded: number): number {
  const v = DEFAULT_PRESET[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : hardcoded;
}

// Hardcoded literals mirror sim.rs::SimConfig::default (ball_speed 270 units/sec ==
// 4.5 units/tick == 1152 subunits/tick at FP=256, TICK_HZ=60).
const FALLBACK: WallSmashConfig = {
  paddleWidth: jsonNumber('paddle_width', 44),
  ballSpeed: jsonNumber('ball_speed', 270),
  numLevels: jsonNumber('num_levels', 2),
  lives: jsonNumber('lives', 3),
  timeLimitSeconds: jsonNumber('time_limit_seconds', 45),
};

export type RenderStyle = 'retro' | 'modern';

/** Resolve the render style (render-only; not part of the deterministic sim).
 *  game.ts hands it to the Bevy build to pick the 2D (retro) or 3D (modern) look. */
export function resolveRenderStyle(config: Record<string, unknown> | null | undefined): RenderStyle {
  const v = config?.['render_style'];
  return v === 'modern' ? 'modern' : 'retro';
}

function readNumber(cfg: Record<string, unknown> | null, key: string): number | null {
  if (!cfg) return null;
  const v = cfg[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Resolve the opaque config (or null) into a typed WallSmashConfig. */
export function resolveWallSmashConfig(
  config: Record<string, unknown> | null | undefined,
): WallSmashConfig {
  const c = (config ?? null) as Record<string, unknown> | null;
  return {
    paddleWidth: readNumber(c, 'paddle_width') ?? FALLBACK.paddleWidth,
    ballSpeed: readNumber(c, 'ball_speed') ?? FALLBACK.ballSpeed,
    numLevels: readNumber(c, 'num_levels') ?? FALLBACK.numLevels,
    lives: readNumber(c, 'lives') ?? FALLBACK.lives,
    timeLimitSeconds: readNumber(c, 'time_limit_seconds') ?? FALLBACK.timeLimitSeconds,
  };
}

/** The flat i32 array the Bevy sim reads. Order is the contract with
 *  `SimConfig::from_ints` (sim.rs): [paddle_w, ball_speed_sub, num_levels, lives,
 *  timeout_ticks]. Used by BOTH the live and headless builds. */
export function configToInts(config: Record<string, unknown> | null | undefined): Int32Array {
  const c = resolveWallSmashConfig(config);
  const ballSpeedSub = Math.round((c.ballSpeed * FP) / TICK_HZ);
  return Int32Array.from([
    Math.round(c.paddleWidth),
    ballSpeedSub,
    Math.round(c.numLevels),
    Math.round(c.lives),
    Math.round(c.timeLimitSeconds * TICK_HZ),
  ]);
}
