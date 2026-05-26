// The headless Leaf Memory reducer. `defineEngine` declares the
// pure state machine the kit drives both ways: the live driver steps it
// tick-by-tick (recording the card-pick inputs as the opaque trace) and
// the server replays the SAME ticks over (seed, config, trace). Identical
// inputs => identical outcome, which is what makes the server's verdict
// trustworthy.
//
// Determinism rules obeyed here:
//   - All randomness comes from `cap.rng` (seeded from ctx.seed, state kept
//     in SimState). Board shuffle is the only random operation; card picks
//     after that are fully deterministic from player input.
//   - Time is tick-counted (ticksElapsed), never wall-clock.
//   - The flip-back delay is a tick countdown in state, not setTimeout.
//   - No Date / Math.random / DOM / async.
//
// Pass gate: all pairs matched AND ticksElapsed < budgetTicks at game-over.
// Gate reads budgetTicks from config (server-supplied), never from the trace.

import { cap, defineEngine } from '@caputchin/engine-runtime';
import { LEAF_IDS } from '../leaves.js';
import type { SimState, SimAction, SimConfig, SimView } from './types.js';

/** Seeded Fisher-Yates shuffle. `intInRange(n)` returns a uniform int in [0, n).
 *  Returns a new array. */
function shuffleDeck(deck: number[], intInRange: (n: number) => number): number[] {
  const arr = deck.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = intInRange(i + 1); // uniform int in [0, i+1)
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

export const engine = defineEngine<SimState, SimAction, SimConfig, SimView>({
  init({ seed, config }) {
    const r = cap.rng(seed);

    // Build the deck: two copies of each leaf kind for the requested pair
    // count, then shuffle. LEAF_IDS.length = 6 (hard cap in leaves.ts).
    const pairs = Math.min(config.pairs, LEAF_IDS.length);
    const deck: number[] = [];
    for (let i = 0; i < pairs; i++) {
      deck.push(i, i); // two cards share the same leaf kind
    }
    // Use r.int(n) which returns a uniform integer in [0, n).
    const shuffled = shuffleDeck(deck, (n) => r.int(n));

    return {
      rng: r.state,
      cards: shuffled.map((kind) => ({ kind, matched: false })),
      firstPick: -1,
      secondPick: -1,
      flipBackTicks: 0,
      matchCount: 0,
      ticksElapsed: 0,
      cfg: config,
    };
  },

  step(state, action) {
    const { cardIndex } = action;

    // Ignore input while the flip-back countdown is running (mismatched
    // pair is still showing; the live driver enforces this via the DOM
    // `busy` flag, but the reducer must be the source of truth).
    if (state.flipBackTicks > 0) return state;

    const card = state.cards[cardIndex];
    if (!card) return state;
    if (card.matched) return state;
    if (state.firstPick === cardIndex) return state; // tapping same card twice

    if (state.firstPick === -1) {
      // First pick of a new pair attempt.
      state.firstPick = cardIndex;
      return state;
    }

    // Second pick — evaluate the pair.
    state.secondPick = cardIndex;
    const first = state.cards[state.firstPick]!;
    const second = card;

    if (first.kind === second.kind) {
      // Match: mark both and clear picks immediately (no countdown).
      first.matched = true;
      second.matched = true;
      state.matchCount += 1;
      state.firstPick = -1;
      state.secondPick = -1;
    } else {
      // Mismatch: start the flip-back countdown. Input is locked until
      // flipBackTicks reaches 0 in tick().
      state.flipBackTicks = state.cfg.flipBackTicks;
    }

    return state;
  },

  tick(state) {
    state.ticksElapsed += 1;

    if (state.flipBackTicks > 0) {
      state.flipBackTicks -= 1;
      if (state.flipBackTicks === 0) {
        // Countdown expired: flip the mismatched pair back face-down.
        state.firstPick = -1;
        state.secondPick = -1;
      }
    }

    return state;
  },

  isOver(state) {
    const allMatched = state.matchCount >= state.cfg.pairs;
    const timedOut = state.ticksElapsed >= state.cfg.budgetTicks;
    return allMatched || timedOut;
  },

  result(state) {
    // Score encodes the pass result: > 0 = passed (match count = pairs),
    // 0 = timed out. The `passed` predicate in run.ts reads the gate
    // from config (pairs), so the score is just a convenient summary.
    return { score: state.matchCount };
  },

  view(state) {
    return {
      cards: state.cards,
      firstPick: state.firstPick,
      secondPick: state.secondPick,
      flipBackTicks: state.flipBackTicks,
      matchCount: state.matchCount,
      ticksElapsed: state.ticksElapsed,
      budgetTicks: state.cfg.budgetTicks,
      allMatched: state.matchCount >= state.cfg.pairs,
      timedOut: state.ticksElapsed >= state.cfg.budgetTicks,
    };
  },
});
