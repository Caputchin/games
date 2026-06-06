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
    const { recorded } = play(SEED, CFG, { tapMargin: 3, maxTicks: MAX });
    const a = replay(engine, { seed: SEED, config: CFG, actions: recorded, maxTicks: MAX });
    const b = replay(engine, { seed: SEED, config: CFG, actions: recorded, maxTicks: MAX });
    expect(a).toEqual(b);
  });

  it('a different seed yields a different play', () => {
    const p1 = play(SEED, CFG, { tapMargin: 3, maxTicks: MAX });
    const p2 = play([1, 2, 3, 4], CFG, { tapMargin: 3, maxTicks: MAX });
    // Same strategy, different monkey pattern -> action streams differ.
    expect(p1.recorded).not.toEqual(p2.recorded);
  });
});

describe('live == replay (core guarantee)', () => {
  it('the live final score equals the replayed verdict score', () => {
    const live = play(SEED, CFG, { tapMargin: 3, maxTicks: MAX });
    const out = replay(engine, { seed: SEED, config: CFG, actions: live.recorded, maxTicks: MAX });
    expect(out.score).toBe(live.score);
    expect(out.truncated).toBe(false);
    // The engine owns the pass decision; tapping past the goal latched verified.
    expect(out.passed).toBe(true);
  });

  it('survives the kit codec round-trip (encode -> decode -> replay)', () => {
    const live = play(SEED, CFG, { tapMargin: 3, maxTicks: MAX });
    const blob = encodeTrace(live.recorded);
    const decoded = decodeTrace(blob);
    const out = replay(engine, { seed: SEED, config: CFG, actions: decoded, maxTicks: MAX });
    expect(out.score).toBe(live.score);
  });

  it('passes the gate when enough monkeys are tapped', () => {
    const live = play(SEED, CFG, { tapMargin: 2, maxTicks: MAX });
    const out = replay(engine, { seed: SEED, config: CFG, actions: live.recorded, maxTicks: MAX });
    expect(out.passed).toBe(true);
  });
});

describe('idle / empty play', () => {
  it('an empty action stream terminates (clock runs out)', () => {
    const out = replay(engine, { seed: SEED, config: CFG, actions: [], maxTicks: MAX });
    expect(out.score).toBe(0);
    expect(out.truncated).toBe(false);
    expect(out.passed).toBe(false);
  });
});

describe('reaction-time gate', () => {
  it('a frame-perfect bot (zero reaction delay) scores nothing and fails', () => {
    // Taps every monkey the instant it is up -> every tap is superhuman ->
    // the gate refuses to count any of them.
    const bot = play(SEED, CFG, { tapMargin: 2, maxTicks: MAX, reactionDelay: 0 });
    expect(bot.recorded.length).toBeGreaterThan(0); // it DID act
    expect(bot.score).toBe(0); // ...but nothing counted
    const out = replay(engine, { seed: SEED, config: CFG, actions: bot.recorded, maxTicks: MAX });
    expect(out.score).toBe(0);
    expect(out.passed).toBe(false);
  });

  it('a human-paced player (reaction above the floor) scores and passes', () => {
    const human = play(SEED, CFG, {
      tapMargin: 2,
      maxTicks: MAX,
      reactionDelay: reactionFloorTicks() + 2,
    });
    expect(human.score).toBeGreaterThan(0);
    const out = replay(engine, { seed: SEED, config: CFG, actions: human.recorded, maxTicks: MAX });
    expect(out.passed).toBe(true);
  });
});

describe('fx render cues (F1 - step pushes, driver clears before next tick)', () => {
  it('tapping an up monkey emits a whack cue visible on the same tick', () => {
    // Run until a monkey is up, wait past the reaction floor (so the tap
    // scores), then apply the tap action + tick manually.
    let state = engine.init({ seed: SEED, config: CFG });
    let holeIndex = -1;
    for (let t = 0; t < MAX; t++) {
      state = engine.tick(state);
      const up = state.moles.find((m) => m.kind === 'monkey' && m.phase === 'up');
      if (up) {
        // Advance past the reaction floor before tapping so the gate passes.
        const target = up.appearTick + reactionFloorTicks() + 2;
        while (state.tick < target && !engine.isOver(state)) {
          state = engine.tick(state);
        }
        // Re-find the mole - it may still be up or may have retracted.
        const still = state.moles.find((m) => m.holeIndex === up.holeIndex && m.phase === 'up');
        if (still) { holeIndex = still.holeIndex; break; }
        // Mole retracted - keep searching.
      }
    }
    expect(holeIndex).toBeGreaterThanOrEqual(0); // found a monkey in time
    // Simulate driver: clear fx, apply step, then check view
    state.fx = [];
    state = engine.step(state, { holeIndex });
    const v = engine.view!(state);
    expect(v.fx.length).toBeGreaterThan(0);
    expect(v.fx.some((f) => f.kind === 'whack' && f.holeIndex === holeIndex)).toBe(true);
  });

  it('tapping a decoy emits a decoy cue visible on the same tick', () => {
    // Drive with the max decoy chance (raw config, clamped to 0.5) until a
    // decoy is up.
    const cfg = { base_decoy_chance: 0.5 };
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
