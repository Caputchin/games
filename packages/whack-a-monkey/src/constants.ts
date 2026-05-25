// Logical world + physics tuning. ALL physics are expressed PER SECOND, never
// per frame: the loop in game.ts advances the simulation by real elapsed time
// (dt seconds) every frame, so motion runs at identical real-world speed on a
// 60Hz or a 240Hz display. There is deliberately NO "per-frame" / "MS_PER_FRAME"
// constant anywhere in this game (see tests/frame-rate.test.ts, the permanent
// guard).

/** Fixed logical world. The canvas backing store is sized to the container and
 *  the scene is scaled to fit; holes + moles live in these units so physics
 *  never needs to know the pixel size. */
export const WORLD_WIDTH = 800;
/** Reference world height + the manifest `preferred` height. The LIVE height
 *  adapts to the container aspect at runtime (game.ts); this is the fallback
 *  and what preferred-footprint.test asserts against. */
export const WORLD_HEIGHT = 450;
/** Clamp range for the runtime-adaptive world height so an extreme embed aspect
 *  still leaves the grid usable. */
export const WORLD_HEIGHT_MIN = 260;
export const WORLD_HEIGHT_MAX = 900;

/** Largest simulation step honored in one frame (seconds). After a tab-stall the
 *  real delta can be huge; clamping keeps springs + timers from teleporting.
 *  NOT a fixed timestep, just an upper bound on dt. */
export const MAX_DT = 1 / 30;

// ── Grid ─────────────────────────────────────────────────
/** 3x3 grid of holes. Fixed (not customer-tunable) for the lean v1. */
export const GRID_COLS = 3;
export const GRID_ROWS = 3;
export const HOLE_COUNT = GRID_COLS * GRID_ROWS;
/** Fraction of the world reserved as an outer margin around the grid, so holes
 *  do not crowd the HUD / edges. */
export const GRID_MARGIN = 0.06;

// ── Mole sizing ──────────────────────────────────────────
/** Drawn mole radius (logical units). Diameter 128 matches the native Kenney
 *  sprite size and clears the 44px (WCAG) / 80px (our floor) tap-target rule. */
export const MOLE_RADIUS = 64;
/** Extra slack added to the hit-test radius only (not the draw): a tap that
 *  grazes close enough still counts, so it feels responsive on touch rather
 *  than pixel-precise. */
export const MOLE_HIT_PAD = 14;
/** Lower bound on the live scaleY used for the hit-test, so a mole that is only
 *  partway out of its hole is still tappable (no pixel-precision punishment). */
export const MIN_HIT_SCALE = 0.5;

// ── Emergence spring (mole rises from the hole) ──────────
export const EMERGE_OMEGA = 22; // rad/s, snappy but not violent
export const EMERGE_ZETA = 0.55; // underdamped, single visible overshoot
export const EMERGE_INIT_VEL = -2; // anticipation micro-compress at t0

// ── Retract spring (mole ducks on hit or timeout) ────────
export const RETRACT_OMEGA = 28; // faster than emerge, the duck reads quick
export const RETRACT_ZETA = 1.0; // critically damped, no bounce on exit

// ── Hit punch (scale burst the instant a monkey is tapped) ─
export const HIT_PUNCH_SCALE = 1.35;
export const HIT_PUNCH_OMEGA = 30;
export const HIT_PUNCH_ZETA = 0.7;

// ── Hit particles ────────────────────────────────────────
export const HIT_PARTICLES = { count: 10, ttl: 0.35, speed: 220 } as const;
export const PARTICLE_GRAVITY = 600; // logical units/s^2 downward

// ── Decoy feedback ───────────────────────────────────────
export const DECOY_FLASH_S = 0.2; // red overlay duration on a decoy tap

// ── Spawn scheduling ─────────────────────────────────────
/** Base monkeys/sec at level 1 (not a customer knob; the ladder scales it). */
export const BASE_SPAWN_RATE = 1.2;
/** Inter-spawn interval jitter, +/- this fraction of the base interval. */
export const SPAWN_JITTER = 0.4;
/** Hard floor on the spawn interval (seconds) after jitter. */
export const MIN_INTERVAL = 0.15;
/** A hole that just spawned is excluded from selection for this many multiples
 *  of the current interval, so the same hole does not fire twice in a row. */
export const HOLE_COOLDOWN_FACTOR = 1.2;
/** Caps on simultaneously-visible moles: enough action, not chaos. */
export const MAX_CONCURRENT = 4; // good monkeys
export const MAX_CONCURRENT_DECOY = 2; // decoys on top of the good cap

// ── Difficulty ladder (3 discrete levels, no intra-level sub-ramp) ─
export const LEVEL_COUNT = 3;
export const RATE_PER_LEVEL = 0.18; // spawn rate +18% per level
export const UPTIME_SHRINK_PER_LVL = 0.12; // uptime -12% per level
export const DECOY_ADD_PER_LVL = 0.04; // decoy chance +0.04 per level
export const DECOY_CAP = 0.35; // never more than 35% decoys
/** Physiological floor on mole uptime (ms). Simple visual reaction time is
 *  ~213ms corrected; 350ms keeps even the hardest level fair. */
export const MIN_UPTIME_FLOOR_MS = 350;

// ── Scoring ──────────────────────────────────────────────
export const BASE_SCORE = 100; // points for a hit at zero timing bonus
export const TIMING_BONUS_MAX = 50; // extra points for an instant hit
/** Seconds knocked off the clock when the player taps a decoy. Surfaced in the
 *  floating "-Ns" popup so the loss is visible. The wrong-tap punishment + the
 *  anti-spray lever: tap everything and the clock dies before the goal. */
export const DECOY_TIME_PENALTY_S = 2;
/** Points also docked on a wrong tap (on top of the time penalty), floored at 0. */
export const DECOY_PENALTY = 100;

// ── Score popups (floating +N / -N at the tap point) ─────
export const POPUP_TTL = 0.9; // seconds a popup stays before it fades out
export const POPUP_RISE = 90; // logical units/sec it drifts upward (0 under reduced-motion)
export const POPUP_FONT = 34; // logical px font size

/** The four decoy species (Kenney CC0 sprites). Order is stable so seeded RNG
 *  picks the same species across test runs. */
export const DECOY_SPECIES = ['frog', 'parrot', 'snake', 'sloth'] as const;
export type DecoySpecies = (typeof DECOY_SPECIES)[number];
