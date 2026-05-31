// Fixed-point + timing constants. These MUST match src/sim.rs (FP, TICK_HZ): the
// config ints are interpreted in these units by the Bevy sim both ends, so a
// mismatch would make live play and replay disagree.

/** Subunits per world unit (fixed-point scale). Mirrors `sim::FP`. */
export const FP = 256;
/** Logical ticks per second (fixed timestep). Mirrors `sim::TICK_HZ`. */
export const TICK_HZ = 60;
