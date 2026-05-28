import { describe, it, expect } from 'vitest';
import { encodeTrace } from '@caputchin/engine-runtime';
import type { Seed } from '@caputchin/engine-runtime';
import { run } from '../../src/run.js';
import { makeSimConfig, DEFAULT_SIM_CONFIG } from '../../src/sim/config.js';
import { MAX_TICKS } from '../../src/sim/constants.js';
import { play } from '../sim-driver.js';

const SEED: Seed = [0xfeed, 0xb0a7, 0x5eed, 0x99];

// run() is the conforming artifact: run(seed, config, trace) -> verdict.
// The server calls it with config=null (defaults) at MVP.
describe('run artifact (toRun)', () => {
  it('passes with replayed score when trace matches all pairs', () => {
    const live = play(SEED, DEFAULT_SIM_CONFIG, { maxTicks: MAX_TICKS });
    const verdict = run(SEED, null, encodeTrace(live.recorded));
    expect(verdict.passed).toBe(true);
    expect(verdict.score).toBe(live.score);
    expect(verdict.score).toBe(DEFAULT_SIM_CONFIG.pairs);
    expect(verdict.durationMs).toBeGreaterThan(0);
  });

  it('fails an empty trace without throwing', () => {
    const verdict = run(SEED, null, encodeTrace([]));
    expect(verdict.passed).toBe(false);
    expect(verdict.score).toBe(0);
  });

  it('fails a garbage trace gracefully', () => {
    const verdict = run(SEED, null, 'not-a-valid-trace');
    expect(verdict.passed).toBe(false);
    expect(verdict.score).toBe(0);
    expect(verdict.durationMs).toBe(0);
  });

  it('is bit-identical across repeated invocations (determinism)', () => {
    const live = play(SEED, DEFAULT_SIM_CONFIG, { maxTicks: MAX_TICKS });
    const blob = encodeTrace(live.recorded);
    expect(run(SEED, null, blob)).toEqual(run(SEED, null, blob));
  });

  it('fails when time runs out before all pairs matched (timeout scenario)', () => {
    // Budget = 1 tick, 6 pairs. The driver matches nothing (stopAfterPairs: 0)
    // so the round times out immediately; the verdict must be false.
    const cfg = makeSimConfig(6, 0.016, 600); // budget = 1 tick
    const live = play(SEED, cfg, { stopAfterPairs: 0, maxTicks: MAX_TICKS });
    expect(live.timedOut).toBe(true);
    const verdict = run(SEED, cfg, encodeTrace(live.recorded));
    expect(verdict.passed).toBe(false);
  });

  // MVP captcha round-trip: the first bridge.pass call the live driver emits
  // is always an L1 trace (manifest default start_level=1). The server
  // replays it with config=null which resolves to DEFAULT_SIM_CONFIG (L1).
  // This test pins that guarantee: clear L1 live, replay under config=null,
  // assert passed=true. If this breaks, the captcha is broken at MVP.
  it('MVP captcha path: L1 live trace passes under config=null (server default)', () => {
    const live = play(SEED, DEFAULT_SIM_CONFIG, { maxTicks: MAX_TICKS });
    expect(live.allMatched).toBe(true);
    const verdict = run(SEED, null, encodeTrace(live.recorded));
    expect(verdict.passed).toBe(true);
    expect(verdict.score).toBe(DEFAULT_SIM_CONFIG.pairs);
  });

  // Phase 13: the first-party wasm fixture. run.ts imports `./engine.wasm`,
  // instantiates it at module-eval time, and calls `identity(pairs)` from the
  // `passed` predicate. If the wasm load path is broken the module itself
  // refuses to load and this whole suite fails; this test pins the round-trip
  // (live → encode → replay → wasm-gated passed) once more so a wasm-module
  // regression has a focused failure marker.
  it('wasm-gated passed: a live L1 win replays through the engine.wasm identity gate', () => {
    const live = play(SEED, DEFAULT_SIM_CONFIG, { maxTicks: MAX_TICKS });
    const verdict = run(SEED, null, encodeTrace(live.recorded));
    expect(verdict.passed).toBe(true);
    // The identity wasm preserves the threshold, so score >= identity(pairs)
    // gates the same as score >= pairs; the fixture sits ON the critical
    // path without changing semantics.
    expect(verdict.score).toBe(DEFAULT_SIM_CONFIG.pairs);
  });
});
