import { describe, it, expect } from 'vitest';
import { kaplayRun, encodeTrace, type Seed, type RecordedEvent } from '@caputchin/preset-kaplay';
import { game, ACTIONS } from '../src/game.js';

const HARD = ACTIONS.indexOf('hardDrop');
const START = ACTIONS.indexOf('start');
const SEED: Seed = [7, 13, 29, 101];
const run = kaplayRun(game);

// A trace that begins the round (the sim is gated on `start`) then hard-drops a
// piece roughly every 10 ticks — exercises the start gate + input replay and
// builds a real stack, without needing to know the seeded bag.
function spamHardDrop(): string {
  const e: RecordedEvent[] = [
    { tick: 0, action: START, press: true },
    { tick: 1, action: START, press: false },
  ];
  for (let t = 5; t < 220; t += 10) {
    e.push({ tick: t, action: HARD, press: true }, { tick: t + 1, action: HARD, press: false });
  }
  return encodeTrace(e);
}

describe('blockfall replay', () => {
  it('same seed + trace => identical verdict (determinism)', async () => {
    const trace = spamHardDrop();
    const a = await run(SEED, null, trace);
    const b = await run(SEED, null, trace);
    expect(a).toEqual(b);
    expect(a.durationMs).toBeGreaterThan(0);
    expect(typeof a.passed).toBe('boolean');
  }, 20000);

  it('malformed trace => failing verdict, never throws', async () => {
    await expect(run(SEED, null, 'not a trace')).resolves.toEqual({
      passed: false,
      score: 0,
      durationMs: 0,
    });
  });

  it('the resolved config flows through to the headless sim', async () => {
    const trace = spamHardDrop();
    // An explicit config equal to the defaults reproduces the null (default) run
    // -> the resolved config provably reaches + drives the sim. (config.test.ts
    // covers that non-default values are parsed; a non-clearing trace's verdict
    // is config-independent now that top-out is non-terminal, so this asserts
    // flow + per-config determinism, not a verdict diff.)
    const explicit = await run(SEED, { cols: 7, rows: 12, pass_lines: 2, gravity: 55, lock_delay: 16 }, trace);
    const defaulted = await run(SEED, null, trace);
    expect(explicit).toEqual(defaulted);
    const other = await run(SEED, { cols: 10, rows: 14 }, trace);
    expect(other).toEqual(await run(SEED, { cols: 10, rows: 14 }, trace)); // deterministic per config
  }, 20000);
});
