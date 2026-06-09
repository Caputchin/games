// Sim types for Chef Rush. A prompt is a cooking task at a station: gesture in the
// required direction before it expires. GOOD prompts must be served; SPOILED
// prompts (the decoy / "bomb" analog) must be left alone - gesturing one is fatal.

/** Prompt kind: GOOD = serve it; SPOILED = do not touch (fatal if gestured). */
export const GOOD = 0;
export const SPOILED = 1;
export type Kind = typeof GOOD | typeof SPOILED;

/** A cooking task at a station. */
export interface Prompt {
  readonly id: number;
  /** Index into STATIONS. */
  readonly station: number;
  /** Required gesture direction (DIR_*). */
  readonly dir: number;
  readonly kind: Kind;
  /** Tick the prompt became actionable (for the R1 reaction floor). */
  readonly appearTick: number;
  /** Tick the prompt expires if unserved. */
  readonly expireTick: number;
  /** 1 once resolved (served / consumed), so it is removed and the station frees. */
  served: 0 | 1;
}

/** The current pointer stroke (one press-drag-release). */
export interface Stroke {
  active: boolean;
  /** Resolved already this stroke (so one stroke serves at most one prompt). */
  consumed: boolean;
  anchorX: number;
  anchorY: number;
  /** Station the stroke pressed down on, or -1 for empty space. */
  station: number;
}

/** The resolved, clamped per-round config (from the server config). */
export interface ChefConfig {
  /** Good prompts that must be served to pass. */
  readonly passScore: number;
  /** Lives; a missed good prompt or 0 (a touched spoiled) ends the round. */
  readonly lives: number;
  /** Base spawn cadence in ticks (ramps down over the round). */
  readonly spawnIntervalTicks: number;
  /** Ticks a prompt stays actionable before it expires. */
  readonly gestureWindowTicks: number;
  /** Base spoiled probability (ramps up over the round). */
  readonly spoiledChance: number;
  /** Round time budget in ticks; reaching it ends the round (a fail if unpassed). */
  readonly timeBudgetTicks: number;
}

/** What the live renderer reads each frame (only on-screen state; rule U1). */
export interface SimView {
  readonly prompts: readonly Prompt[];
  readonly score: number;
  readonly lives: number;
  readonly tick: number;
  readonly passScore: number;
  readonly verified: boolean;
  readonly over: boolean;
  /** Transient render cues emitted this tick (serve / spoiled / miss), drained by the renderer. */
  readonly fx: readonly Fx[];
}

export type FxKind = 'serve' | 'spoiled' | 'miss' | 'expire';
export interface Fx {
  readonly kind: FxKind;
  readonly station: number;
}
