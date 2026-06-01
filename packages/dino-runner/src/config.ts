// Configuration plumbing for Dino Runner.
//
// Maps the RAW dashboard config payload (a flat `Record<string, scalar>`
// resolved by the widget from caputchin.json) into a typed `DinoConfig` (the
// display/render resolution) and, via resolveSimConfig, into the headless
// `SimConfig` the engine runs under. Both resolvers take the raw config object
// (or `null`) directly, so the SAME code serves the live driver and the
// headless engine (which calls resolveSimConfig inside init) - one transform
// site, no live/replay divergence. Missing or malformed keys fall back to the
// hardcoded defaults below, which mirror the `default` preset in caputchin.json
// so the game still plays sensibly with `config === null` (e.g. a manifest
// shipped without a configurations block).

import configurationsJson from '../.caputchin/configurations.json';
import { SPEED, JUMP, GAP_COEFFICIENT } from './constants.js';
import type { SimConfig } from './sim/types.js';

export interface DinoConfig {
  startSpeed: number;
  maxSpeed: number;
  acceleration: number;
  gravity: number;
  /** Stored negated (upward is negative y), ready for the engine. The
   *  manifest exposes a positive `jump_velocity` magnitude for authors. */
  initialJumpVelocity: number;
  gapCoefficient: number;
  passScore: number;
  birdsEnabled: boolean;
  birdMinSpeed: number;
  showScore: boolean;
  showBest: boolean;
  sound: boolean;
}

// Defaults derived from the JSON `default` preset at module init so the two
// sources can't drift: editing caputchin.json automatically refreshes these.
// The hardcoded literals only kick in if the JSON itself omits a field. Same
// pattern as leaf-memory's config shell.
const DEFAULT_PRESET = (configurationsJson.presets?.default ?? {}) as Record<string, unknown>;
function jsonNumber(key: string, hardcoded: number): number {
  const v = DEFAULT_PRESET[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : hardcoded;
}
function jsonBoolean(key: string, hardcoded: boolean): boolean {
  const v = DEFAULT_PRESET[key];
  return typeof v === 'boolean' ? v : hardcoded;
}

const FALLBACK = {
  startSpeed: jsonNumber('start_speed', SPEED.initial),
  maxSpeed: jsonNumber('max_speed', SPEED.max),
  acceleration: jsonNumber('acceleration', SPEED.acceleration),
  gravity: jsonNumber('gravity', JUMP.gravity),
  jumpMagnitude: jsonNumber('jump_velocity', -JUMP.initialVelocity),
  gapCoefficient: jsonNumber('gap_coefficient', GAP_COEFFICIENT),
  passScore: jsonNumber('pass_score', 100),
  birdsEnabled: jsonBoolean('birds_enabled', true),
  birdMinSpeed: jsonNumber('bird_min_speed', 8.5),
  showScore: jsonBoolean('show_score', true),
  showBest: jsonBoolean('show_best', true),
  sound: jsonBoolean('sound', true),
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

export function resolveDinoConfig(
  config: Record<string, unknown> | null | undefined,
): DinoConfig {
  const cfg = (config ?? null) as Record<string, unknown> | null;
  const jumpMagnitude = readNumber(cfg, 'jump_velocity') ?? FALLBACK.jumpMagnitude;

  return {
    startSpeed: readNumber(cfg, 'start_speed') ?? FALLBACK.startSpeed,
    maxSpeed: readNumber(cfg, 'max_speed') ?? FALLBACK.maxSpeed,
    acceleration: readNumber(cfg, 'acceleration') ?? FALLBACK.acceleration,
    gravity: readNumber(cfg, 'gravity') ?? FALLBACK.gravity,
    // Author-facing magnitude is positive; the engine wants an upward
    // (negative-y) velocity. Negate here so the rest of the code never has
    // to remember the sign convention.
    initialJumpVelocity: -Math.abs(jumpMagnitude),
    gapCoefficient: readNumber(cfg, 'gap_coefficient') ?? FALLBACK.gapCoefficient,
    passScore: readNumber(cfg, 'pass_score') ?? FALLBACK.passScore,
    birdsEnabled: readBoolean(cfg, 'birds_enabled') ?? FALLBACK.birdsEnabled,
    birdMinSpeed: readNumber(cfg, 'bird_min_speed') ?? FALLBACK.birdMinSpeed,
    showScore: readBoolean(cfg, 'show_score') ?? FALLBACK.showScore,
    showBest: readBoolean(cfg, 'show_best') ?? FALLBACK.showBest,
    sound: readBoolean(cfg, 'sound') ?? FALLBACK.sound,
  };
}

/** Resolve the RAW dashboard config (or null) into the headless SimConfig the
 *  engine runs under. THE single config->sim transform site: engine.init calls
 *  this, so the live driver and the replay derive identical sim params (no
 *  external/duplicated transform). Reuses resolveDinoConfig so the gameplay
 *  knobs can't drift from the display resolution; the only extra step is the
 *  jumpVelocity sign bridge. */
export function resolveSimConfig(config: Record<string, unknown> | null): SimConfig {
  const cfg = resolveDinoConfig(config);
  return {
    passScore: cfg.passScore,
    startSpeed: cfg.startSpeed,
    maxSpeed: cfg.maxSpeed,
    acceleration: cfg.acceleration,
    gravity: cfg.gravity,
    // DinoConfig stores the upward (negative-y) velocity; the sim wants the
    // positive magnitude (it negates internally in step). Math.abs bridges the
    // sign convention - reproduce it EXACTLY or live and replay jump arcs diverge.
    jumpVelocity: Math.abs(cfg.initialJumpVelocity),
    gapCoefficient: cfg.gapCoefficient,
    birdsEnabled: cfg.birdsEnabled,
    birdMinSpeed: cfg.birdMinSpeed,
  };
}
