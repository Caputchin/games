// Sim types for Chef Rush. An order ticket lists the ingredients a dish needs.
// Ingredients appear on the cutting board; the player CHOPS (swipes across) the
// ones the order needs, while leaving wrong ingredients and rotten ones alone -
// chopping a wrong or rotten ingredient is a mistake. Complete orders to verify.

/** The ingredient kinds (index = wire/render id; APPEND, never reorder). */
export const INGREDIENTS = ['tomato', 'lettuce', 'onion', 'mushroom', 'carrot', 'cheese'] as const;
export type IngredientName = (typeof INGREDIENTS)[number];
export const INGREDIENT_COUNT = INGREDIENTS.length;

/** A single ingredient sitting on the board, choppable until it expires. */
export interface Ingredient {
  readonly id: number;
  /** Board slot index (0..SLOT_COUNT-1). */
  readonly slot: number;
  /** Ingredient kind (index into INGREDIENTS). */
  readonly type: number;
  /** 1 if rotten - must NOT be chopped (a mistake either way). */
  readonly rotten: 0 | 1;
  /** Tick it appeared (the actionable moment, for the R1 reaction floor). */
  readonly appearTick: number;
  /** Tick it leaves the board if not chopped. */
  readonly expireTick: number;
  /** 1 once consumed (chopped or left), so it is removed and the slot frees. */
  done: 0 | 1;
}

/** The current order: the dish's required ingredient types and which are prepped. */
export interface Order {
  readonly id: number;
  /** Required ingredient types (may repeat, e.g. a double-tomato dish). */
  readonly required: readonly number[];
  /** Per-required-slot: 1 once that ingredient has been chopped for this order. */
  filled: number[];
}

/** The current pointer stroke (one press-drag-release = one chop). */
export interface Stroke {
  active: boolean;
  /** Already chopped an ingredient this stroke (one chop per stroke). */
  consumed: boolean;
  anchorX: number;
  anchorY: number;
  lastX: number;
  lastY: number;
  hasLast: boolean;
}

/** The resolved, clamped per-round config (from the server config). */
export interface ChefConfig {
  /** Orders the player must complete to pass. */
  readonly passScore: number;
  /** Lives; a wrong/rotten chop or a needed ingredient that slips by costs one. */
  readonly lives: number;
  /** Base spawn cadence in ticks (ramps down over the round). */
  readonly spawnIntervalTicks: number;
  /** Ticks an ingredient stays on the board before it leaves. */
  readonly ingredientWindowTicks: number;
  /** Base chance a spawn is a distractor (wrong type or rotten); ramps up. */
  readonly distractorChance: number;
  /** Ingredients per order (recipe length). */
  readonly recipeSize: number;
  /** Round time budget in ticks; reaching it ends the round (a fail if unpassed). */
  readonly timeBudgetTicks: number;
}

/** What the live renderer reads each frame (only on-screen state; rule U1). */
export interface SimView {
  readonly ingredients: readonly Ingredient[];
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

export type FxKind = 'chop' | 'mistake' | 'serve' | 'expire';
export interface Fx {
  readonly kind: FxKind;
  readonly slot: number;
}
