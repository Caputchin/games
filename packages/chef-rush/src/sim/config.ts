// Resolve the opaque server config into a clamped, defaulted ChefConfig. This is
// the ONE transform site: live play and the headless replay both pass through it,
// so they cannot diverge. The raw config is an untrusted flat scalar map (or
// null) keyed by the dashboard-facing names in .caputchin/configurations.json;
// never trust its shape - validate, clamp, and convert units here.

import type { ChefConfig } from './types';

type RawConfig = Record<string, unknown> | null | undefined;
const TICKS_PER_S = 50; // 50 Hz fixed step

function read(raw: RawConfig, key: string, def: number): number {
  const v = raw && typeof raw === 'object' ? (raw as Record<string, unknown>)[key] : undefined;
  return typeof v === 'number' && Number.isFinite(v) ? v : def;
}
const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

/** Defaults: serve 4 orders, 3 lives, a 3-ingredient recipe, a 1.8s window,
 *  40% distractors, a 48s round. Dashboard keys are counts / seconds / percent. */
export function resolveSimConfig(raw: RawConfig): ChefConfig {
  return {
    passScore: clamp(Math.round(read(raw, 'pass_orders', 4)), 2, 12),
    lives: clamp(Math.round(read(raw, 'lives', 3)), 1, 9),
    spawnIntervalTicks: clamp(Math.round(read(raw, 'spawn_interval_ticks', 40)), 24, 90),
    ingredientWindowTicks: clamp(Math.round(read(raw, 'ingredient_window_ticks', 90)), 50, 160),
    distractorChance: clamp(read(raw, 'distractor_percent', 40), 0, 60) / 100,
    recipeSize: clamp(Math.round(read(raw, 'recipe_size', 3)), 1, 4),
    timeBudgetTicks: clamp(Math.round(read(raw, 'time_budget_seconds', 48)), 12, 60) * TICKS_PER_S,
  };
}
