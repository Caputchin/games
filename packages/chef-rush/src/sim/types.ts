// Sim types for Chef Rush - a calm, one-at-a-time prep-and-cook kitchen.
//
// One ingredient waits on the prep counter at a time. An order ticket maps each
// ingredient a dish needs to its action: chop on the cutting board, stir in the
// pot, flip in the pan. The player reads the ticket and either drags the ingredient
// to its correct station and performs that station's gesture to cook it, or - if the
// ingredient is wrong (not on the order) or rotten - drags it to the trash. Cook
// every ingredient an order needs to serve the dish; serve enough dishes to verify.
//
// Two motor acts per kept ingredient (the drag to the station + the cooking gesture)
// are what the bot-detector scores - that is what keeps this a high-trust game even
// at a calm one-at-a-time pace. Discriminating recipe-vs-distractor and acting before
// the spoil timer add the bad-target + reaction pressure.

/** Stations, in fixed index order. The index doubles as the required gesture id:
 *  station 0 (board) wants gesture 0 (chop), 1 (pot) wants 1 (stir), 2 (pan) wants
 *  2 (flip). APPEND only, never reorder. */
export const STATIONS = ['board', 'pot', 'pan'] as const;
export type StationName = (typeof STATIONS)[number];
export const STATION_COUNT = STATIONS.length;

/** The cooking gestures, indexed to match STATIONS. */
export const GESTURES = ['chop', 'stir', 'flip'] as const;
export type GestureName = (typeof GESTURES)[number];
/** A classified gesture: 0 chop, 1 stir, 2 flip, or -1 = not a valid gesture. */
export type GestureKind = 0 | 1 | 2 | -1;

/** Where a drag ended: a station index (0..2), the trash, or nothing. */
export const DROP_NONE = -1;
export const DROP_TRASH = -2;

/** The ingredient kinds (index = wire/render id; APPEND, never reorder). Each maps
 *  to the station whose gesture prepares it. The `key` is the sprite name in the art
 *  atlas (src/art/sprites.generated.ts). */
export const INGREDIENTS: ReadonlyArray<{ readonly key: string; readonly station: number }> = [
  { key: 'tomato', station: 0 }, // board / chop
  { key: 'carrot', station: 0 },
  { key: 'onion', station: 0 },
  { key: 'lettuce', station: 0 },
  { key: 'mushroom', station: 0 },
  { key: 'broccoli', station: 0 },
  { key: 'potato', station: 1 }, // pot / stir
  { key: 'zucchini', station: 1 },
  { key: 'corn', station: 1 },
  { key: 'steak', station: 2 }, // pan / flip
  { key: 'salmon', station: 2 },
  { key: 'ribs', station: 2 },
  { key: 'egg', station: 2 },
];
export const INGREDIENT_COUNT = INGREDIENTS.length;

/** The station an ingredient type is prepared at (== its required gesture id). */
export const stationOf = (type: number): number => INGREDIENTS[type]!.station;

/** Item lifecycle phase. */
export const PHASE_COUNTER = 0; // waiting on the prep counter, awaiting a drag
export const PHASE_STATION = 1; // dropped at a station, awaiting the cooking gesture
export type ItemPhase = typeof PHASE_COUNTER | typeof PHASE_STATION;

/** The whole-game lifecycle phase (drives the start / win / lose overlays). The
 *  transitions between these are all triggered by recorded taps, so the headless
 *  replay reproduces them. */
export const GAME_WAITING = 0; // start screen, before the first tap
export const GAME_PLAYING = 1; // active round
export const GAME_WON = 2; // verified - success screen (keep playing to continue)
export const GAME_LOST = 3; // out of lives / time - fail screen (tap to try again)
export type GamePhase = typeof GAME_WAITING | typeof GAME_PLAYING | typeof GAME_WON | typeof GAME_LOST;

/** The single ingredient currently in play. */
export interface Item {
  readonly id: number;
  /** Ingredient kind (index into INGREDIENTS). */
  readonly type: number;
  /** 1 if rotten - must be trashed, never cooked. */
  readonly rotten: 0 | 1;
  /** Tick it appeared (the actionable moment, for the R1 reaction floor). */
  readonly appearTick: number;
  /** Tick it spoils on the counter if unresolved. */
  readonly expireTick: number;
  /** Lifecycle phase. */
  phase: ItemPhase;
  /** Station it was dropped at once phase === PHASE_STATION (else DROP_NONE). */
  station: number;
}

/** The current order: the dish's required ingredient types and which are cooked. */
export interface Order {
  readonly id: number;
  /** Required ingredient types (distinct - newOrder draws without replacement). */
  readonly required: readonly number[];
  /** Per-required-slot: 1 once that ingredient has been cooked for this order. */
  filled: number[];
}

/** The resolved, clamped per-round config (from the server config). */
export interface ChefConfig {
  /** Dishes (orders) the player must complete to pass. */
  readonly passScore: number;
  /** Lives; a wrong cook, a wrong station, a trashed needed item, or a needed item
   *  that spoils each costs one. */
  readonly lives: number;
  /** Ticks an ingredient waits on the counter before it spoils. */
  readonly itemWindowTicks: number;
  /** Chance a spawned ingredient is a distractor (wrong type or rotten). */
  readonly distractorChance: number;
  /** Ingredients per order (recipe length). */
  readonly recipeSize: number;
  /** Round time budget in ticks; reaching it ends the round (a fail if unpassed). */
  readonly timeBudgetTicks: number;
}

/** What the live renderer reads each frame (only on-screen state; rule U1). */
export interface SimView {
  readonly item: Item | null;
  readonly order: Order | null;
  readonly dishesServed: number;
  readonly lives: number;
  readonly tick: number;
  readonly passScore: number;
  readonly verified: boolean;
  readonly over: boolean;
  /** The whole-game lifecycle phase (start / playing / won / lost). */
  readonly gamePhase: GamePhase;
  /** The item is currently being dragged (for the live drag visual). */
  readonly dragging: boolean;
  /** Transient render cues emitted this tick, drained by the renderer. */
  readonly fx: readonly Fx[];
}

export type FxKind = 'cook' | 'serve' | 'mistake' | 'trash' | 'spoil';
/** A render cue. `where` is a station index (0..2), or DROP_TRASH / DROP_NONE for
 *  the trash / prep counter. */
export interface Fx {
  readonly kind: FxKind;
  readonly where: number;
}
