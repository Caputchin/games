// Headless replay tests: the game boots Excalibur in the isolate and replays a
// trace deterministically + cleanly under the platform self-check. A WINNING trace
// is exercised by the red-team solver (redteam/), which has the offline driver.
import './run'; // ensures install side-effect ordering for the import graph
import { describe, expect, it } from 'vitest';
import { selfCheckRun } from '@caputchin/replay-selfcheck';
import type { Seed } from '@caputchin/preset-excalibur';
import { run } from './run';

const SEED: Seed = [1, 2, 3, 4];

describe('chef-rush run (headless)', () => {
  it('is deterministic (an empty trace fails identically each run)', async () => {
    const a = await run(SEED, null, '');
    const b = await run(SEED, null, '');
    expect(a).toEqual(b);
    expect(a.passed).toBe(false); // no input -> no dishes served -> fail
  });

  it('fails a malformed trace instead of crashing', async () => {
    const v = await run(SEED, null, '{not valid');
    expect(v).toEqual({ passed: false, score: 0, durationMs: 0 });
  });

  it('passes the platform replay self-check (no ambient access, no drift)', async () => {
    const report = await selfCheckRun(run);
    expect(report.ok).toBe(true);
  });
});
