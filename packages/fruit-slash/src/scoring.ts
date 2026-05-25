// Pure pass-gate + lives model. The round is a bounded challenge: slice
// `passScore` fruit before lives run out. Decisions are pure so game.ts stays
// declarative and the rules are unit-tested in isolation (tests/scoring.test.ts).
// The orchestrator keeps a `passed` latch so bridge.pass fires exactly once.

export interface RoundState {
  sliced: number;
  lives: number;
  passScore: number;
}

export type RoundEvent = 'none' | 'pass' | 'gameover';

/** Game over once lives hit zero; pass once enough fruit are sliced. */
export function evaluate(s: RoundState): RoundEvent {
  if (s.lives <= 0) return 'gameover';
  if (s.sliced >= s.passScore) return 'pass';
  return 'none';
}

/** Slicing a good fruit: +1, then re-evaluate. */
export function onGoodSlice(s: RoundState): { state: RoundState; event: RoundEvent } {
  const state: RoundState = { ...s, sliced: s.sliced + 1 };
  return { state, event: evaluate(state) };
}

/** A penalty event (missed good fruit, or a sliced bomb): -1 life, floored. */
export function onLifeLost(s: RoundState): { state: RoundState; event: RoundEvent } {
  const state: RoundState = { ...s, lives: Math.max(0, s.lives - 1) };
  return { state, event: evaluate(state) };
}
