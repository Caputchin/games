// Pure pass-gate + lives model. The round is a bounded challenge: slice
// `passScore` good fruit before lives run out. `evaluate` is the single decision
// the reducer reads (engine.ts applies the +1 / -1 counter mutations inline on
// the threaded state); pure integer math, bit-identical live and on replay.

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
