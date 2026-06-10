// Resolve the opaque server config into a clamped, defaulted ChefConfig. This is
// the ONE transform site: live play and the headless replay both pass through it,
// so they cannot diverge. The raw config is an untrusted flat scalar map (or
// null) keyed by the dashboard-facing names in .caputchin/configurations.json;
// never trust its shape - validate, clamp, and convert units here.
//
// CONFIG_FIELDS is the single source of truth for the dashboard key contract: the
// wire key, default, and clamp bounds (in dashboard units) for every tunable the
// sim reads. configurations.json MUST mirror these keys + ranges, and the parity
// test (tests/config-schema.test.ts) fails the build if it drifts - that is the
// guard against a dead config knob (a dashboard key the sim never reads, or a read
// key with no dashboard control).

import type { ChefConfig } from './types';

type RawConfig = Record<string, unknown> | null | undefined;
const TICKS_PER_S = 50; // 50 Hz fixed step

/** One tunable: its dashboard wire key, default, and clamp range (dashboard units). */
export interface ConfigField {
  readonly key: string;
  readonly def: number;
  readonly min: number;
  readonly max: number;
}

/** Every gameplay tunable the sim reads, keyed by its ChefConfig field. The `key`
 *  is the dashboard-facing name in configurations.json; min/max are in dashboard
 *  units (counts / percent / seconds). `sound` is NOT here - the renderer reads it,
 *  not the sim (the parity test treats it as the one allowed non-sim manifest key). */
export const CONFIG_FIELDS = {
  passScore: { key: 'pass_orders', def: 3, min: 2, max: 12 },
  lives: { key: 'lives', def: 3, min: 1, max: 9 },
  spawnIntervalTicks: { key: 'spawn_interval_ticks', def: 40, min: 22, max: 90 },
  itemWindowTicks: { key: 'item_window_ticks', def: 130, min: 70, max: 220 },
  distractorPercent: { key: 'distractor_percent', def: 40, min: 0, max: 60 },
  recipeSize: { key: 'recipe_size', def: 3, min: 1, max: 5 },
  timeBudgetSeconds: { key: 'time_budget_seconds', def: 55, min: 15, max: 75 },
} as const satisfies Record<string, ConfigField>;

function read(raw: RawConfig, key: string, def: number): number {
  const v = raw && typeof raw === 'object' ? (raw as Record<string, unknown>)[key] : undefined;
  return typeof v === 'number' && Number.isFinite(v) ? v : def;
}
const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

/** Read one field's raw value, round to an integer, and clamp to its range. */
function field(raw: RawConfig, f: ConfigField): number {
  return clamp(Math.round(read(raw, f.key, f.def)), f.min, f.max);
}

/** Defaults: serve 3 orders, 3 lives, a 3-ingredient recipe, a ~2.6s item window,
 *  40% distractors, a 55s round. Dashboard keys are counts / seconds / percent. */
export function resolveSimConfig(raw: RawConfig): ChefConfig {
  const F = CONFIG_FIELDS;
  return {
    passScore: field(raw, F.passScore),
    lives: field(raw, F.lives),
    spawnIntervalTicks: field(raw, F.spawnIntervalTicks),
    itemWindowTicks: field(raw, F.itemWindowTicks),
    distractorChance: field(raw, F.distractorPercent) / 100,
    recipeSize: field(raw, F.recipeSize),
    timeBudgetTicks: field(raw, F.timeBudgetSeconds) * TICKS_PER_S,
  };
}
