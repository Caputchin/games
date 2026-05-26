import { describe, it, expect } from 'vitest';
import { replay, encodeTrace, decodeTrace } from '@caputchin/engine-runtime';
import type { Seed } from '@caputchin/engine-runtime';
import { engine } from '../src/sim/engine.js';
import { DEFAULT_SIM_CONFIG } from '../src/sim/config.js';
import type { SimConfig } from '../src/sim/types.js';
import { play } from './sim-driver.js';

const SEED: Seed = [0xc0ffee, 0x1234, 0x9abcdef0, 0x42];
const CFG: SimConfig = DEFAULT_SIM_CONFIG;
const MAX = 6000;

describe('reducer determinism', () => {
  it('replaying the same (seed, config, actions) is bit-identical', () => {
    const { recorded } = play(SEED, CFG, { tapUntil: CFG.passHits + 3, maxTicks: MAX });
    const a = replay(engine, { seed: SEED, config: CFG, actions: recorded, maxTicks: MAX });
    const b = replay(engine, { seed: SEED, config: CFG, actions: recorded, maxTicks: MAX });
    expect(a).toEqual(b);
  });

  it('a different seed yields a different play', () => {
    const p1 = play(SEED, CFG, { tapUntil: CFG.passHits + 3, maxTicks: MAX });
    const p2 = play([1, 2, 3, 4], CFG, { tapUntil: CFG.passHits + 3, maxTicks: MAX });
    // Same strategy, different monkey pattern -> action streams differ.
    expect(p1.recorded).not.toEqual(p2.recorded);
  });
});

describe('live == replay (core guarantee)', () => {
  it('the live final score equals the replayed verdict score', () => {
    const live = play(SEED, CFG, { tapUntil: CFG.passHits + 3, maxTicks: MAX });
    const out = replay(engine, { seed: SEED, config: CFG, actions: live.recorded, maxTicks: MAX });
    expect(out.score).toBe(live.score);
    expect(out.truncated).toBe(false);
  });

  it('survives the kit codec round-trip (encode -> decode -> replay)', () => {
    const live = play(SEED, CFG, { tapUntil: CFG.passHits + 3, maxTicks: MAX });
    const blob = encodeTrace(live.recorded);
    const decoded = decodeTrace(blob);
    const out = replay(engine, { seed: SEED, config: CFG, actions: decoded, maxTicks: MAX });
    expect(out.score).toBe(live.score);
  });

  it('passes the gate when enough monkeys are tapped', () => {
    const live = play(SEED, CFG, { tapUntil: CFG.passHits + 2, maxTicks: MAX });
    expect(live.goodHits).toBeGreaterThanOrEqual(CFG.passHits);
  });
});

describe('idle / empty play', () => {
  it('an empty action stream terminates (clock runs out)', () => {
    const out = replay(engine, { seed: SEED, config: CFG, actions: [], maxTicks: MAX });
    expect(out.score).toBe(0);
    expect(out.truncated).toBe(false);
  });
});

describe('fx render cues (F1 — step pushes, driver clears before next tick)', () => {
  it('tapping an up monkey emits a whack cue visible on the same tick', () => {
    // Run until a monkey is up, then apply the tap action + tick manually.
    let state = engine.init({ seed: SEED, config: CFG });
    let holeIndex = -1;
    for (let t = 0; t < MAX; t++) {
      state = engine.tick(state);
      const up = state.moles.find((m) => m.kind === 'monkey' && m.phase === 'up');
      if (up) { holeIndex = up.holeIndex; break; }
    }
    expect(holeIndex).toBeGreaterThanOrEqual(0); // found a monkey
    // Simulate driver: clear fx, apply step, then check view
    state.fx = [];
    state = engine.step(state, { holeIndex });
    const v = engine.view!(state);
    expect(v.fx.length).toBeGreaterThan(0);
    expect(v.fx.some((f) => f.kind === 'whack' && f.holeIndex === holeIndex)).toBe(true);
  });

  it('tapping a decoy emits a decoy cue visible on the same tick', () => {
    // Drive with high decoy chance until a decoy is up.
    const cfg = { ...CFG, baseDecoyChance: 0.9 };
    let state = engine.init({ seed: [1, 2, 3, 4], config: cfg });
    let holeIndex = -1;
    for (let t = 0; t < MAX; t++) {
      state = engine.tick(state);
      const up = state.moles.find((m) => m.kind === 'decoy' && m.phase === 'up');
      if (up) { holeIndex = up.holeIndex; break; }
    }
    expect(holeIndex).toBeGreaterThanOrEqual(0);
    state.fx = [];
    state = engine.step(state, { holeIndex });
    const v = engine.view!(state);
    expect(v.fx.some((f) => f.kind === 'decoy' && f.holeIndex === holeIndex)).toBe(true);
  });
});
