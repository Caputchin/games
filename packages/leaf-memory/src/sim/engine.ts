// The headless Leaf Memory reducer. `defineEngine` declares the
// pure state machine the kit drives both ways: the live driver steps it
// tick-by-tick (recording the card-pick inputs as the opaque trace) and
// the server replays the SAME ticks over (seed, config, trace). Identical
// inputs => identical outcome, which is what makes the server's verdict
// trustworthy.
//
// Determinism rules obeyed here:
//   - All randomness comes from `rng` (seeded from ctx.seed, state kept
//     in SimState). Board shuffle is the only random operation; card picks
//     after that are fully deterministic from player input.
//   - Time is tick-counted (ticksElapsed), never wall-clock.
//   - The flip-back delay is a tick countdown in state, not setTimeout.
//   - No Date / Math.random / DOM / async.
//
// Pass gate: all pairs matched at game-over (matchCount >= cfg.pairs). The
// gate lives in `result` beside the state it judges, so the live game and the
// headless replay share ONE pass decision - never an external gate one path
// could compute differently.
//
// Config: `C` is the RAW dashboard config (a flat Record) or null. `init` is
// the single transform site - it calls `resolveSimConfig` to turn the raw
// config into this round's SimConfig, so both execution paths (live driver and
// replay, both via `init`) derive identical sim params.

import { defineEngine } from '@caputchin/engine-kit';
import { rng } from '@caputchin/determinism';
import { LEAF_IDS } from '../leaves.js';
import { resolveSimConfig } from './config.js';
import type { SimState, SimAction, SimView } from './types.js';

/** The raw dashboard config the engine resolves internally. Flat scalar map
 *  (or null); the engine never trusts its shape - `resolveSimConfig` validates
 *  and clamps every field. */
type RawConfig = Record<string, unknown>;

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

export const engine = defineEngine<SimState, SimAction, RawConfig, SimView>({
  init({ seed, config }) {
    const r = rng(seed);

    // ONE transform site: raw dashboard config (or null) -> this round's
    // SimConfig. Live play and replay both arrive here, so they cannot diverge.
    const cfg = resolveSimConfig(config);

    // Build the deck: two copies of each leaf kind for the requested pair
    // count, then shuffle. LEAF_IDS.length = 6 (hard cap in leaves.ts).
    const pairs = Math.min(cfg.pairs, LEAF_IDS.length);
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
      cfg,
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

    // Second pick - evaluate the pair.
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
    // Engine owns the pass decision: the round passes iff every pair was
    // matched (matchCount reaches cfg.pairs) before the budget ran out.
    // isOver fires on allMatched OR timedOut, so at game-over a full match
    // count is exactly a genuine win. score = matched pairs.
    return {
      score: state.matchCount,
      passed: state.matchCount >= state.cfg.pairs,
    };
  },

  view(state) {
    return {
      // Reveal a leaf only for a card that is face-up RIGHT NOW (matched, or one
      // of the two live picks); a face-down card reports kind: null so the hidden
      // answer never crosses to the client via the view projection. This closes
      // the cheap view()-reader attack. The leaf identities still live in the sim
      // state (the live driver reads them to paint the brief peek phase): a fully
      // client-side deterministic memory game cannot hide them from a determined
      // heap reader, so this raises the bar, it does not make leaf-memory immune.
      cards: state.cards.map((c, i) => ({
        kind: c.matched || i === state.firstPick || i === state.secondPick ? c.kind : null,
        matched: c.matched,
      })),
      firstPick: state.firstPick,
      secondPick: state.secondPick,
      flipBackTicks: state.flipBackTicks,
      matchCount: state.matchCount,
      ticksElapsed: state.ticksElapsed,
      budgetTicks: state.cfg.budgetTicks,
      pairs: state.cfg.pairs,
      allMatched: state.matchCount >= state.cfg.pairs,
      timedOut: state.ticksElapsed >= state.cfg.budgetTicks,
    };
  },
});
