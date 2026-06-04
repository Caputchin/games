import { describe, it, expect } from 'vitest';
import { replay, encodeTrace, decodeTrace } from '@caputchin/engine-kit';
import type { Seed } from '@caputchin/replay-contract';
import { engine } from '../../src/sim/engine.js';
import { MAX_TICKS } from '../../src/sim/constants.js';
import { play } from '../sim-driver.js';

const SEED: Seed = [0xc0ffee, 0x1234, 0x9abcdef0, 0x42];
// RAW dashboard config selecting L1 (2 pairs, 5s, 600ms flip-back via defaults).
// The engine resolves it to a SimConfig inside init - tests never build one.
const CFG: Record<string, unknown> = { start_level: 1 };

describe('reducer determinism', () => {
  it('replaying the same (seed, config, actions) is bit-identical', () => {
    const { recorded } = play(SEED, CFG, { maxTicks: MAX_TICKS });
    const a = replay(engine, { seed: SEED, config: CFG, actions: recorded, maxTicks: MAX_TICKS });
    const b = replay(engine, { seed: SEED, config: CFG, actions: recorded, maxTicks: MAX_TICKS });
    expect(a).toEqual(b);
  });

  it('a different seed yields a different board layout (larger board)', () => {
    // L3 = 4 pairs (8 cards): a shuffle space large enough that two seeds are
    // vanishingly unlikely to produce the same greedy action stream.
    const cfg4: Record<string, unknown> = { start_level: 3 };
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
    // The engine owns the pass decision now; a full clear passes.
    expect(out.passed).toBe(true);
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
    expect(live.score).toBe(2); // L1 = 2 pairs
    expect(live.allMatched).toBe(true);
  });
});

describe('idle / empty play', () => {
  it('an empty action stream times out and terminates (no slices)', () => {
    const out = replay(engine, { seed: SEED, config: CFG, actions: [], maxTicks: MAX_TICKS });
    expect(out.score).toBe(0);
    expect(out.truncated).toBe(false); // budget ticks drain, round ends
    expect(out.passed).toBe(false); // nothing matched -> fail
  });
});

describe('flip-back countdown', () => {
  it('mismatch locks input for flipBackTicks, then clears', () => {
    // L1 with ample budget + a big flip-back to verify the lock. The engine
    // resolves flipBackTicks from mismatch_flip_back_ms internally.
    const cfg: Record<string, unknown> = {
      start_level: 1,
      solve_seconds_level_1: 30,
      mismatch_flip_back_ms: 1000,
    };
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
    for (let t = 0; t < state.cfg.flipBackTicks; t++) {
      state = engine.tick(state);
    }
    expect(state.flipBackTicks).toBe(0);
    expect(state.firstPick).toBe(-1);
    expect(state.secondPick).toBe(-1);
  });
});

describe('L4 (6-pair board)', () => {
  it('live == replay on a larger board', () => {
    const cfg4: Record<string, unknown> = { start_level: 4 }; // L4 = 6 pairs
    const live = play(SEED, cfg4, { maxTicks: MAX_TICKS });
    const out = replay(engine, { seed: SEED, config: cfg4, actions: live.recorded, maxTicks: MAX_TICKS });
    expect(out.score).toBe(live.score);
    expect(live.allMatched).toBe(true);
  });
});
