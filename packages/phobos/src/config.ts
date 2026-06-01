// Configuration plumbing for Phobos.
//
// Maps the runtime config payload (a flat `Record<string, scalar>` the widget
// resolves from caputchin.json, with the manifest's SNAKE_CASE keys) into a
// typed RoundConfig the engine applies. Missing/malformed keys fall back to the
// hardcoded defaults below, which mirror the `default` preset in caputchin.json
// so the game still plays sensibly with config === null (MVP: the server passes
// null; per-site config injection is a deferred phase).
//
// Both the live driver (game.ts) and the headless replay (run-core.ts) resolve
// through here, so live play and server replay execute under identical
// gameplay params -> identical verdict.
import configurationsJson from '../.caputchin/configurations.json';

/** Hard ceiling on a round's tics when no time_limit is set. Bounds replay cost
 *  and the live round; both sides use it so live play and replay agree. ~200s,
 *  well above any real solve. */
export const HARD_TIC_CAP = 7000;

/** Resolve the effective tic budget: an explicit time_limit, else the hard cap. */
export function effectiveMaxTics(timeLimit: number): number {
  return timeLimit > 0 ? timeLimit : HARD_TIC_CAP;
}

export interface RoundConfig {
  /** Kills required to pass (server-owned gate; read here, never from the trace). */
  passKills: number;
  /** Campaign arena the round runs on (gate-affecting; server rebuilds it). */
  startLevel: number;
  /** Monsters spawned into the arena from the seed. */
  waveCount: number;
  /** DOOM skill 1..5 (5 = Nightmare). */
  skill: number;
  fastMonsters: boolean;
  respawnMonsters: boolean;
  /** Solve budget in game tics (0 = use the engine hard cap). Also bounds the
   *  replay tic loop -> bounds server cost. */
  timeLimit: number;
}

// The default preset is identified by its `_default` flag, not a fixed name, so
// the preset can be renamed (e.g. "standard") without breaking the fallbacks.
const PRESETS = (configurationsJson.presets ?? {}) as Record<string, Record<string, unknown>>;
const DEFAULT_PRESET = (Object.values(PRESETS).find((p) => p && p['_default'] === true)
  ?? {}) as Record<string, unknown>;

// start_level is the captcha arena and is REPLAYED server-side, so it must stay
// inside the schema-declared range (1..4 = the open arenas). A server-stored
// config beyond it would make a bonus map (a maze) the captcha -> heavier replay
// cpuMs. Enforce the schema bound here, the one point live + headless inherit.
const START_SCHEMA = (configurationsJson.schema as Record<string, { min?: number; max?: number }>
  | undefined)?.['start_level'];
const START_MIN = typeof START_SCHEMA?.min === 'number' ? START_SCHEMA.min : 1;
const START_MAX = typeof START_SCHEMA?.max === 'number' ? START_SCHEMA.max : 4;
const clampStart = (n: number): number => Math.min(START_MAX, Math.max(START_MIN, Math.round(n)));

function jsonNumber(key: string, hardcoded: number): number {
  const v = DEFAULT_PRESET[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : hardcoded;
}
function jsonBoolean(key: string, hardcoded: boolean): boolean {
  const v = DEFAULT_PRESET[key];
  return typeof v === 'boolean' ? v : hardcoded;
}

// Defaults derived from the JSON `default` preset at module init so the two
// sources can't drift; the hardcoded literals only kick in if the JSON omits a
// key. The literals also encode the determinism baseline (skill 4 = sk_hard).
const FALLBACK: RoundConfig = {
  passKills: jsonNumber('pass_kills', 3),
  startLevel: jsonNumber('start_level', 1),
  waveCount: jsonNumber('wave_count', 5),
  skill: jsonNumber('skill', 4),
  fastMonsters: jsonBoolean('fast_monsters', false),
  respawnMonsters: jsonBoolean('respawn_monsters', false),
  timeLimit: jsonNumber('time_limit', 0),
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

/** Resolve the opaque, server-sourced config (manifest snake_case keys) into a
 *  typed RoundConfig, falling back to the manifest `default` preset. */
export function resolvePhobosConfig(cfg: Record<string, unknown> | null | undefined): RoundConfig {
  const c = cfg ?? null;
  return {
    passKills: readNumber(c, 'pass_kills') ?? FALLBACK.passKills,
    startLevel: clampStart(readNumber(c, 'start_level') ?? FALLBACK.startLevel),
    waveCount: readNumber(c, 'wave_count') ?? FALLBACK.waveCount,
    skill: readNumber(c, 'skill') ?? FALLBACK.skill,
    fastMonsters: readBoolean(c, 'fast_monsters') ?? FALLBACK.fastMonsters,
    respawnMonsters: readBoolean(c, 'respawn_monsters') ?? FALLBACK.respawnMonsters,
    timeLimit: readNumber(c, 'time_limit') ?? FALLBACK.timeLimit,
  };
}
