// Sim types for Chef Rush - a gesture-driven, multi-station kitchen.
//
// Three fixed stations sit on the counter, each operated by its own cooking
// gesture: the cutting board (CHOP, a downward slash), the pot (STIR, a circular
// drag) and the pan (FLIP, an upward flick). Every ingredient belongs to exactly
// one station. Ingredients appear at their stations over time; an order ticket
// lists the dish's required ingredients. The player performs the station's gesture
// on the ingredients the order needs, while leaving wrong ingredients and rotten
// ones alone. Complete orders to verify.
//
// The gesture - not a tap or a place-and-wait timer - is the skill the bot judge
// scores, which is what keeps this a high-trust game (a recipe + a cook timer would
// be perfect-information + seed-reproducible, i.e. cheap to solve).

/** Stations, in fixed index order. The index doubles as the required gesture id:
 *  station 0 (board) wants gesture 0 (chop), station 1 (pot) wants 1 (stir),
 *  station 2 (pan) wants 2 (flip). APPEND only, never reorder. */
export const STATIONS = ['board', 'pot', 'pan'] as const;
export type StationName = (typeof STATIONS)[number];
export const STATION_COUNT = STATIONS.length;

/** The cooking gestures, indexed to match STATIONS. */
export const GESTURES = ['chop', 'stir', 'flip'] as const;
export type GestureName = (typeof GESTURES)[number];
/** A classified gesture: 0 chop, 1 stir, 2 flip, or -1 = not a valid gesture. */
export type GestureKind = 0 | 1 | 2 | -1;

/** The ingredient kinds (index = wire/render id; APPEND, never reorder). Each
 *  maps to the station whose gesture prepares it. The `key` is the sprite name in
 *  the art atlas (src/art/sprites.generated.ts). */
export const INGREDIENTS: ReadonlyArray<{ readonly key: string; readonly station: number }> = [
  { key: 'tomato', station: 0 }, // board / chop
  { key: 'carrot', station: 0 },
  { key: 'onion', station: 0 },
  { key: 'lettuce', station: 0 },
  { key: 'mushroom', station: 0 },
  { key: 'broccoli', station: 0 },
  { key: 'spaghetti', station: 1 }, // pot / stir
  { key: 'rice', station: 1 },
  { key: 'corn', station: 1 },
  { key: 'steak', station: 2 }, // pan / flip
  { key: 'salmon', station: 2 },
  { key: 'bacon', station: 2 },
  { key: 'egg', station: 2 },
];
export const INGREDIENT_COUNT = INGREDIENTS.length;

/** The station an ingredient type is prepared at (== its required gesture id). */
export const stationOf = (type: number): number => INGREDIENTS[type]!.station;

/** An ingredient sitting at its station, workable until it expires. */
export interface Item {
  readonly id: number;
  /** Station it sits at (== stationOf(type)); the gesture that prepares it. */
  readonly station: number;
  /** Ingredient kind (index into INGREDIENTS). */
  readonly type: number;
  /** 1 if rotten - must NOT be cooked (a mistake either way). */
  readonly rotten: 0 | 1;
  /** Tick it appeared (the actionable moment, for the R1 reaction floor). */
  readonly appearTick: number;
  /** Tick it leaves the station if not worked. */
  readonly expireTick: number;
  /** 1 once consumed (cooked or left), so it is removed and the station frees. */
  done: 0 | 1;
}

/** The current order: the dish's required ingredient types and which are prepped. */
export interface Order {
  readonly id: number;
  /** Required ingredient types (distinct - newOrder draws without replacement). */
  readonly required: readonly number[];
  /** Per-required-slot: 1 once that ingredient has been cooked for this order. */
  filled: number[];
}

/** The current pointer stroke (one press-drag-release = one gesture). Accumulates
 *  path features across ticks so the gesture can be classified on release. */
export interface Stroke {
  active: boolean;
  /** Pointer-down anchor. */
  anchorX: number;
  anchorY: number;
  /** Last sampled point (to measure path length segment by segment). */
  lastX: number;
  lastY: number;
  /** Bounding box of the whole stroke (for the span / shape measures). */
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  /** Total path length (sum of per-segment Chebyshev steps; sqrt-free). */
  pathLen: number;
}

/** The resolved, clamped per-round config (from the server config). */
export interface ChefConfig {
  /** Orders the player must complete to pass. */
  readonly passScore: number;
  /** Lives; a wrong/rotten cook or a needed ingredient that spoils costs one. */
  readonly lives: number;
  /** Base spawn cadence in ticks (ramps down over the round). */
  readonly spawnIntervalTicks: number;
  /** Ticks an ingredient stays at its station before it leaves. */
  readonly itemWindowTicks: number;
  /** Base chance a spawn is a distractor (wrong type or rotten); ramps up. */
  readonly distractorChance: number;
  /** Ingredients per order (recipe length). */
  readonly recipeSize: number;
  /** Round time budget in ticks; reaching it ends the round (a fail if unpassed). */
  readonly timeBudgetTicks: number;
}

/** What the live renderer reads each frame (only on-screen state; rule U1). */
export interface SimView {
  readonly items: readonly Item[];
  readonly order: Order | null;
  readonly ordersServed: number;
  readonly lives: number;
  readonly tick: number;
  readonly passScore: number;
  readonly verified: boolean;
  readonly over: boolean;
  /** Transient render cues emitted this tick, drained by the renderer. */
  readonly fx: readonly Fx[];
}

export type FxKind = 'cook' | 'mistake' | 'serve' | 'expire';
export interface Fx {
  readonly kind: FxKind;
  /** Station the cue happened at. */
  readonly station: number;
}
