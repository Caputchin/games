import { describe, it, expect } from 'vitest';
import { encodeTrace } from '@caputchin/engine-runtime';
import type { Seed } from '@caputchin/engine-runtime';
import { run } from '../../src/run.js';
import { MAX_TICKS } from '../../src/sim/constants.js';
import { play } from '../sim-driver.js';

const SEED: Seed = [0xfeed, 0xb0a7, 0x5eed, 0x99];

// run() is the conforming artifact: run(seed, config, trace) -> verdict.
// config is the RAW dashboard config (or null); the engine resolves it inside
// init - run() never builds a SimConfig.
describe('run artifact (toRun)', () => {
  it('passes with replayed score when trace matches all pairs', () => {
    // null config -> the engine's L1 defaults (2 pairs).
    const live = play(SEED, null, { maxTicks: MAX_TICKS });
    const verdict = run(SEED, null, encodeTrace(live.recorded));
    expect(verdict.passed).toBe(true);
    expect(verdict.score).toBe(live.score);
    expect(verdict.score).toBe(2); // L1 = 2 pairs
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
    const live = play(SEED, null, { maxTicks: MAX_TICKS });
    const blob = encodeTrace(live.recorded);
    expect(run(SEED, null, blob)).toEqual(run(SEED, null, blob));
  });

  it('fails when time runs out before all pairs matched (timeout scenario)', () => {
    // L4 (6 pairs) with a 1-tick budget (0.016s). The driver matches nothing
    // (stopAfterPairs: 0) so the round times out immediately; verdict = false.
    const cfg: Record<string, unknown> = { start_level: 4, solve_seconds_level_4: 0.016 };
    const live = play(SEED, cfg, { stopAfterPairs: 0, maxTicks: MAX_TICKS });
    expect(live.timedOut).toBe(true);
    const verdict = run(SEED, cfg, encodeTrace(live.recorded));
    expect(verdict.passed).toBe(false);
  });

  // ANTI-DIVERGENCE PIN: this is the exact failure the self-contained refactor
  // fixes. A NON-NULL dashboard config must be resolved identically by the live
  // driver and the replay. Inject L3 (4 pairs) via raw dashboard knobs, clear
  // it live, replay under the SAME raw config -> both sides resolve through the
  // one transform site (engine.init -> resolveSimConfig), so the win verifies.
  // Before the refactor the replay fed the raw config straight to a sim that
  // expected a pre-built SimConfig -> misconfigured board -> score 0 -> reject.
  it('a winning trace under an injected (non-null) config passes (anti-divergence pin)', () => {
    const cfg: Record<string, unknown> = { start_level: 3 };
    const live = play(SEED, cfg, { maxTicks: MAX_TICKS });
    expect(live.allMatched).toBe(true);
    const verdict = run(SEED, cfg, encodeTrace(live.recorded));
    expect(verdict.passed).toBe(true);
    expect(verdict.score).toBe(live.score);
    expect(verdict.score).toBe(4); // L3 = 4 pairs
  });

  // MVP captcha round-trip: the first bridge.pass call the live driver emits is
  // the configured start_level round. The server replays that trace under the
  // dashboard config (here: null -> L1). This pins the captcha guarantee:
  // clear L1 live, replay under config=null, assert passed=true.
  it('MVP captcha path: L1 live trace passes under config=null (server default)', () => {
    const live = play(SEED, null, { maxTicks: MAX_TICKS });
    expect(live.allMatched).toBe(true);
    const verdict = run(SEED, null, encodeTrace(live.recorded));
    expect(verdict.passed).toBe(true);
    expect(verdict.score).toBe(2); // L1 = 2 pairs
  });
});
