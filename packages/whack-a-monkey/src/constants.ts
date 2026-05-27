// Render-only constants for game.ts. Gameplay constants (world size, grid,
// mole physics, spawn, scoring, difficulty) live in src/sim/constants.ts -
// the single source used by both the live driver and the headless replay run.

/** Largest real-time step honored in one frame (seconds). After a tab-stall
 *  the real delta can be huge; clamping keeps cosmetic timers from teleporting.
 *  NOT a sim timestep - the sim uses the fixed STEP_S from sim/constants.ts. */
export const MAX_DT = 1 / 30;

// ── Hit particles ────────────────────────────────────────
export const HIT_PARTICLES = { count: 10, ttl: 0.35, speed: 220 } as const;
export const PARTICLE_GRAVITY = 600; // logical units/s^2 downward

// ── Decoy feedback ───────────────────────────────────────
export const DECOY_FLASH_S = 0.2; // red overlay duration on a decoy tap

// ── Score popups (floating +N / -N at the tap point) ─────
export const POPUP_TTL = 0.9; // seconds a popup stays before it fades out
export const POPUP_RISE = 90; // logical units/sec it drifts upward (0 under reduced-motion)
export const POPUP_FONT = 34; // logical px font size
