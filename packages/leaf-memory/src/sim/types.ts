// Types for the Leaf Memory pure reducer (ADR-0069). All state is
// plain-JSON-serializable: no functions, no DOM, no wall-clock references.
//
// Time is TICK-counted (ticksElapsed / budgetTicks), never wall-clock.
// The flip-back delay is a countdown in ticks stored in state, not a
// setTimeout — this is the critical change that makes live == replay.

import type { RngState } from '@caputchin/engine-runtime';

/** An identity value for each distinct leaf shape. Encoded as a small
 *  integer so the state stays serializable without importing leaf.ts. */
export type LeafKind = number; // 0..N-1, one per distinct leaf in the deck

/** A single card slot on the board. */
export interface CardState {
  /** Which leaf pair this card belongs to (two cards share the same kind). */
  kind: LeafKind;
  /** True once this card has been part of a successful match. */
  matched: boolean;
}

/** The full simulation state threaded through every tick and step. */
export interface SimState {
  /** PRNG state — seeded once in init, advanced whenever randomness is needed
   *  (only during init's shuffle, since later steps are deterministic flips). */
  rng: RngState;
  /** Cards in board order after the seeded shuffle. Immutable length. */
  cards: CardState[];
  /** Index of the first flipped card awaiting a second pick, or -1. */
  firstPick: number;
  /** Index of the second flipped card (only valid during the flip-back window
   *  when flipBackTicks > 0), or -1. */
  secondPick: number;
  /** Ticks remaining before a mismatched pair flips back face-down.
   *  0 = no pending flip-back; >0 = waiting, input locked. */
  flipBackTicks: number;
  /** How many matched pairs so far. */
  matchCount: number;
  /** How many ticks have elapsed since the round started. */
  ticksElapsed: number;
  /** Resolved config, baked into state so replay carries it correctly. */
  cfg: SimConfig;
}

/** Gameplay configuration (server-supplied; gate thresholds live here,
 *  never in the trace). At MVP the server passes null → DefaultSimConfig. */
export interface SimConfig {
  /** Total number of pairs on the board (2–6). */
  pairs: number;
  /** Time budget expressed as a tick count: Math.round(timeSec * 1000 / STEP_MS). */
  budgetTicks: number;
  /** Flip-back delay expressed as a tick count: Math.ceil(flipBackMs / STEP_MS). */
  flipBackTicks: number;
}

/** What the player action encodes: pick card at `cardIndex`. */
export interface SimAction {
  /** Card index (0-based). */
  cardIndex: number;
}

/** Read-only view the renderer consumes. Decouples renderer from PRNG state
 *  and other engine internals. */
export interface SimView {
  cards: readonly CardState[];
  firstPick: number;
  secondPick: number;
  flipBackTicks: number;
  matchCount: number;
  ticksElapsed: number;
  budgetTicks: number;
  allMatched: boolean;
  timedOut: boolean;
}
