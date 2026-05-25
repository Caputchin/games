// Pure difficulty ramp. The round gets harder the longer it runs: fruit (and
// bombs) launch more often and bombs grow more frequent. Driven by elapsed PLAY
// time in seconds so it is frame-rate independent like the rest of the sim.
// Kept pure + unit-tested (tests/progression.test.ts).

export interface DifficultyBase {
  spawnRate: number;
  hazardChance: number;
}

export interface Difficulty {
  spawnRate: number;
  hazardChance: number;
}

/** Time constant (seconds): difficulty approaches its ceiling smoothly with
 *  this e-folding time. ~45s feels like a steady, noticeable ramp. */
const RAMP_TAU = 45;
/** Max extra spawn-rate multiplier added over the ramp (1x -> ~2.6x). */
const SPAWN_GROWTH = 1.6;
/** Max amount added to the bomb chance over the ramp. */
const HAZARD_ADD = 0.22;
/** Hard ceiling on bomb chance so it never becomes unfair. */
const HAZARD_CAP = 0.45;

/** Difficulty at `elapsedS` seconds of play, ramped from the config base.
 *  Monotonic, smooth, and capped. At t=0 it equals the base. */
export function difficultyAt(elapsedS: number, base: DifficultyBase): Difficulty {
  const k = 1 - Math.exp(-Math.max(0, elapsedS) / RAMP_TAU); // 0 -> 1
  return {
    spawnRate: base.spawnRate * (1 + SPAWN_GROWTH * k),
    hazardChance: Math.min(HAZARD_CAP, base.hazardChance + HAZARD_ADD * k),
  };
}
