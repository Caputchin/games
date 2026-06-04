// Shared constants. The world dimensions MUST mirror sim.rs (the arena radius is
// the contract the input projection and the renderer both map against).

export const TICK_HZ = 60;
export const DT_MS = 1000 / TICK_HZ;

/** Arena radius in world units. Mirrors `ARENA_R` in sim.rs. */
export const ARENA_R = 10;

export const KIND_CHASER = 0;
export const KIND_WEAVER = 1;
export const KIND_SPLITTER = 2;

/** Phase codes in the live_state buffer (mirror sim.rs Phase). */
export const PHASE_PLAYING = 0;
export const PHASE_WON = 1;
export const PHASE_LOST = 2;
