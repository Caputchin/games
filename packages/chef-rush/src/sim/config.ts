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

/** Defaults: a 48s round, serve 8 dishes, 3 lives, a 1.5s actionable window,
 *  28% of dishes spoiled. Dashboard keys are seconds / percent / counts. */
export function resolveSimConfig(raw: RawConfig): ChefConfig {
  return {
    passScore: clamp(Math.round(read(raw, 'pass_dishes', 8)), 3, 30),
    lives: clamp(Math.round(read(raw, 'lives', 3)), 1, 9),
    spawnIntervalTicks: clamp(Math.round(read(raw, 'spawn_interval_ticks', 45)), 28, 90),
    gestureWindowTicks: clamp(Math.round(read(raw, 'gesture_window_ticks', 75)), 40, 150),
    spoiledChance: clamp(read(raw, 'spoiled_percent', 28), 0, 60) / 100,
    timeBudgetTicks: clamp(Math.round(read(raw, 'time_budget_seconds', 48)), 12, 60) * TICKS_PER_S,
  };
}
