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

  it('a click-to-move (goto) trace replays identically', () => {
    const t = trace([{ tick: 0, action: { k: 'goto', cx: 6, cy: 6 } }]);
    const a = run(SEED, null, t);
    const b = run(SEED, null, t);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    expect(a.durationMs).toBeGreaterThan(0);
  });

  it('honors the dots-to-clear threshold (a low percent passes more readily)', () => {
    // Click-to-move sweeps the bottom rows (reliable corridor pathfinding, away
    // from the top chasers). ghosts:1 removes catch-luck so the assertion is about
    // the threshold, not survival.
    const t = trace([
      { tick: 0, action: { k: 'goto', cx: 1, cy: 11 } },
      { tick: 220, action: { k: 'goto', cx: 11, cy: 11 } },
      { tick: 520, action: { k: 'goto', cx: 11, cy: 9 } },
      { tick: 820, action: { k: 'goto', cx: 1, cy: 9 } },
    ]);
    // 10% of the maze is a handful of dots - the sweep clears well past it.
    const easy = run(SEED, { clear_percent: 10, ghosts: 1 }, t);
    expect(easy.passed).toBe(true);
    // Clearing the WHOLE board on the same short sweep is not possible.
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
