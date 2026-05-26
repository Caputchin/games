// Configuration plumbing for Fruit Slash.
//
// Maps the runtime `ctx.config` payload (a flat Record<string, scalar> resolved
// by the widget from caputchin.json) into a typed FruitSlashConfig. Missing or
// malformed keys fall back to defaults derived at module init from the
// caputchin.json `default` preset, so the two sources can't drift and the game
// still plays sensibly with `ctx.config === null`. Same pattern as dino-runner.

import type { GameContext } from '@caputchin/game-sdk';
import manifestJson from '../caputchin.json';
import { GRAVITY } from './sim/constants.js';

export interface FruitSlashConfig {
  passScore: number;
  lives: number;
  /** Fruit launched per second. */
  spawnRate: number;
  /** Downward acceleration, units per second squared. */
  gravity: number;
  /** Probability a launched object is a bomb, 0..1. */
  hazardChance: number;
  sound: boolean;
  showScore: boolean;
  showLives: boolean;
}

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
  passScore: jsonNumber('pass_score', 8),
  lives: jsonNumber('lives', 3),
  spawnRate: jsonNumber('spawn_rate', 0.9),
  gravity: jsonNumber('gravity', GRAVITY),
  hazardChance: jsonNumber('hazard_chance', 0.18),
  sound: jsonBoolean('sound', true),
  showScore: jsonBoolean('show_score', true),
  showLives: jsonBoolean('show_lives', true),
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

export function resolveFruitSlashConfig(ctx: GameContext | undefined): FruitSlashConfig {
  const cfg = (ctx?.config ?? null) as Record<string, unknown> | null;
  return {
    passScore: Math.max(1, Math.round(readNumber(cfg, 'pass_score') ?? FALLBACK.passScore)),
    lives: Math.max(1, Math.round(readNumber(cfg, 'lives') ?? FALLBACK.lives)),
    spawnRate: clamp(readNumber(cfg, 'spawn_rate') ?? FALLBACK.spawnRate, 0.1, 5),
    gravity: clamp(readNumber(cfg, 'gravity') ?? FALLBACK.gravity, 200, 4000),
    hazardChance: clamp(readNumber(cfg, 'hazard_chance') ?? FALLBACK.hazardChance, 0, 1),
    sound: readBoolean(cfg, 'sound') ?? FALLBACK.sound,
    showScore: readBoolean(cfg, 'show_score') ?? FALLBACK.showScore,
    showLives: readBoolean(cfg, 'show_lives') ?? FALLBACK.showLives,
  };
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
