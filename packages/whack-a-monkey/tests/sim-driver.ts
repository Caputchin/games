// A headless stand-in for the live driver (game.ts), shared by the sim tests.
// It runs the SAME loop the kit's `replay` runs (apply this tick's actions,
// then tick once) and records the tap actions it applied - exactly what the
// real driver does, minus the DOM. Replaying the recorded trace must reproduce
// the live score; that equivalence is the core guarantee these tests assert.

import { engine } from '../src/sim/engine.js';
import type { SimAction } from '../src/sim/types.js';
import type { Seed, TickInput } from '@caputchin/engine-runtime';

export interface PlayResult {
  score: number;
  goodHits: number;
  endTick: number;
  recorded: TickInput<SimAction>[];
}

export interface PlayOpts {
  /** Keep tapping monkeys until goodHits reaches passHits + this margin, then
   *  idle. The threshold is read from the engine's RESOLVED config, so tests
   *  express intent ("a few past the gate") without building a SimConfig. Omit
   *  to tap forever. */
  tapMargin?: number;
  maxTicks: number;
}

/** Drive the engine like the live loop: per tick, decide + apply + record the
 *  actions, then advance one logical tick. Taps every live monkey (not decoys)
 *  until passHits + `tapMargin`, then idles to let the clock run out. */
export function play(
  seed: Seed,
  config: Record<string, unknown> | null,
  opts: PlayOpts,
): PlayResult {
  let state = engine.init({ seed, config });
  const recorded: TickInput<SimAction>[] = [];
  let tick = 0;
  // Threshold from the engine's own resolved config (it owns the transform now).
  const target =
    opts.tapMargin === undefined ? Number.POSITIVE_INFINITY : state.cfg.passHits + opts.tapMargin;

  while (!engine.isOver(state) && tick < opts.maxTicks) {
    const acts: SimAction[] = [];
    if (state.goodHits < target) {
      for (const m of state.moles) {
        if (m.kind === 'monkey' && m.phase === 'up' && !m.hit) {
          acts.push({ holeIndex: m.holeIndex });
        }
      }
    }
    for (const a of acts) {
      state = engine.step(state, a);
      recorded.push({ tick, action: a });
    }
    state = engine.tick(state);
    tick++;
  }

  return {
    score: engine.result(state).score,
    goodHits: state.goodHits,
    endTick: tick,
    recorded,
  };
}
