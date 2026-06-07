// A headless stand-in for the live driver (game.ts), shared by the sim tests. It
// runs the SAME loop the kit's `replay` runs (apply this tick's actions, then
// tick once) and records the pointer actions it applied - exactly what the real
// driver does, minus the DOM. Replaying the recorded trace must reproduce the
// live score; that equivalence is the core guarantee these tests assert.

import { engine } from '../src/sim/engine.js';
import { GOOD, type SimAction } from '../src/sim/types.js';
import { TARGET_RADIUS, HIT_PAD } from '../src/sim/constants.js';
import type { Seed } from '@caputchin/replay-contract';
import { reactionFloorTicks } from '@caputchin/engine-kit';
import type { TickInput } from '@caputchin/engine-kit';

export interface PlayResult {
  score: number;
  lives: number;
  endTick: number;
  recorded: TickInput<SimAction>[];
}

export interface PlayOpts {
  /** Keep slicing every live good fruit until the score reaches passScore +
   *  this margin, then go idle (let fruit escape) so the round ends. The
   *  threshold is read from the engine's RESOLVED config, so tests express
   *  intent ("a few past the gate") without building a SimConfig. Omit to slice
   *  forever (until maxTicks). */
  sliceMargin?: number;
  /** Ticks to wait after a fruit launches before slicing it, modeling human
   *  reaction latency. Defaults safely above the engine's reaction floor so the
   *  driver plays like a human and its slices score. Set 0 to model a
   *  frame-perfect bot (whose slices the reaction gate refuses to score). */
  reactionDelay?: number;
  maxTicks: number;
}

// A precise human slice: a short swipe through the fruit's centre, not a wide
// sweep across the field (a wide sweep would clip bombs all over a dense board and
// is not how a deliberate player slices).
function swipeOver(x: number, y: number): SimAction[] {
  return [
    { k: 0, x: x - 10, y },
    { k: 1, x: x + 10, y },
    { k: 2 },
  ];
}

// Bomb-avoidance radius for the careful-human proxy: a good fruit within this of a
// bomb is skipped, because swiping it would sweep the bomb (fatal). HIT (slice
// reach) + the half swipe width + a small margin.
const HIT = TARGET_RADIUS + HIT_PAD;
const CLIP_R2 = (HIT + 18) ** 2;

/** Drive the engine like the live loop: per tick, decide + apply + record the
 *  actions, then advance one logical tick. Slices every live good fruit (dodging
 *  bombs) until passScore + `sliceMargin`, then idles to force a game-over. */
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
    opts.sliceMargin === undefined ? Number.POSITIVE_INFINITY : state.cfg.passScore + opts.sliceMargin;
  // Model human reaction latency: wait this many ticks after a fruit launches
  // before slicing it. Default is above the engine's reaction floor.
  const reactionDelay = opts.reactionDelay ?? reactionFloorTicks() + 2;

  while (!engine.isOver(state) && tick < opts.maxTicks) {
    const acts: SimAction[] = [];
    if (state.sliced < target) {
      for (const t of state.targets) {
        if (t.kind !== GOOD || t.sliced || state.tick - t.spawnTick < reactionDelay) continue;
        // A deliberate player skips a good fruit it cannot slice cleanly: if a bomb
        // sits within the swipe's reach, swiping would clip it (fatal), so let it go.
        const blocked = state.targets.some(
          (o) => o.kind !== GOOD && !o.sliced && (o.x - t.x) ** 2 + (o.y - t.y) ** 2 <= CLIP_R2,
        );
        if (blocked) continue;
        acts.push(...swipeOver(t.x, t.y));
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
