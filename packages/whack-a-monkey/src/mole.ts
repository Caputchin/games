// Per-mole spring lifecycle. A mole rises from its hole on a damped spring,
// stays up for its uptime window, then ducks (auto-retract) or is tapped. The
// emergence value `scaleY` is driven by a physically-based spring integrated by
// real dt, so the pop plays at the same real-world speed on any refresh rate.
// The GAMEPLAY clock is `age` vs `uptimeS` (seconds), decoupled from the visual
// spring, so timeout + timing-bonus are frame-rate independent. Pure +
// side-effect-free so it unit-tests in isolation (tests/mole.test.ts).

import {
  EMERGE_INIT_VEL,
  EMERGE_OMEGA,
  EMERGE_ZETA,
  HIT_PUNCH_OMEGA,
  HIT_PUNCH_SCALE,
  HIT_PUNCH_ZETA,
  MIN_HIT_SCALE,
  RETRACT_OMEGA,
  RETRACT_ZETA,
  type DecoySpecies,
} from './constants.js';

export type MoleKind = 'monkey' | 'decoy';
export type MolePhase = 'up' | 'retracting' | 'dead';

export interface Mole {
  id: number;
  holeIndex: number;
  kind: MoleKind;
  /** Which decoy sprite to draw; null for a monkey. */
  species: DecoySpecies | null;
  phase: MolePhase;
  /** Seconds since the mole spawned (the gameplay clock). */
  age: number;
  /** Seconds the mole stays up before auto-retracting. */
  uptimeS: number;
  /** Emergence value, 0 (in hole) to ~1 (fully up, may overshoot). */
  scaleY: number;
  scaleVel: number;
  /** Hit-punch multiplier; jumps on a tap, springs back to 1. */
  punch: number;
  punchVel: number;
  /** True once the mole has been tapped (so a later duck is not a "miss"). */
  hit: boolean;
}

/** Semi-implicit (symplectic) Euler step of a damped spring toward `target`.
 *  Stable while dt < 2/omega; the loop's MAX_DT clamp guarantees this for every
 *  omega used here. Returns the next position + velocity. */
export function springStep(
  pos: number,
  vel: number,
  target: number,
  omega: number,
  zeta: number,
  dt: number,
): { pos: number; vel: number } {
  const accel = omega * omega * (target - pos) - 2 * zeta * omega * vel;
  const nextVel = vel + accel * dt;
  const nextPos = pos + nextVel * dt;
  return { pos: nextPos, vel: nextVel };
}

/** A fresh mole rising from `holeIndex`. */
export function spawnMole(
  id: number,
  holeIndex: number,
  kind: MoleKind,
  species: DecoySpecies | null,
  uptimeS: number,
): Mole {
  return {
    id,
    holeIndex,
    kind,
    species,
    phase: 'up',
    age: 0,
    uptimeS,
    scaleY: 0,
    scaleVel: EMERGE_INIT_VEL, // micro-compress anticipation before the pop
    punch: 1,
    punchVel: 0,
    hit: false,
  };
}

/** Only an up mole can be tapped. */
export function isTappable(m: Mole): boolean {
  return m.phase === 'up';
}

/** Apply a tap: start the duck and fire the hit punch. No-op if not tappable. */
export function tapMole(m: Mole): Mole {
  if (m.phase !== 'up') return m;
  return { ...m, phase: 'retracting', hit: true, punch: HIT_PUNCH_SCALE, punchVel: 0 };
}

/** Freshness of a hit in [0,1]: 1 the instant the mole rose, 0 as it ducks.
 *  Scales the timing bonus in scoring.ts. */
export function timingFraction(m: Mole): number {
  if (m.uptimeS <= 0) return 0;
  const f = 1 - m.age / m.uptimeS;
  return f < 0 ? 0 : f > 1 ? 1 : f;
}

/** Hit-test radius factor: the live emergence scale, floored so a mole that is
 *  only partway up is still comfortably tappable. */
export function hitScale(m: Mole): number {
  return m.scaleY < MIN_HIT_SCALE ? MIN_HIT_SCALE : m.scaleY;
}

/** Advance one mole by `dt` seconds. Auto-retracts once it has been up past its
 *  uptime, and dies once fully ducked. The caller detects an untapped monkey
 *  duck by watching for the up to retracting transition with `hit === false`. */
export function stepMole(m: Mole, dt: number): Mole {
  if (m.phase === 'dead') return m;
  let phase: MolePhase = m.phase;
  const age = m.age + dt;
  if (phase === 'up' && age >= m.uptimeS) phase = 'retracting';
  const target = phase === 'up' ? 1 : 0;
  const omega = phase === 'up' ? EMERGE_OMEGA : RETRACT_OMEGA;
  const zeta = phase === 'up' ? EMERGE_ZETA : RETRACT_ZETA;
  const s = springStep(m.scaleY, m.scaleVel, target, omega, zeta, dt);
  const p = springStep(m.punch, m.punchVel, 1, HIT_PUNCH_OMEGA, HIT_PUNCH_ZETA, dt);
  let scaleY = s.pos;
  let scaleVel = s.vel;
  if (phase === 'retracting' && scaleY <= 0.02 && Math.abs(scaleVel) < 0.05) {
    phase = 'dead';
    scaleY = 0;
    scaleVel = 0;
  }
  return { ...m, phase, age, scaleY, scaleVel, punch: p.pos, punchVel: p.vel };
}
