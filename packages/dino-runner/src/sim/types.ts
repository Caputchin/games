// Shapes for the headless Dino Runner sim. Everything here is plain
// JSON-serializable: the sim state is threaded linearly through the kit's reducer
// (init -> step* -> tick)* and must never carry a closure, a Date, a DOM node, or
// a reference to the renderer. Determinism is the whole point — identical
// (seed, config, recorded actions) MUST yield an identical outcome live and on
// replay.

import type { RngState } from '@caputchin/engine-runtime';
import type { SimBox } from './constants.js';
export type { SimBox };

/** Server-supplied, gate-affecting gameplay config the run executes under. Only
 *  fields that change the sim outcome live here; presentation toggles live in
 *  the live driver's config, never here. Read the pass gate (`passScore`) from
 *  this — it is server-sourced and safe — never from the trace. */
export interface SimConfig {
  passScore: number;
  startSpeed: number;
  maxSpeed: number;
  acceleration: number;
  gravity: number;
  /** Initial upward velocity magnitude (positive number; negated inside the sim). */
  jumpVelocity: number;
  gapCoefficient: number;
  birdsEnabled: boolean;
  birdMinSpeed: number;
}

/** Obstacle kind, discriminated by string so state stays readable in tests. */
export type ObstacleTypeId = 'cactus-small' | 'cactus-large' | 'bird';

/** One live obstacle — plain data, no class. Mirrors ActiveObstacle but with
 *  RNG removed (RNG lives in SimState). */
export interface SimObstacle {
  typeId: ObstacleTypeId;
  x: number;
  y: number;
  width: number;
  height: number;
  size: number;
  /** Collision boxes in obstacle space (clump-expanded), each { x,y,w,h }. */
  boxes: readonly SimBox[];
  gap: number;
  /** Extra per-obstacle speed offset (birds only). */
  speedOffset: number;
  frame: number;
  animTimer: number;
}

/** Discrete input actions. Jump and duck are the two possible
 *  inputs; each is a press (start) or release (end). Tick-stamped when
 *  recorded so the exact logical tick is preserved. */
export type SimAction =
  | { k: 'jump_press' }
  | { k: 'jump_release' }
  | { k: 'duck_press' }
  | { k: 'duck_release' };

/** Runner physics state. Pulled out of the Runner class into plain data. */
export interface SimRunner {
  /** Fixed horizontal position; world scrolls past. */
  x: number;
  y: number;
  velocity: number;
  duckHeld: boolean;
  speedDrop: boolean;
  reachedMinHeight: boolean;
  runTimer: number;
  runFrame: number;
  duckTimer: number;
  duckFrame: number;
  jumpCount: number;
  status: 'waiting' | 'running' | 'jumping' | 'ducking' | 'crashed';
}

/** The full sim state threaded through the reducer. */
export interface SimState {
  /** Serializable PRNG state (sfc32). Reconstructed with `rngFromState` when
   *  a tick needs randomness, then captured back. */
  rng: RngState;
  cfg: SimConfig;
  runner: SimRunner;
  obstacles: SimObstacle[];
  speed: number;
  distanceRan: number;
  /** Latched once distanceScore >= passScore; the driver submits trace on
   *  rising edge. */
  verified: boolean;
  /** Accumulated ms owed since last obstacle update (Horizon is render-only,
   *  not in the sim). */
  tick: number;
}

/** Render projection the live driver consumes. Keeps rng + spawn bookkeeping
 *  out of the renderer. */
export interface SimView {
  runner: SimRunner;
  obstacles: readonly SimObstacle[];
  speed: number;
  distanceRan: number;
  verified: boolean;
  crashed: boolean;
}
