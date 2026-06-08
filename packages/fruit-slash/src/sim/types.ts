// Shapes for the headless Fruit Slash sim. Everything here is plain
// JSON-serializable: the sim state is threaded linearly through the kit's reducer
// (init -> step* -> tick)* and must never carry a closure, a Date, a DOM node, or
// a reference to the renderer. Determinism is the whole point - identical
// (seed, config, recorded actions) MUST yield an identical outcome live and on
// replay.

import type { RngState } from '@caputchin/determinism';

/** Server-supplied, gate-affecting gameplay config the run executes under. Only
 *  these five fields change the sim; presentation toggles (sound / show*) live in
 *  the live driver's config, never here, because they cannot affect the verdict.
 *  Read the pass gate (`passScore`) from this - it is server-sourced and safe -
 *  never from the trace. */
export interface SimConfig {
  passScore: number;
  lives: number;
  /** Fruit launched per second (the ramp grows it over the round). */
  spawnRate: number;
  /** Downward acceleration, units/s^2. */
  gravity: number;
  /** Probability a launched object is a bomb, 0..1 (the ramp grows it). */
  hazardChance: number;
}

/** Target kind. Numeric so the state stays compact. */
export const GOOD = 0;
export const HAZARD = 1;
export type Kind = typeof GOOD | typeof HAZARD;

/** A live launched object. `hue` / `spin` / `spinRate` are render hints (drawn
 *  from the same rng stream so they stay deterministic, but they never affect the
 *  verdict). `sliced` marks a target hit this tick; tick() culls it next advance,
 *  one tick after the renderer has drawn its splatter. */
export interface SimTarget {
  id: number;
  /** Logical tick the target launched. Drives the reaction-time gate: a slice
   *  landing fewer than the human-reaction floor of ticks after this is
   *  superhuman (a frame-perfect bot) and does not score. */
  spawnTick: number;
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hue: number;
  spin: number;
  spinRate: number;
  sliced: 0 | 1;
  /** Per-stroke slice-progress anchor for the genuine-swipe gate (rule U6). A
   *  slice only lands once the blade has travelled `MIN_SLICE_SPAN` from where it
   *  FIRST touched this fruit in the CURRENT down-stroke - a 1px point-nick can
   *  never reach it, forcing a real swipe whose captured input falls in the rich
   *  path channel the input-signature judge scores. `cutSeen` flags the anchor as
   *  set; both reset at every pointer-down. Interaction progress, not latent
   *  answer state (it tells a reader nothing about future spawns or the seed). */
  cutX: number;
  cutY: number;
  cutSeen: 0 | 1;
}

/** A transient render cue the reducer emits for the live driver to turn into
 *  splatter + sfx. Render-only: the server ignores it. The reducer caps the
 *  array (see engine.ts) so a long replay can't grow it unbounded. */
export type FxKind = 'slice' | 'bomb' | 'miss';
export interface Fx {
  kind: FxKind;
  x: number;
  y: number;
  hue: number;
}

/** The full sim state threaded through the reducer. */
export interface SimState {
  /** Serializable PRNG state (sfc32). Reconstructed with `rngFromState` whenever
   *  a tick needs randomness, then captured back. */
  rng: RngState;
  /** Resolved config kept in state so `tick` (which only sees state) can read
   *  gravity / spawn / hazard. */
  cfg: SimConfig;
  targets: SimTarget[];
  nextId: number;
  /** Seconds accumulated toward the next spawn. */
  spawnTimer: number;
  /** Current inter-spawn interval (seconds), re-jittered per spawn. */
  interval: number;
  /** Good fruit sliced this round = the score. */
  sliced: number;
  lives: number;
  /** Seconds of play, drives the difficulty ramp. */
  elapsed: number;
  /** Logical ticks elapsed. Stamped onto each spawn and read at slice time for
   *  the reaction-time gate. */
  tick: number;
  /** Pointer-capture continuity for slice segments. */
  pointerDown: 0 | 1;
  lastX: number;
  lastY: number;
  hasLast: 0 | 1;
  /** Latched once `sliced >= passScore`; the driver submits the trace on the
   *  rising edge. */
  verified: 0 | 1;
  /** Render cues generated since the driver last read them. */
  fx: Fx[];
}

/** One recorded player input. Pointer coordinates are in LOGICAL WORLD units (the
 *  driver converts device px -> world before recording), so the replay applies
 *  them to the same fixed world and the slice geometry matches exactly. `k`:
 *  0 = pointer down, 1 = pointer move (the slice segment), 2 = pointer up. */
export type SimAction =
  | { k: 0; x: number; y: number }
  | { k: 1; x: number; y: number }
  | { k: 2 };

/** Render projection the live driver consumes via the kit's `project`. Keeps the
 *  rng / cfg / spawn bookkeeping out of the renderer. */
export interface SimView {
  targets: readonly SimTarget[];
  sliced: number;
  lives: number;
  verified: 0 | 1;
  fx: readonly Fx[];
}
