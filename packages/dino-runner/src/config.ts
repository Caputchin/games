// Configuration plumbing for Dino Runner.
//
// Maps the runtime `ctx.config` payload (a flat `Record<string, scalar>`
// resolved by the widget from caputchin.json) into a typed `DinoConfig` the
// engine applies directly. Missing or malformed keys fall back to the
// hardcoded defaults below, which mirror the `default` preset in
// caputchin.json so the game still plays sensibly with `ctx.config === null`
// (e.g. a manifest shipped without a configurations block).

import type { GameContext } from '@caputchin/game-sdk';
import manifestJson from '../caputchin.json';
import { SPEED, JUMP, GAP_COEFFICIENT, INVERT_DISTANCE } from './constants.js';

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
  nightMode: boolean;
  nightDistance: number;
  birdsEnabled: boolean;
  birdMinSpeed: number;
  showScore: boolean;
  showBest: boolean;
}

// Defaults derived from the JSON `default` preset at module init so the two
// sources can't drift: editing caputchin.json automatically refreshes these.
// The hardcoded literals only kick in if the JSON itself omits a field. Same
// pattern as leaf-memory's config shell.
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
  startSpeed: jsonNumber('start_speed', SPEED.initial),
  maxSpeed: jsonNumber('max_speed', SPEED.max),
  acceleration: jsonNumber('acceleration', SPEED.acceleration),
  gravity: jsonNumber('gravity', JUMP.gravity),
  jumpMagnitude: jsonNumber('jump_velocity', -JUMP.initialVelocity),
  gapCoefficient: jsonNumber('gap_coefficient', GAP_COEFFICIENT),
  passScore: jsonNumber('pass_score', 100),
  nightMode: jsonBoolean('night_mode', true),
  nightDistance: jsonNumber('night_distance', INVERT_DISTANCE),
  birdsEnabled: jsonBoolean('birds_enabled', true),
  birdMinSpeed: jsonNumber('bird_min_speed', 8.5),
  showScore: jsonBoolean('show_score', true),
  showBest: jsonBoolean('show_best', true),
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

export function resolveDinoConfig(ctx: GameContext | undefined): DinoConfig {
  const cfg = (ctx?.config ?? null) as Record<string, unknown> | null;
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
    nightMode: readBoolean(cfg, 'night_mode') ?? FALLBACK.nightMode,
    nightDistance: readNumber(cfg, 'night_distance') ?? FALLBACK.nightDistance,
    birdsEnabled: readBoolean(cfg, 'birds_enabled') ?? FALLBACK.birdsEnabled,
    birdMinSpeed: readNumber(cfg, 'bird_min_speed') ?? FALLBACK.birdMinSpeed,
    showScore: readBoolean(cfg, 'show_score') ?? FALLBACK.showScore,
    showBest: readBoolean(cfg, 'show_best') ?? FALLBACK.showBest,
  };
}
