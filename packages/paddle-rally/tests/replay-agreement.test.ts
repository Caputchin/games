// Record -> replay agreement, the core determinism contract. The trace recorded
// by the live game (here, the headless recorder driving the REAL PaddleRallySim) must
// replay through run() (the server) to the IDENTICAL verdict, AND the recording
// must be frame-rate independent: a jittery display produces the same trace as a
// steady 60 Hz one. Importing ../src/run.js pulls @caputchin/preset-phaser/install
// first, so the headless shim is in place before Phaser evaluates.
import '@caputchin/preset-phaser/install';
import { describe, expect, it } from 'vitest';
import type { Seed } from '@caputchin/game-sdk';
import { run } from '../src/run.js';
import { encode } from '../src/codec.js';
import type { PaddleRallyConfig } from '../src/sim.js';
import { recordRun, trackBall, idle } from './harness.js';

const STEADY = [1000 / 60];
const JITTERY = [8, 40, 16.7, 33.3, 11, 25, 50]; // 25..125 fps, mixed

describe('record -> replay agreement', () => {
  it('a recorded trace replays on the server to the same verdict (tracker beats easy rival)', async () => {
    const seed: Seed = [11, 22, 33, 44];
    const config: PaddleRallyConfig = { target: 2, cpu_difficulty: 1 };
    const rec = await recordRun({ seed, config, intent: trackBall });
    expect(rec.passed).toBe(true); // the tracker wins at difficulty 1
    const verdict = await run(seed, config, encode(rec.actions));
    expect(verdict.passed).toBe(rec.passed);
    expect(verdict.score).toBe(rec.score);
  });

  it('an idle player loses, and that verdict also replays', async () => {
    const seed: Seed = [5, 6, 7, 8];
    const config: PaddleRallyConfig = { target: 2, cpu_difficulty: 5 };
    const rec = await recordRun({ seed, config, intent: idle });
    expect(rec.passed).toBe(false);
    const verdict = await run(seed, config, encode(rec.actions));
    expect(verdict.passed).toBe(false);
    expect(verdict.score).toBe(rec.score);
  });

  it('recording is frame-rate independent: jittery deltas == steady 60 Hz', async () => {
    const seed: Seed = [3, 1, 4, 1];
    const config: PaddleRallyConfig = { target: 3, cpu_difficulty: 4 };
    const steady = await recordRun({ seed, config, intent: trackBall, frameDeltas: STEADY });
    const jittery = await recordRun({ seed, config, intent: trackBall, frameDeltas: JITTERY });
    expect(jittery.actions).toEqual(steady.actions);
    expect({ score: jittery.score, passed: jittery.passed }).toEqual({ score: steady.score, passed: steady.passed });
    const verdict = await run(seed, config, encode(steady.actions));
    expect(verdict.score).toBe(steady.score);
    expect(verdict.passed).toBe(steady.passed);
  });
});

// SOLO mode round-trip. Solo decides pass/fail when the rebound count crosses the
// survive target; that decision MUST happen on the synchronous step() path, not in the
// Arcade collision callback, or record (loops to isOver) and replay (loops to trace
// length) evaluate the final rebound a tick apart and diverge. These are the regression
// guard for exactly that (a solo WIN the server would otherwise replay to a LOSS).
describe('solo record -> replay agreement', () => {
  it('a solo WIN replays to the same PASS verdict on the server', async () => {
    const seed: Seed = [11, 22, 33, 44];
    const config: PaddleRallyConfig = { mode: 'solo', target: 5, cpu_difficulty: 5 };
    const rec = await recordRun({ seed, config, intent: trackBall });
    expect(rec.passed).toBe(true); // the tracker survives the returns
    const verdict = await run(seed, config, encode(rec.actions));
    expect(verdict.passed).toBe(rec.passed); // server must agree (this catches F1: was false)
    expect(verdict.score).toBe(rec.score);
  });

  it('a solo miss (idle) replays to the same FAIL verdict', async () => {
    const seed: Seed = [5, 6, 7, 8];
    const config: PaddleRallyConfig = { mode: 'solo', target: 5, cpu_difficulty: 5 };
    const rec = await recordRun({ seed, config, intent: idle });
    expect(rec.passed).toBe(false);
    const verdict = await run(seed, config, encode(rec.actions));
    expect(verdict.passed).toBe(false);
    expect(verdict.score).toBe(rec.score);
  });

  it('solo recording is frame-rate independent and replays identically', async () => {
    const seed: Seed = [3, 1, 4, 1];
    const config: PaddleRallyConfig = { mode: 'solo', target: 5, cpu_difficulty: 5 };
    const steady = await recordRun({ seed, config, intent: trackBall, frameDeltas: STEADY });
    const jittery = await recordRun({ seed, config, intent: trackBall, frameDeltas: JITTERY });
    expect(jittery.actions).toEqual(steady.actions);
    expect({ score: jittery.score, passed: jittery.passed }).toEqual({ score: steady.score, passed: steady.passed });
    const verdict = await run(seed, config, encode(steady.actions));
    expect(verdict.score).toBe(steady.score);
    expect(verdict.passed).toBe(steady.passed);
  });
});
