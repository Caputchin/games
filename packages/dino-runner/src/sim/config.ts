// Physics constants shared between the sim's config resolution and the render
// layer (the JUMP object in constants.ts). These are the hard-coded fallbacks;
// the actual per-round SimConfig is derived from the RAW dashboard config by
// resolveSimConfig in src/config.ts (the single transform site, alongside the
// display resolver so the two can't drift).

/** Hard-coded fallback values for the two physics constants shared with the
 *  render layer (JUMP object in constants.ts). Exported so constants.ts imports
 *  them instead of re-typing the same literals. */
export const DEFAULT_GRAVITY = 0.6;
export const DEFAULT_JUMP_VELOCITY = 10;
