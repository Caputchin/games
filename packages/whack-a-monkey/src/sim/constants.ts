// Logical world + physics tuning for the headless WAM sim.
// Everything here is shared by the live driver (game.ts) and the replay run
// (run.ts). Physics expressed PER SECOND, integrated by a FIXED logical
// timestep (STEP_S) every tick - never per real frame. Live driver advances
// with a fixed-step accumulator; server replays the SAME ticks → live score
// == replay score by construction.
//
// The logical world is FIXED. The mole grid is fixed world coords so hit
// geometry is identical live and on replay (the server has no container).

import { FIXED_TIMESTEP_MS } from '@caputchin/engine-runtime';

/** Fixed logical world. */
export const WORLD_WIDTH = 800;
export const WORLD_HEIGHT = 450;

/** Fixed simulation timestep in seconds. */
export const STEP_S = FIXED_TIMESTEP_MS / 1000;

/** Upper bound on replay ticks (~8 min). Guards a non-terminating trace. */
export const MAX_TICKS = 30000;

// ── Grid ─────────────────────────────────────────────────
export const GRID_COLS = 3;
export const GRID_ROWS = 3;
export const HOLE_COUNT = GRID_COLS * GRID_ROWS;
/** Fraction of the world reserved as outer margin around the grid. */
export const GRID_MARGIN = 0.06;

// ── Mole sizing ──────────────────────────────────────────
export const MOLE_RADIUS = 64;
export const MOLE_HIT_PAD = 14;
export const MIN_HIT_SCALE = 0.5;

// ── Emergence spring ─────────────────────────────────────
export const EMERGE_OMEGA = 22;
export const EMERGE_ZETA = 0.55;
export const EMERGE_INIT_VEL = -2;

// ── Retract spring ───────────────────────────────────────
export const RETRACT_OMEGA = 28;
export const RETRACT_ZETA = 1.0;

// ── Spawn scheduling ─────────────────────────────────────
export const BASE_SPAWN_RATE = 1.2;
export const SPAWN_JITTER = 0.4;
export const MIN_INTERVAL = 0.15;
export const HOLE_COOLDOWN_FACTOR = 1.2;
export const MAX_CONCURRENT = 4;
export const MAX_CONCURRENT_DECOY = 2;

// ── Difficulty ladder ────────────────────────────────────
export const LEVEL_COUNT = 3;
export const RATE_PER_LEVEL = 0.18;
export const UPTIME_SHRINK_PER_LVL = 0.12;
export const DECOY_ADD_PER_LVL = 0.04;
export const DECOY_CAP = 0.35;
export const MIN_UPTIME_FLOOR_MS = 350;

// ── Scoring ──────────────────────────────────────────────
export const BASE_SCORE = 100;
export const TIMING_BONUS_MAX = 50;
export const DECOY_TIME_PENALTY_S = 2;
export const DECOY_PENALTY = 100;

/** The four decoy species. Order is stable for seeded RNG. */
export const DECOY_SPECIES = ['frog', 'parrot', 'snake', 'sloth'] as const;
export type DecoySpecies = (typeof DECOY_SPECIES)[number];
