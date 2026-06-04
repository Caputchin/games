// Configuration plumbing for Voidshot.
//
// Maps the opaque, server-sourced config (a flat `Record<string, scalar>` the
// widget resolves from the manifest's snake_case keys) into the flat i32 array
// the rapier3d sim reads (`SimConfig::from_ints` in config.rs). THE single config
// transform site: both the live build (driver -> live_new) and the replay
// (run.ts -> @caputchin/replay-wasm runWithModule -> cap_run) pass the SAME array
// into the SAME `from_ints`, so live play and server replay run identical params
// -> identical verdict.
//
// Missing/malformed keys fall back to the manifest `default` preset, then to the
// hardcoded literals (which mirror config.rs::SimConfig::default), so the game
// still plays with config === null.

import presetsJson from '../.caputchin/configurations.json';
import { TICK_HZ } from './constants.js';

export interface VoidshotConfig {
  /** Seeded waves to clear to win. */
  waveCount: number;
  /** Base enemies per wave (wave `w` spawns `enemiesPerWave + w`). */
  enemiesPerWave: number;
  /** Enemy seek speed in world units/sec. */
  enemySpeed: number;
  /** Player shield hit points. */
  shieldHits: number;
  /** Solve budget in seconds (also bounds the replay tick loop -> bounds cost). */
  timeLimitSeconds: number;
  /** Whether SFX play (render-only; never touches the sim). */
  sound: boolean;
}

// The default preset is identified by its `_default` flag, not a fixed name.
const PRESETS = (presetsJson.presets ?? {}) as Record<string, Record<string, unknown>>;
const DEFAULT_PRESET = (Object.values(PRESETS).find((p) => p && p['_default'] === true) ??
  {}) as Record<string, unknown>;

function jsonNumber(key: string, hardcoded: number): number {
  const v = DEFAULT_PRESET[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : hardcoded;
}
function jsonBool(key: string, hardcoded: boolean): boolean {
  const v = DEFAULT_PRESET[key];
  return typeof v === 'boolean' ? v : hardcoded;
}

// Hardcoded literals mirror config.rs::SimConfig::default.
const FALLBACK: VoidshotConfig = {
  waveCount: jsonNumber('wave_count', 2),
  enemiesPerWave: jsonNumber('enemies_per_wave', 5),
  enemySpeed: jsonNumber('enemy_speed', 3.5),
  shieldHits: jsonNumber('shield_hits', 3),
  timeLimitSeconds: jsonNumber('time_limit_seconds', 60),
  sound: jsonBool('sound', true),
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

/** Resolve the opaque config (or null) into a typed VoidshotConfig. */
export function resolveConfig(
  config: Record<string, unknown> | null | undefined,
): VoidshotConfig {
  const c = (config ?? null) as Record<string, unknown> | null;
  return {
    waveCount: readNumber(c, 'wave_count') ?? FALLBACK.waveCount,
    enemiesPerWave: readNumber(c, 'enemies_per_wave') ?? FALLBACK.enemiesPerWave,
    enemySpeed: readNumber(c, 'enemy_speed') ?? FALLBACK.enemySpeed,
    shieldHits: readNumber(c, 'shield_hits') ?? FALLBACK.shieldHits,
    timeLimitSeconds: readNumber(c, 'time_limit_seconds') ?? FALLBACK.timeLimitSeconds,
    sound: readBoolean(c, 'sound') ?? FALLBACK.sound,
  };
}

/** Whether SFX should play (render-only). */
export function soundEnabled(config: Record<string, unknown> | null | undefined): boolean {
  return resolveConfig(config).sound;
}

/** The flat i32 array the rapier3d sim reads. Order is the contract with
 *  `SimConfig::from_ints` (config.rs): [wave_count, enemies_per_wave,
 *  enemy_speed_milli, shield_hits, time_limit_ticks]. Used by BOTH the live and
 *  headless builds. */
export function configToInts(config: Record<string, unknown> | null | undefined): Int32Array {
  const c = resolveConfig(config);
  return Int32Array.from([
    Math.round(c.waveCount),
    Math.round(c.enemiesPerWave),
    Math.round(c.enemySpeed * 1000),
    Math.round(c.shieldHits),
    Math.round(c.timeLimitSeconds * TICK_HZ),
  ]);
}
