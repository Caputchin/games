// Shared constants. The world dimensions MUST mirror sim.rs (the arena radius is
// the contract the input projection and the renderer both map against).

export const TICK_HZ = 60;
export const DT_MS = 1000 / TICK_HZ;

/** Arena radius in world units. Mirrors `ARENA_R` in sim.rs. */
export const ARENA_R = 14;

export const KIND_CHASER = 0;
export const KIND_WEAVER = 1;
export const KIND_SPLITTER = 2;

/** Decoded tag of a render-omitted honeypot phantom in the `live_state` listing
 *  (rule O2 mitigation). Mirrors `PHANTOM_CODE` in lib.rs. The driver drops these
 *  entries after reversing the per-session tag XOR, so phantoms never render. */
export const PHANTOM_TAG = 3;

/** Fold the four seed words into the per-session tag mask (0..7). Mirrors
 *  `tag_mask` in lib.rs; the live build XORs each entity tag with it. */
export function tagMask(seed: readonly number[]): number {
  return ((seed[0]! ^ seed[1]! ^ seed[2]! ^ seed[3]!) >>> 0) & 0x7;
}

/** Phase codes in the live_state buffer (mirror sim.rs Phase). */
export const PHASE_PLAYING = 0;
export const PHASE_WON = 1;
export const PHASE_LOST = 2;
