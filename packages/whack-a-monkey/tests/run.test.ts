import { describe, it, expect } from 'vitest';
import { encodeTrace } from '@caputchin/engine-runtime';
import type { Seed } from '@caputchin/engine-runtime';
import { run } from '../src/run.js';
import { play } from './sim-driver.js';

const SEED: Seed = [0xfeed, 0xb0a7, 0x5eed, 0x99];
const MAX = 6000;

// run() is the conforming artifact: run(seed, config, trace) -> verdict. config
// is the RAW dashboard config (or null); the engine resolves it inside init.
describe('run artifact (toRun)', () => {
  it('passes when the trace taps enough monkeys (config=null defaults)', () => {
    const live = play(SEED, null, { tapMargin: 2, maxTicks: MAX });
    const verdict = run(SEED, null, encodeTrace(live.recorded));
    expect(verdict.passed).toBe(true);
    expect(verdict.score).toBe(live.score);
    expect(verdict.durationMs).toBeGreaterThan(0);
  });

  // ANTI-DIVERGENCE PIN: a NON-NULL injected dashboard config must be resolved
  // identically by the live driver and the replay. Inject a lower pass_hits,
  // tap past it live, replay under the SAME raw config -> both sides resolve
  // through engine.init (resolveSimConfig), so the win verifies. Also the
  // deliberate P11 behavior change: the live sim now honors the dashboard knobs
  // (before the refactor the live driver ignored ctx.config).
  it('a winning trace under an injected (non-null) config passes', () => {
    const cfg = { pass_hits: 5 };
    const live = play(SEED, cfg, { tapMargin: 2, maxTicks: MAX });
    const verdict = run(SEED, cfg, encodeTrace(live.recorded));
    expect(verdict.passed).toBe(true);
    expect(verdict.score).toBe(live.score);
    expect(verdict.score).toBeGreaterThanOrEqual(5);
  });

  it('fails an empty trace without throwing (no taps)', () => {
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
    const live = play(SEED, null, { tapMargin: 2, maxTicks: MAX });
    const blob = encodeTrace(live.recorded);
    expect(run(SEED, null, blob)).toEqual(run(SEED, null, blob));
  });
});
