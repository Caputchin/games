import { describe, it, expect } from 'vitest';
import { replay, encodeTrace, decodeTrace, reactionFloorTicks } from '@caputchin/engine-kit';
import type { Seed } from '@caputchin/replay-contract';
import { engine } from '../src/sim/engine.js';
import { play } from './sim-driver.js';

const SEED: Seed = [0xc0ffee, 0x1234, 0x9abcdef0, 0x42];
// null = no dashboard override; the engine resolves it to the manifest defaults
// internally. Tests never build a SimConfig.
const CFG: Record<string, unknown> | null = null;
const MAX = 6000;

describe('reducer determinism', () => {
  it('replaying the same (seed, config, actions) is bit-identical', () => {
    const { recorded } = play(SEED, CFG, { sliceMargin: 3, maxTicks: MAX });
    const a = replay(engine, { seed: SEED, config: CFG, actions: recorded, maxTicks: MAX });
    const b = replay(engine, { seed: SEED, config: CFG, actions: recorded, maxTicks: MAX });
    expect(a).toEqual(b);
  });

  it('a different seed yields a different play', () => {
    const p1 = play(SEED, CFG, { sliceMargin: 3, maxTicks: MAX });
    const p2 = play([1, 2, 3, 4], CFG, { sliceMargin: 3, maxTicks: MAX });
    // Same strategy, different fruit pattern -> the recorded action stream differs.
    expect(p1.recorded).not.toEqual(p2.recorded);
  });
});

describe('live == replay (core guarantee)', () => {
  it('the live final score equals the replayed verdict score', () => {
    const live = play(SEED, CFG, { sliceMargin: 3, maxTicks: MAX });
    const out = replay(engine, { seed: SEED, config: CFG, actions: live.recorded, maxTicks: MAX });
    expect(out.score).toBe(live.score);
    expect(out.truncated).toBe(false);
    // The driver stopped slicing past the threshold, so the round ended on lives.
    expect(live.lives).toBe(0);
    // The engine owns the pass decision; slicing past the gate latched verified.
    expect(out.passed).toBe(true);
  });

  it('survives the kit codec round-trip (encode -> decode -> replay)', () => {
    const live = play(SEED, CFG, { sliceMargin: 3, maxTicks: MAX });
    const blob = encodeTrace(live.recorded);
    const decoded = decodeTrace(blob);
    const out = replay(engine, { seed: SEED, config: CFG, actions: decoded, maxTicks: MAX });
    expect(out.score).toBe(live.score);
  });

  it('passes the gate when enough good fruit are sliced', () => {
    const live = play(SEED, CFG, { sliceMargin: 2, maxTicks: MAX });
    const out = replay(engine, { seed: SEED, config: CFG, actions: live.recorded, maxTicks: MAX });
    expect(out.passed).toBe(true);
  });
});

describe('idle / empty play', () => {
  it('an empty action stream loses (no slices) and terminates', () => {
    const out = replay(engine, { seed: SEED, config: CFG, actions: [], maxTicks: MAX });
    expect(out.score).toBe(0);
    expect(out.truncated).toBe(false); // fruit escape, lives drain, round ends
    expect(out.passed).toBe(false);
  });
});

describe('reaction-time gate', () => {
  it('a frame-perfect bot (zero reaction delay) scores nothing and fails', () => {
    // Slices every good fruit the instant it is sliceable -> every slice is
    // superhuman -> the gate refuses to count any of them.
    const bot = play(SEED, CFG, { sliceMargin: 2, maxTicks: MAX, reactionDelay: 0 });
    expect(bot.recorded.length).toBeGreaterThan(0); // it DID act
    expect(bot.score).toBe(0); // ...but nothing counted
    const out = replay(engine, { seed: SEED, config: CFG, actions: bot.recorded, maxTicks: MAX });
    expect(out.score).toBe(0);
    expect(out.passed).toBe(false);
  });

  it('a human-paced player (reaction above the floor) scores and passes', () => {
    const human = play(SEED, CFG, {
      sliceMargin: 2,
      maxTicks: MAX,
      reactionDelay: reactionFloorTicks() + 2,
    });
    expect(human.score).toBeGreaterThan(0);
    const out = replay(engine, { seed: SEED, config: CFG, actions: human.recorded, maxTicks: MAX });
    expect(out.passed).toBe(true);
  });
});
