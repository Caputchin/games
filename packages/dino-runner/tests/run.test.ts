// Tests for the run artifact - the conforming `run(seed, config, trace) ->
// verdict` the marketplace pins. run() is the server-side replay contract entry.
// config is the RAW dashboard config (or null); the engine resolves it inside
// init - run() never builds a SimConfig.

import { describe, it, expect } from 'vitest';
import { encodeTrace } from '@caputchin/engine-kit';
import type { Seed } from '@caputchin/replay-contract';
import { run } from '../src/run.js';
import { play } from './sim-driver.js';

const SEED: Seed = [0xfeed, 0xb0a7, 0x5eed, 0x99];
const MAX = 6000;

describe('run artifact (toRun)', () => {
  // ANTI-DIVERGENCE PIN: a NON-NULL injected dashboard config must be resolved
  // identically by the live driver and the replay. Play under a raw config,
  // replay under the SAME raw config -> the verdict's pass MUST equal the live
  // outcome (passed iff the score reached the injected pass threshold). Before
  // the self-contained refactor the replay fed the raw config to a sim that
  // expected a pre-built SimConfig -> misconfigured physics -> divergence.
  it('verdict under an injected (non-null) config matches the live outcome', () => {
    // Low threshold so the auto-jump driver reliably crosses it.
    const cfg = { pass_score: 10 };
    const live = play(SEED, cfg, { maxTicks: MAX });
    const verdict = run(SEED, cfg, encodeTrace(live.recorded));
    expect(verdict.passed).toBe(live.score >= 10);
    expect(verdict.score).toBe(live.score);
    expect(verdict.durationMs).toBeGreaterThan(0);
  });

  // A trivially-low threshold the runner crosses within the first few ticks,
  // pinning the pass PATH explicitly (verified -> verdict.passed true).
  it('passes when the injected threshold is reached', () => {
    const cfg = { pass_score: 1 };
    const live = play(SEED, cfg, { maxTicks: MAX });
    expect(live.score).toBeGreaterThanOrEqual(1);
    const verdict = run(SEED, cfg, encodeTrace(live.recorded));
    expect(verdict.passed).toBe(true);
    expect(verdict.score).toBe(live.score);
  });

  it('fails an empty trace without throwing (no actions)', () => {
    const verdict = run(SEED, null, encodeTrace([]));
    expect(verdict.passed).toBe(false);
    expect(verdict.score).toBe(0);
  });

  it('fails a garbage trace gracefully (index conformance smoke)', () => {
    const verdict = run(SEED, null, 'not-a-valid-trace');
    expect(verdict.passed).toBe(false);
    expect(verdict.score).toBe(0);
    expect(verdict.durationMs).toBe(0);
  });

  it('is bit-identical across repeated invocations (determinism)', () => {
    const live = play(SEED, null, { maxTicks: MAX });
    const blob = encodeTrace(live.recorded);
    expect(run(SEED, null, blob)).toEqual(run(SEED, null, blob));
  });
});
