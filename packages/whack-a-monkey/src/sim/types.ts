// Shapes for the headless Whack-a-Monkey sim. Everything here is
// plain JSON-serializable: the sim state is threaded linearly through the kit's
// reducer (init -> step* -> tick)* and must never carry a closure, a Date, a
// DOM node, or a reference to the renderer. Determinism is the whole point -
// identical (seed, config, recorded actions) MUST yield an identical outcome
// live and on replay.

import type { RngState } from '@caputchin/determinism';

/** Server-supplied, gate-affecting gameplay config the run executes under.
 *  Only these fields change the sim; presentation toggles (sound / show*)
 *  live in the live driver's config, never here. Read the pass gate
 *  (`passHits`) from this - it is server-sourced and safe - never from the
 *  trace. */
export interface SimConfig {
  /** Monkeys to whack to pass. */
  passHits: number;
  /** Level-1 mole uptime in ms. */
  baseUptimeMs: number;
  /** Level-1 decoy chance, 0..1. */
  baseDecoyChance: number;
  /** Round time budget in seconds. */
  seconds: number;
}

/** A mole's lifecycle phase in the sim. */
export type SimMolePhase = 'up' | 'retracting' | 'dead';
/** Mole kind. */
export type SimMoleKind = 'monkey' | 'decoy';

/** A live mole in the sim. `holeIndex` identifies the hole; `age` tracks
 *  seconds visible (vs `uptimeS` for auto-retract). `scaleY` and `scaleVel`
 *  drive the spring (needed for replay because hit geometry depends on it). */
export interface SimMole {
  id: number;
  holeIndex: number;
  kind: SimMoleKind;
  phase: SimMolePhase;
  /** Seconds since the mole spawned. */
  age: number;
  /** Seconds the mole stays up before auto-retracting. */
  uptimeS: number;
  /** Emergence value 0 (in hole) to ~1 (fully up). */
  scaleY: number;
  scaleVel: number;
  /** True once tapped. */
  hit: boolean;
}

/** The full sim state threaded through the reducer. */
export interface SimState {
  /** Serializable PRNG state (sfc32). */
  rng: RngState;
  /** Resolved config kept in state so tick can read gates. */
  cfg: SimConfig;
  /** Live moles. */
  moles: SimMole[];
  nextId: number;
  /** Spawn timer accumulator (seconds). */
  spawnTimer: number;
  /** Current inter-spawn interval (seconds). */
  interval: number;
  /** Good monkey hits this round. */
  goodHits: number;
  /** Accumulated points. */
  score: number;
  /** Seconds left on the clock. */
  timeLeft: number;
  /** Current level index (0-based). */
  levelIndex: number;
  /** Hits in the current level (toward the level's goal). */
  hitsInLevel: number;
  /** Per-hole cooldown timers (seconds remaining). */
  holeCooldowns: number[];
  /** Index of the last-used hole (-1 = none). */
  lastHole: number;
  /** Latched once goodHits >= passHits. */
  verified: 0 | 1;
  /** Render cues for the live driver (ignored by replay). */
  fx: SimFx[];
}

/** A transient render cue the reducer emits for the live driver. */
export type SimFxKind = 'whack' | 'decoy' | 'level';
export interface SimFx {
  kind: SimFxKind;
  holeIndex: number;
  /** Score delta for the whack cue (positive for monkey, negative for decoy). */
  delta?: number;
}

/** One player action: a tap on a hole at logical tick `tick`. */
export interface SimAction {
  /** Hole index tapped. */
  holeIndex: number;
}

/** Render projection the live driver consumes. */
export interface SimView {
  moles: readonly SimMole[];
  goodHits: number;
  score: number;
  timeLeft: number;
  levelIndex: number;
  verified: 0 | 1;
  fx: readonly SimFx[];
}
