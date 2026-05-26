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
    const { recorded } = play(SEED, CFG, { sliceUntil: CFG.passScore + 3, maxTicks: MAX });
    const a = replay(engine, { seed: SEED, config: CFG, actions: recorded, maxTicks: MAX });
    const b = replay(engine, { seed: SEED, config: CFG, actions: recorded, maxTicks: MAX });
    expect(a).toEqual(b);
  });

  it('a different seed yields a different play', () => {
    const p1 = play(SEED, CFG, { sliceUntil: CFG.passScore + 3, maxTicks: MAX });
    const p2 = play([1, 2, 3, 4], CFG, { sliceUntil: CFG.passScore + 3, maxTicks: MAX });
    // Same strategy, different fruit pattern -> the recorded action stream differs.
    expect(p1.recorded).not.toEqual(p2.recorded);
  });
});

describe('live == replay (core guarantee)', () => {
  it('the live final score equals the replayed verdict score', () => {
    const live = play(SEED, CFG, { sliceUntil: CFG.passScore + 3, maxTicks: MAX });
    const out = replay(engine, { seed: SEED, config: CFG, actions: live.recorded, maxTicks: MAX });
    expect(out.score).toBe(live.score);
    expect(out.truncated).toBe(false);
    // The driver stopped slicing past the threshold, so the round ended on lives.
    expect(live.lives).toBe(0);
  });

  it('survives the kit codec round-trip (encode -> decode -> replay)', () => {
    const live = play(SEED, CFG, { sliceUntil: CFG.passScore + 3, maxTicks: MAX });
    const blob = encodeTrace(live.recorded);
    const decoded = decodeTrace(blob);
    const out = replay(engine, { seed: SEED, config: CFG, actions: decoded, maxTicks: MAX });
    expect(out.score).toBe(live.score);
  });

  it('passes the gate when enough good fruit are sliced', () => {
    const live = play(SEED, CFG, { sliceUntil: CFG.passScore + 2, maxTicks: MAX });
    expect(live.score).toBeGreaterThanOrEqual(CFG.passScore);
  });
});

describe('idle / empty play', () => {
  it('an empty action stream loses (no slices) and terminates', () => {
    const out = replay(engine, { seed: SEED, config: CFG, actions: [], maxTicks: MAX });
    expect(out.score).toBe(0);
    expect(out.truncated).toBe(false); // fruit escape, lives drain, round ends
  });
});
