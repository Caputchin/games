// A headless stand-in for the live driver (game.ts), shared by the sim tests.
// It runs the SAME loop the kit's `replay` runs (apply this tick's actions, then
// tick once) and records the discrete jump/duck inputs — exactly what the real
// driver does, minus the DOM. Replaying the recorded trace must reproduce the
// live score; that equivalence is the ADR-0069 guarantee these tests assert.

import { engine } from '../src/sim/engine.js';
import type { SimAction, SimConfig } from '../src/sim/types.js';
import type { Seed, TickInput } from '@caputchin/engine-runtime';

export interface PlayResult {
  score: number;
  endTick: number;
  recorded: TickInput<SimAction>[];
}

export interface PlayOpts {
  /** Maximum logical ticks to run before stopping. */
  maxTicks: number;
  /** If true, attempt to jump over every obstacle by pressing jump when the
   *  leading obstacle is within ~80px of the runner. Default: true. */
  autoJump?: boolean;
}

/** Drive the engine like the live loop: per tick, decide + apply + record the
 *  actions, then advance one logical tick. Mimics the real driver's
 *  fixed-step accumulator — single-tick increments, discrete inputs stamped
 *  with their exact logical tick. */
export function play(seed: Seed, config: SimConfig, opts: PlayOpts): PlayResult {
  let state = engine.init({ seed, config });
  const recorded: TickInput<SimAction>[] = [];
  let tick = 0;
  const autoJump = opts.autoJump !== false;

  // Start the run immediately (tick 0) via jump_press.
  state = engine.step(state, { k: 'jump_press' });
  recorded.push({ tick: 0, action: { k: 'jump_press' } });

  // Track whether the last jump is still in the air (avoid spamming jump).
  let inAir = false;

  while (!engine.isOver(state) && tick < opts.maxTicks) {
    const acts: SimAction[] = [];

    if (autoJump) {
      // Press jump when the nearest obstacle is close enough that jumping now
      // will clear it. The heuristic: obstacle leading edge within [30, 90]
      // world units of the runner's front (runner.x + RUNNER_WIDTH = 94).
      const runnerFront = state.runner.x + 44; // RUNNER_WIDTH
      const isJumping = state.runner.status === 'jumping';

      if (!isJumping && inAir) {
        // Just landed; release the inAir latch.
        inAir = false;
        acts.push({ k: 'jump_release' });
      }

      if (!isJumping && !inAir) {
        // Check if we should jump now.
        for (const o of state.obstacles) {
          const dist = o.x - runnerFront;
          if (dist >= 0 && dist < 80) {
            acts.push({ k: 'jump_press' });
            inAir = true;
            break;
          }
        }
      }

      // If still jumping and rising past min height, auto-release for a full
      // jump (maximises clearance).
      if (isJumping && state.runner.reachedMinHeight) {
        acts.push({ k: 'jump_release' });
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
    endTick: tick,
    recorded,
  };
}
