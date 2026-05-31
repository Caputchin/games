// Configuration plumbing for Whack-a-Monkey.
//
// Maps the RAW dashboard config payload (a flat Record<string, scalar> resolved
// by the widget from caputchin.json) into a typed WhackConfig. Takes the raw
// config object (or null) directly so the SAME resolver serves the live driver
// (display) and the headless engine (via resolveSimConfig in sim/config.ts) -
// one transform site, no live/replay divergence. Missing or malformed keys fall
// back to defaults derived at module init from the caputchin.json `default`
// preset, so the two sources can't drift and the game still plays sensibly with
// `config === null`. Every knob is clamped to a humane range: a captcha that
// locks out humans is worse than a lenient one. Same pattern as fruit-slash.

import manifestJson from '../caputchin.json';

export interface WhackConfig {
  /** Monkeys to whack to pass (spread across the levels). */
  passHits: number;
  /** Level-1 mole uptime in ms. */
  baseUptimeMs: number;
  /** Level-1 decoy chance, 0..1. */
  baseDecoyChance: number;
  /** Round time budget in seconds: the clock the player races to hit the goal. */
  seconds: number;
  sound: boolean;
  showScore: boolean;
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
  passHits: jsonNumber('pass_hits', 10),
  baseUptimeMs: jsonNumber('base_uptime_ms', 800),
  baseDecoyChance: jsonNumber('base_decoy_chance', 0.1),
  seconds: jsonNumber('seconds', 25),
  sound: jsonBoolean('sound', true),
  showScore: jsonBoolean('show_score', true),
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

export function resolveWhackConfig(
  config: Record<string, unknown> | null | undefined,
): WhackConfig {
  const cfg = (config ?? null) as Record<string, unknown> | null;
  return {
    passHits: Math.max(3, Math.min(30, Math.round(readNumber(cfg, 'pass_hits') ?? FALLBACK.passHits))),
    baseUptimeMs: clamp(readNumber(cfg, 'base_uptime_ms') ?? FALLBACK.baseUptimeMs, 350, 2000),
    baseDecoyChance: clamp(readNumber(cfg, 'base_decoy_chance') ?? FALLBACK.baseDecoyChance, 0, 0.5),
    seconds: Math.max(5, Math.min(90, Math.round(readNumber(cfg, 'seconds') ?? FALLBACK.seconds))),
    sound: readBoolean(cfg, 'sound') ?? FALLBACK.sound,
    showScore: readBoolean(cfg, 'show_score') ?? FALLBACK.showScore,
  };
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
