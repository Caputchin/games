// Scoring + pass-gate rules for Dino Runner.
//
// The displayed score is the distance run, scaled by SCORE_COEFFICIENT so it
// reads like the familiar Chrome dino 5-digit counter. The game is endless:
// a run ends only on a crash, so the pass gate is evaluated at crash time.
//
// Pass model (per the session decision): bridge.pass fires once a crash run
// reaches `passScore`, and again on every later run that beats the best
// score already passed. `evaluatePass` is the single source of that rule so
// game.ts stays declarative and the logic is unit-tested in isolation.

import { SCORE_COEFFICIENT } from './constants.js';

/** Distance (logical units) -> integer score. */
export function toScore(distanceRan: number): number {
  return Math.floor(distanceRan * SCORE_COEFFICIENT);
}

export interface PassDecision {
  /** Whether bridge.pass should fire for this crash. */
  pass: boolean;
  /** The score to report (only meaningful when `pass` is true). */
  score: number;
  /** The new high-water mark of passed scores to carry forward. */
  bestPassed: number;
}

/** Decide whether a finished run passes the gate.
 *
 *  @param score       final score of the run that just crashed
 *  @param passScore   threshold a run must reach to count as a pass
 *  @param bestPassed  highest score already reported via bridge.pass this
 *                     session (-1 before any pass)
 *
 *  Fires when the run cleared the threshold AND beat the best previously
 *  passed score: that yields exactly one pass at first qualifying crash,
 *  then one more on each subsequent personal best. */
export function evaluatePass(score: number, passScore: number, bestPassed: number): PassDecision {
  const qualifies = score >= passScore && score > bestPassed;
  return {
    pass: qualifies,
    score,
    bestPassed: qualifies ? score : bestPassed,
  };
}
