// Pure scoring + win check. The round is a race: whack `passHits` monkeys
// before the clock runs out. The clock itself lives in game.ts (it is real
// elapsed time); a wrong tap knocks seconds off it (see DECOY_TIME_PENALTY_S).
// Here we only track the monkey count + points and answer "won yet?". Kept pure
// so the rule is unit-tested in isolation (tests/scoring.test.ts). The
// orchestrator keeps a `passed` latch so bridge.pass fires exactly once.

import { BASE_SCORE, DECOY_PENALTY, TIMING_BONUS_MAX } from './constants.js';

export interface RoundState {
  /** Monkeys tapped (counts toward the goal). */
  goodHits: number;
  /** Accumulated points (base + timing bonus per good hit). */
  score: number;
  /** Monkeys needed to win before time runs out. */
  passHits: number;
}

/** Fresh round state for the given goal. */
export function initRound(passHits: number): RoundState {
  return { goodHits: 0, score: 0, passHits };
}

/** Won once enough monkeys are whacked. bridge.pass is latched once by the caller. */
export function isPass(s: RoundState): boolean {
  return s.goodHits >= s.passHits;
}

/** Tap on a monkey: +1 good hit and a score award. `timingFraction` is the
 *  caller's clamped [0,1] freshness of the hit (1 = tapped the instant it rose,
 *  0 = tapped as it was about to duck); it scales the timing bonus. */
export function onGoodHit(s: RoundState, timingFraction: number): RoundState {
  const f = timingFraction < 0 ? 0 : timingFraction > 1 ? 1 : timingFraction;
  const award = BASE_SCORE + Math.round(TIMING_BONUS_MAX * f);
  return { ...s, goodHits: s.goodHits + 1, score: s.score + award };
}

/** Tap on a decoy: docks points (floored at 0). The matching time penalty is
 *  applied by the caller, since the clock lives in game.ts. */
export function onDecoyHit(s: RoundState): RoundState {
  return { ...s, score: Math.max(0, s.score - DECOY_PENALTY) };
}
