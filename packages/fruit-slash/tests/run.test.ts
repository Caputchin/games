import { describe, it, expect } from 'vitest';
import { encodeTrace } from '@caputchin/engine-runtime';
import type { Seed } from '@caputchin/engine-runtime';
import { run } from '../src/run.js';
import { DEFAULT_SIM_CONFIG } from '../src/sim/config.js';
import { play } from './sim-driver.js';

const SEED: Seed = [0xfeed, 0xb0a7, 0x5eed, 0x99];
const MAX = 6000;

// run() is the conforming artifact: run(seed, config, trace) -> verdict. The
// server calls it with config=null (defaults) at MVP.
describe('run artifact (toRun)', () => {
  it('passes with the replayed score when the trace slices enough fruit', () => {
    const live = play(SEED, DEFAULT_SIM_CONFIG, { sliceUntil: DEFAULT_SIM_CONFIG.passScore + 2, maxTicks: MAX });
    const verdict = run(SEED, null, encodeTrace(live.recorded));
    expect(verdict.passed).toBe(true);
    expect(verdict.score).toBe(live.score);
    expect(verdict.score).toBeGreaterThanOrEqual(DEFAULT_SIM_CONFIG.passScore);
    expect(verdict.durationMs).toBeGreaterThan(0);
  });

  it('fails an empty trace without throwing (no slices)', () => {
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
    const live = play(SEED, DEFAULT_SIM_CONFIG, { sliceUntil: DEFAULT_SIM_CONFIG.passScore + 2, maxTicks: MAX });
    const blob = encodeTrace(live.recorded);
    expect(run(SEED, null, blob)).toEqual(run(SEED, null, blob));
  });
});
