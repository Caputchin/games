// Pure difficulty ramp. The round gets harder the longer it runs: fruit (and
// bombs) launch more often and bombs grow more frequent. Driven by elapsed PLAY
// time in seconds so it tracks the fixed-step sim, not the real frame rate.
//
// Determinism: the ramp's `exp` goes through `cap.math.exp` (fdlibm,
// bit-identical across runtimes). Native `Math.exp` is NOT correctly-rounded by
// IEEE-754 — its last ULP varies between engines — so it would silently diverge
// the live play from the server replay. `Math.min` is exact and stays native.

import { cap } from '@caputchin/engine-runtime';

export interface DifficultyBase {
  spawnRate: number;
  hazardChance: number;
}

/** e-folding time (seconds): difficulty approaches its ceiling smoothly. */
const RAMP_TAU = 45;
/** Max extra spawn-rate multiplier added over the ramp (1x -> ~2.6x). */
const SPAWN_GROWTH = 1.6;
/** Max amount added to the bomb chance over the ramp. */
const HAZARD_ADD = 0.22;
/** Hard ceiling on bomb chance so it never becomes unfair. */
const HAZARD_CAP = 0.45;

/** Difficulty at `elapsedS` seconds of play, ramped from the config base.
 *  Monotonic, smooth, and capped. At t=0 it equals the base. */
export function difficultyAt(elapsedS: number, base: DifficultyBase): DifficultyBase {
  const k = 1 - cap.math.exp(-Math.max(0, elapsedS) / RAMP_TAU); // 0 -> 1
  return {
    spawnRate: base.spawnRate * (1 + SPAWN_GROWTH * k),
    hazardChance: Math.min(HAZARD_CAP, base.hazardChance + HAZARD_ADD * k),
  };
}
