// Pure spawn helpers. The old game kept a stateful Spawner class; spawn
// bookkeeping now lives in the serializable SimState and these pure
// functions do the work, driven by an injected `next: () => number` (a `cap.rng`
// draw). No class, no closure over rng - the reducer reconstructs the rng from
// state each tick, calls these, then captures the rng state back.

import { deriveLaunch, type LaunchBounds } from './launch.js';
import { GOOD, HAZARD, type Kind, type SimTarget } from './types.js';

/** Pick the next jittered inter-spawn interval (seconds). Consumes one `next`. */
export function pickInterval(next: () => number, spawnRate: number): number {
  const base = 1 / Math.max(0.1, spawnRate);
  const jitter = base * 0.4 * (next() * 2 - 1);
  return Math.max(0.15, base + jitter);
}

/** Build one target. Consumes `next` for: kind, the three launch draws, hue,
 *  spin, spinRate - in that fixed order, so the rng stream is identical live and
 *  on replay. `hue` / `spin` / `spinRate` are render hints and never feed the
 *  verdict, but stay in the stream so the ordering can't drift. */
export function spawnOne(
  next: () => number,
  bounds: LaunchBounds,
  hazardChance: number,
  id: number,
): SimTarget {
  const kind: Kind = next() < hazardChance ? HAZARD : GOOD;
  const s = deriveLaunch(next, bounds);
  return {
    id,
    kind,
    x: s.x,
    y: s.y,
    vx: s.vx,
    vy: s.vy,
    hue: Math.floor(next() * 3),
    spin: next() * Math.PI * 2,
    spinRate: (next() * 2 - 1) * 1.5,
    sliced: 0,
  };
}
