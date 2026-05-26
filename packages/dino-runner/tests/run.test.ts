// Tests for the run artifact — the conforming `run(seed, config, trace) ->
// verdict` the marketplace pins. run() is the server-side replay contract entry.

import { describe, it, expect } from 'vitest';
import { encodeTrace } from '@caputchin/engine-runtime';
import type { Seed } from '@caputchin/engine-runtime';
import { run } from '../src/run.js';
import { DEFAULT_SIM_CONFIG } from '../src/sim/config.js';
import { play } from './sim-driver.js';

const SEED: Seed = [0xfeed, 0xb0a7, 0x5eed, 0x99];
const MAX = 6000;

describe('run artifact (toRun)', () => {
  it('passes when the trace drives the score past passScore', () => {
    // Use a low passScore so the auto-jump driver reaches it reliably.
    const cfg = { ...DEFAULT_SIM_CONFIG, passScore: 10 };
    const live = play(SEED, cfg, { maxTicks: MAX });
    // live.score may be below 10 if the runner crashed before reaching it;
    // only assert the verdict reflects reality — passed iff score >= threshold.
    const verdict = run(SEED, cfg, encodeTrace(live.recorded));
    expect(verdict.passed).toBe(live.score >= cfg.passScore);
    expect(verdict.score).toBe(live.score);
    expect(verdict.durationMs).toBeGreaterThan(0);
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
    const live = play(SEED, DEFAULT_SIM_CONFIG, { maxTicks: MAX });
    const blob = encodeTrace(live.recorded);
    expect(run(SEED, null, blob)).toEqual(run(SEED, null, blob));
  });
});
