// Tests for the headless sim reducer (ADR-0069). The core guarantee: replaying
// the recorded trace (seed, config, actions) produces the same score as the
// live driver — the live==replay invariant. Also covers the old Runner class
// unit tests (jump arc, duck, collision origin) against the new sim engine.

import { describe, it, expect } from 'vitest';
import { replay, encodeTrace, decodeTrace } from '@caputchin/engine-runtime';
import type { Seed } from '@caputchin/engine-runtime';
import { engine, toScore, SIM_GROUND_Y } from '../src/sim/engine.js';
import { DEFAULT_SIM_CONFIG } from '../src/sim/config.js';
import { RUNNER_START_X } from '../src/sim/constants.js';
import type { SimConfig } from '../src/sim/types.js';
import { play } from './sim-driver.js';

const SEED: Seed = [0xc0ffee, 0x1234, 0x9abcdef0, 0x42];
const CFG: SimConfig = DEFAULT_SIM_CONFIG;
const MAX = 6000;

// ---- Runner physics via the reducer -------------------------------------

describe('runner initial state', () => {
  it('starts in waiting status at ground Y', () => {
    const s = engine.init({ seed: SEED, config: CFG });
    expect(s.runner.status).toBe('waiting');
    expect(s.runner.y).toBe(SIM_GROUND_Y);
    expect(s.runner.x).toBe(RUNNER_START_X);
  });

  it('jump_press while waiting starts the run', () => {
    let s = engine.init({ seed: SEED, config: CFG });
    s = engine.step(s, { k: 'jump_press' });
    expect(s.runner.status).toBe('running');
  });

  it('tick while waiting does not advance distance', () => {
    let s = engine.init({ seed: SEED, config: CFG });
    const before = s.distanceRan;
    s = engine.tick(s);
    expect(s.distanceRan).toBe(before);
  });
});

describe('runner jump arc', () => {
  function runForTicks(ticks: number, seed: Seed = SEED): ReturnType<typeof engine.init> {
    let s = engine.init({ seed, config: CFG });
    s = engine.step(s, { k: 'jump_press' }); // start run
    s = engine.step(s, { k: 'jump_press' }); // jump immediately
    for (let i = 0; i < ticks; i++) s = engine.tick(s);
    return s;
  }

  it('rises to an apex then lands back on the ground', () => {
    let s = engine.init({ seed: SEED, config: CFG });
    s = engine.step(s, { k: 'jump_press' }); // start
    s = engine.step(s, { k: 'jump_press' }); // jump
    let minY = s.runner.y;
    let ticks = 0;
    while (s.runner.status === 'jumping' && ticks < 600) {
      s = engine.tick(s);
      if (s.runner.y < minY) minY = s.runner.y;
      ticks++;
    }
    expect(minY).toBeLessThan(SIM_GROUND_Y - 30); // real hop
    expect(minY).toBeGreaterThan(0);
    expect(s.runner.y).toBe(SIM_GROUND_Y);
    expect(s.runner.status).toBe('running');
    expect(s.runner.jumpCount).toBe(1);
  });

  it('jump while waiting does not fire a jump (only starts the run)', () => {
    let s = engine.init({ seed: SEED, config: CFG });
    s = engine.step(s, { k: 'jump_press' });
    expect(s.runner.status).toBe('running'); // run started, not jumping
  });
});

describe('runner duck', () => {
  it('switches to ducking pose on the ground', () => {
    let s = engine.init({ seed: SEED, config: CFG });
    s = engine.step(s, { k: 'jump_press' }); // start run
    s = engine.step(s, { k: 'duck_press' });
    expect(s.runner.status).toBe('ducking');
    s = engine.step(s, { k: 'duck_release' });
    expect(s.runner.status).toBe('running');
  });

  it('mid-air duck triggers speed drop (velocity flips)', () => {
    let s = engine.init({ seed: SEED, config: CFG });
    s = engine.step(s, { k: 'jump_press' }); // start run
    s = engine.step(s, { k: 'jump_press' }); // jump
    s = engine.step(s, { k: 'duck_press' });
    expect(s.runner.status).toBe('jumping');
    expect(s.runner.speedDrop).toBe(true);
    expect(s.runner.velocity).toBe(1); // fast-fall positive downward
  });
});

// ---- Reducer determinism (ADR-0069 core guarantee) ----------------------

describe('reducer determinism', () => {
  it('replaying the same (seed, config, actions) is bit-identical', () => {
    const { recorded } = play(SEED, CFG, { maxTicks: MAX });
    const a = replay(engine, { seed: SEED, config: CFG, actions: recorded, maxTicks: MAX });
    const b = replay(engine, { seed: SEED, config: CFG, actions: recorded, maxTicks: MAX });
    expect(a).toEqual(b);
  });

  it('a different seed yields a different play', () => {
    const p1 = play(SEED, CFG, { maxTicks: MAX });
    const p2 = play([1, 2, 3, 4], CFG, { maxTicks: MAX });
    // Same jump strategy, different obstacle pattern -> different action stream.
    expect(p1.recorded).not.toEqual(p2.recorded);
  });
});

describe('live == replay (ADR-0069 core guarantee)', () => {
  it('the live final score equals the replayed verdict score', () => {
    const live = play(SEED, CFG, { maxTicks: MAX });
    const out = replay(engine, { seed: SEED, config: CFG, actions: live.recorded, maxTicks: MAX });
    expect(out.score).toBe(live.score);
    expect(out.truncated).toBe(false);
  });

  it('survives the kit codec round-trip (encode -> decode -> replay)', () => {
    const live = play(SEED, CFG, { maxTicks: MAX });
    const blob = encodeTrace(live.recorded);
    const decoded = decodeTrace(blob);
    const out = replay(engine, { seed: SEED, config: CFG, actions: decoded, maxTicks: MAX });
    expect(out.score).toBe(live.score);
  });
});

describe('idle / empty play', () => {
  it('a run with no inputs that starts quickly crashes and terminates', () => {
    // Without any jump inputs, the runner stays on the ground and will be hit
    // by the first obstacle. The run eventually ends (not truncated).
    const out = replay(engine, {
      seed: SEED,
      config: CFG,
      // No actions: just start the run with a single jump_press at tick 0.
      actions: [{ tick: 0, action: { k: 'jump_press' } }],
      maxTicks: MAX,
    });
    expect(out.truncated).toBe(false);
    expect(out.score).toBeGreaterThanOrEqual(0);
  });
});

describe('score function', () => {
  it('toScore converts distance linearly', () => {
    expect(toScore(0)).toBe(0);
    expect(toScore(4000)).toBe(100); // 4000 * 0.025 = 100
  });
});
