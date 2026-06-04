// A headless stand-in for the live driver (game.ts), shared by the sim tests.
// Runs the SAME loop the kit's `replay` runs (apply this tick's actions, then
// tick once) and records the card-pick actions it applied - exactly what the
// real driver does, minus the DOM. Replaying the recorded trace must reproduce
// the live score; that equivalence is the core guarantee these tests assert.

import { engine } from '../src/sim/engine.js';
import type { SimAction } from '../src/sim/types.js';
import type { Seed } from '@caputchin/replay-contract';
import type { TickInput } from '@caputchin/engine-kit';

export interface PlayResult {
  score: number;
  allMatched: boolean;
  timedOut: boolean;
  endTick: number;
  recorded: TickInput<SimAction>[];
}

export interface PlayOpts {
  /** Flip every unmatched pair each tick until all are matched.
   *  Stops flipping after `stopAfterPairs` successful matches so tests
   *  can force a timeout by only clearing some of the board. */
  stopAfterPairs?: number;
  maxTicks: number;
}

/** Drive the engine like the live loop: per tick, decide + apply + record the
 *  actions, then advance one logical tick. This driver picks the first
 *  available pair of matching cards (cards with the same kind) from state,
 *  submitting both as separate step() actions on the same tick to mirror how
 *  the live driver queues two clicks. */
export function play(
  seed: Seed,
  config: Record<string, unknown> | null,
  opts: PlayOpts,
): PlayResult {
  let state = engine.init({ seed, config });
  const recorded: TickInput<SimAction>[] = [];
  let tick = 0;
  // Pairs come from the engine's resolved config (it owns the transform now).
  const stopAfter = opts.stopAfterPairs ?? state.cfg.pairs;

  while (!engine.isOver(state) && tick < opts.maxTicks) {
    const acts: SimAction[] = [];

    if (state.matchCount < stopAfter && state.flipBackTicks === 0) {
      // Find an unmatched pair: scan for any two unmatched cards with the same kind.
      const unmatched = state.cards
        .map((c, i) => ({ ...c, i }))
        .filter((c) => !c.matched);
      const seen = new Map<number, number>(); // kind -> first index
      outer: for (const c of unmatched) {
        const prev = seen.get(c.kind);
        if (prev !== undefined) {
          // Pick first card, then second (two separate actions).
          acts.push({ cardIndex: prev });
          acts.push({ cardIndex: c.i });
          break outer;
        }
        seen.set(c.kind, c.i);
      }
    }

    for (const a of acts) {
      state = engine.step(state, a);
      recorded.push({ tick, action: a });
    }
    state = engine.tick(state);
    tick++;
  }

  const v = engine.view!(state);
  return {
    score: engine.result(state).score,
    allMatched: v.allMatched,
    timedOut: v.timedOut,
    endTick: tick,
    recorded,
  };
}
