// A headless stand-in for the live driver (game.ts), shared by the sim tests. It
// runs the SAME loop the kit's `replay` runs (apply this tick's actions, then
// tick once) and records the pointer actions it applied — exactly what the real
// driver does, minus the DOM. Replaying the recorded trace must reproduce the
// live score; that equivalence is the core guarantee these tests assert.

import { engine } from '../src/sim/engine.js';
import { GOOD, type SimAction, type SimConfig } from '../src/sim/types.js';
import type { Seed, TickInput } from '@caputchin/engine-runtime';

export interface PlayResult {
  score: number;
  lives: number;
  endTick: number;
  recorded: TickInput<SimAction>[];
}

export interface PlayOpts {
  /** Keep slicing every live good fruit until the score reaches this, then go
   *  idle (let fruit escape) so the round ends. Default: slice forever (until
   *  maxTicks). */
  sliceUntil?: number;
  maxTicks: number;
}

/** Swipe across a target's center (down one side, move through, lift). */
function swipeOver(x: number, y: number): SimAction[] {
  return [
    { k: 0, x: x - 60, y },
    { k: 1, x: x + 60, y },
    { k: 2 },
  ];
}

/** Drive the engine like the live loop: per tick, decide + apply + record the
 *  actions, then advance one logical tick. Slices every live good fruit (dodging
 *  bombs) until `sliceUntil`, then idles to force a game-over. */
export function play(seed: Seed, config: SimConfig, opts: PlayOpts): PlayResult {
  let state = engine.init({ seed, config });
  const recorded: TickInput<SimAction>[] = [];
  let tick = 0;
  const target = opts.sliceUntil ?? Number.POSITIVE_INFINITY;

  while (!engine.isOver(state) && tick < opts.maxTicks) {
    const acts: SimAction[] = [];
    if (state.sliced < target) {
      for (const t of state.targets) {
        if (t.kind === GOOD && !t.sliced) acts.push(...swipeOver(t.x, t.y));
      }
    }
    for (const a of acts) {
      state = engine.step(state, a);
      recorded.push({ tick, action: a });
    }
    state = engine.tick(state);
    tick++;
  }

  return { score: engine.result(state).score, lives: state.lives, endTick: tick, recorded };
}
