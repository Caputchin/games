import { describe, it, expect } from 'vitest';
import { replay, encodeTrace, decodeTrace } from '@caputchin/engine-runtime';
import type { Seed } from '@caputchin/engine-runtime';
import { engine } from '../../src/sim/engine.js';
import { makeSimConfig } from '../../src/sim/config.js';
import { MAX_TICKS } from '../../src/sim/constants.js';
import type { SimConfig } from '../../src/sim/types.js';
import { play } from '../sim-driver.js';

const SEED: Seed = [0xc0ffee, 0x1234, 0x9abcdef0, 0x42];
// L1 config (2 pairs, 5s, 600ms flip-back).
const CFG: SimConfig = makeSimConfig(2, 5, 600);

describe('reducer determinism', () => {
  it('replaying the same (seed, config, actions) is bit-identical', () => {
    const { recorded } = play(SEED, CFG, { maxTicks: MAX_TICKS });
    const a = replay(engine, { seed: SEED, config: CFG, actions: recorded, maxTicks: MAX_TICKS });
    const b = replay(engine, { seed: SEED, config: CFG, actions: recorded, maxTicks: MAX_TICKS });
    expect(a).toEqual(b);
  });

  it('a different seed yields a different board layout (larger board)', () => {
    // Use a 4-pair (8-card) board so the shuffle space is large enough that
    // two different seeds are vanishingly unlikely to produce the same greedy
    // action stream.
    const cfg4 = makeSimConfig(4, 30, 600);
    const p1 = play(SEED, cfg4, { maxTicks: MAX_TICKS });
    const p2 = play([1, 2, 3, 4], cfg4, { maxTicks: MAX_TICKS });
    // Different board layout → at least one action tick differs.
    expect(p1.recorded).not.toEqual(p2.recorded);
  });
});

describe('live == replay (core guarantee)', () => {
  it('the live final score equals the replayed verdict score', () => {
    const live = play(SEED, CFG, { maxTicks: MAX_TICKS });
    const out = replay(engine, { seed: SEED, config: CFG, actions: live.recorded, maxTicks: MAX_TICKS });
    expect(out.score).toBe(live.score);
    expect(out.truncated).toBe(false);
    expect(live.allMatched).toBe(true);
  });

  it('survives the kit codec round-trip (encode -> decode -> replay)', () => {
    const live = play(SEED, CFG, { maxTicks: MAX_TICKS });
    const blob = encodeTrace(live.recorded);
    const decoded = decodeTrace(blob);
    const out = replay(engine, { seed: SEED, config: CFG, actions: decoded, maxTicks: MAX_TICKS });
    expect(out.score).toBe(live.score);
  });

  it('passes the gate when all pairs are matched', () => {
    const live = play(SEED, CFG, { maxTicks: MAX_TICKS });
    expect(live.score).toBe(CFG.pairs);
    expect(live.allMatched).toBe(true);
  });
});

describe('idle / empty play', () => {
  it('an empty action stream times out and terminates (no slices)', () => {
    const out = replay(engine, { seed: SEED, config: CFG, actions: [], maxTicks: MAX_TICKS });
    expect(out.score).toBe(0);
    expect(out.truncated).toBe(false); // budget ticks drain, round ends
  });
});

describe('flip-back countdown', () => {
  it('mismatch locks input for flipBackTicks, then clears', () => {
    // Tiny budget so the sim ends quickly; large flip-back to verify the lock.
    const cfg: SimConfig = makeSimConfig(2, 30, 1000); // 62 flip-back ticks
    let state = engine.init({ seed: SEED, config: cfg });

    // Force first and second picks to be different kinds (mismatch).
    // Find two cards with different kinds.
    const cardA = state.cards.findIndex((c) => c.kind === state.cards[0]!.kind && !c.matched);
    const kindB = state.cards.find((c, i) => i !== cardA && c.kind !== state.cards[0]!.kind)?.kind;
    const cardB = state.cards.findIndex((c, i) => i !== cardA && c.kind === kindB && !c.matched);
    expect(cardB).toBeGreaterThanOrEqual(0);

    state = engine.step(state, { cardIndex: cardA });
    state = engine.step(state, { cardIndex: cardB });
    expect(state.flipBackTicks).toBeGreaterThan(0);

    // Input during countdown should be ignored.
    const before = state.matchCount;
    state = engine.step(state, { cardIndex: cardA });
    expect(state.matchCount).toBe(before);

    // Drain the countdown.
    for (let t = 0; t < cfg.flipBackTicks; t++) {
      state = engine.tick(state);
    }
    expect(state.flipBackTicks).toBe(0);
    expect(state.firstPick).toBe(-1);
    expect(state.secondPick).toBe(-1);
  });
});

describe('L4 (6-pair board)', () => {
  it('live == replay on a larger board', () => {
    const cfg4: SimConfig = makeSimConfig(6, 30, 600);
    const live = play(SEED, cfg4, { maxTicks: MAX_TICKS });
    const out = replay(engine, { seed: SEED, config: cfg4, actions: live.recorded, maxTicks: MAX_TICKS });
    expect(out.score).toBe(live.score);
    expect(live.allMatched).toBe(true);
  });
});
