// @vitest-environment node
//
// Headless replay runs with NO DOM (the replay isolate), so the preset's shim
// engages and melonJS boots headless - exactly the production server path. (The
// default happy-dom env gives melonJS a too-thin canvas context.)
//
// Sim determinism + behavior, exercised through the real conforming run (the
// melonJS headless sim via @caputchin/preset-melonjs). Proves the same
// (seed, config, trace) replays to an identical verdict - the platform's trust
// basis - and that pellets score.

import { describe, it, expect } from 'vitest';
import { encodeTrace, type TickInput, type Seed } from '@caputchin/preset-melonjs';
import { run } from '../src/run.js';
import { engine, bfsField, gotoStep } from '../src/sim/engine.js';
import { TILE } from '../src/sim/constants.js';
import type { Dir, SimAction } from '../src/sim/types.js';

const SEED: Seed = [0x1357, 0x2468, 0x9bdf, 0xace0] as unknown as Seed;

function trace(actions: ReadonlyArray<{ tick: number; action: SimAction }>): Uint8Array | string {
  const ticks: Array<TickInput<SimAction>> = actions.map((a) => ({ tick: a.tick, action: a.action }));
  return encodeTrace(ticks);
}

// The runner is still by default, so a trace must DRIVE it. A hold-wander cycles
// the held direction; the runner moves whenever the current direction is open,
// threading the procedural corridors and eating dots regardless of the layout.
function holdWander(maxTick: number, step = 22): Array<{ tick: number; action: SimAction }> {
  const out: Array<{ tick: number; action: SimAction }> = [];
  for (let tk = 0; tk <= maxTick; tk += step) {
    out.push({ tick: tk, action: { k: 'hold', d: ((tk / step) % 4) as Dir } });
  }
  return out;
}

// Mirror the live driver's click-to-move follower: drive the runner toward each
// target cell in turn by emitting the same hold/release inputs gotoStep dictates,
// recording a raw-directional trace. The sim has no pathfinding action, so this is
// how a click sweep is produced now (client-side path-follow). Deterministic, so
// the recorded trace replays bit-identically through run().
function followTrace(targets: ReadonlyArray<{ cx: number; cy: number }>, ghosts: number): Uint8Array | string {
  let s = engine.init({ seed: SEED, config: { ghosts } });
  const rec: Array<{ tick: number; action: SimAction }> = [];
  let tick = 0;
  for (const tgt of targets) {
    const field = bfsField(tgt.cx, tgt.cy, s.walls, s.cols, s.rows);
    let followDir: Dir | null = null;
    for (let guard = 0; guard < 400 && !engine.isOver(s); guard += 1) {
      const cx = Math.round(s.runner.x / TILE);
      const cy = Math.round(s.runner.y / TILE);
      const d = cx === tgt.cx && cy === tgt.cy ? null : gotoStep(cx, cy, field, s.walls, s.cols, s.rows);
      if (d === null) {
        if (followDir !== null) { rec.push({ tick, action: { k: 'release' } }); s = engine.step(s, { k: 'release' }); }
        break;
      }
      if (d !== followDir) { rec.push({ tick, action: { k: 'hold', d } }); s = engine.step(s, { k: 'hold', d }); followDir = d; }
      s = engine.tick(s);
      tick += 1;
    }
    if (engine.isOver(s)) break;
  }
  return trace(rec);
}

describe('Monkey Maze sim (via the conforming run)', () => {
  it('produces a verdict and scores pellets', () => {
    const v = run(SEED, null, trace(holdWander(360)));
    expect(v.score).toBeGreaterThanOrEqual(10);
    expect(v.durationMs).toBeGreaterThan(0);
    expect(typeof v.passed).toBe('boolean');
  });

  it('replays the same (seed, config, trace) to an identical verdict', () => {
    const t = trace(holdWander(600));
    const a = run(SEED, null, t);
    const b = run(SEED, null, t);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it('honors the dots-to-clear threshold (a low percent passes more readily)', () => {
    // A click-to-move-style sweep of the lower rows (away from the pen chasers),
    // produced by the same follower the live driver uses. ghosts:1 keeps a single
    // chaser so the assertion is about the threshold, not survival luck.
    const t = followTrace([{ cx: 1, cy: 11 }, { cx: 11, cy: 11 }, { cx: 11, cy: 9 }, { cx: 1, cy: 9 }], 1);
    // A low percent (a handful of dots) is cleared well past it by the sweep.
    const easy = run(SEED, { clear_percent: 10, ghosts: 1 }, t);
    expect(easy.passed).toBe(true);
    // Clearing the WHOLE board on the same sweep is not possible.
    const hard = run(SEED, { clear_percent: 100, ghosts: 1 }, t);
    expect(hard.passed).toBe(false);
  });

  it('a malformed trace fails safely (no throw)', () => {
    const v = run(SEED, null, new Uint8Array([0x01, 0x02, 0x03]));
    expect(v.passed).toBe(false);
  });

  it('different seeds both complete', () => {
    const t = trace(holdWander(240));
    const a = run(SEED, null, t);
    const b = run([0x1, 0x2, 0x3, 0x4] as unknown as Seed, null, t);
    expect(a.durationMs).toBeGreaterThan(0);
    expect(b.durationMs).toBeGreaterThan(0);
  });
});
