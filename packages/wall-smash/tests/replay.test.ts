// Replay-path test: compile the headless Bevy sim wasm, drive it through the
// kit's marshalling (@caputchin/replay-wasm's runWithModule), and assert the
// contract (verdict shape), determinism, and that the trace/config/seed plumbing
// reaches the sim. Full live-vs-replay win parity is exercised in the harness
// playtest (a captured trace replays to passed).

import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Seed } from '@caputchin/replay-contract';
import { runWithModule } from '@caputchin/replay-wasm';
import { encodeTrace } from '../src/trace.js';
import { configToInts } from '../src/config.js';

// The HEADLESS replay wasm only. Prefer the shipped artifact, then the build/
// output. Never the cargo `target/` wasm: after a full build that file is the
// LIVE (wasm-bindgen) build, which is not the C-ABI headless module under test.
const candidates = ['../dist/wall-smash.wasm', '../build/wall-smash-headless.wasm'];
const wasmPath = candidates
  .map((p) => fileURLToPath(new URL(p, import.meta.url)))
  .find((p) => existsSync(p));

const seed: Seed = [1, 2, 3, 4];
// configToInts is the game's own encoder (same one run.ts + the live build use);
// the kit's runWithModule takes the pre-encoded i32 array, not the config object.
const fastCfgInts = configToInts({ time_limit_seconds: 4 });

describe('wall-smash replay', () => {
  if (!wasmPath) {
    it.skip('headless wasm not built (run `pnpm build:wasm` or `cargo build --release --target wasm32-unknown-unknown`)', () => {});
    return;
  }
  const wasmModule = new WebAssembly.Module(readFileSync(wasmPath));

  it('empty trace never launches -> times out, fails, scores 0', () => {
    const v = runWithModule(wasmModule, seed, fastCfgInts, new Uint8Array(0));
    expect(v.passed).toBe(false);
    expect(v.score).toBe(0);
    // ran to the ~4s timeout
    expect(v.durationMs).toBeGreaterThan(3000);
  });

  it('a launching trace breaks bricks (seed-driven) and yields a sane verdict', () => {
    const trace = encodeTrace([{ tick: 1, dir: 0, launch: true }]);
    const v = runWithModule(wasmModule, seed, fastCfgInts, trace);
    expect(v.score).toBeGreaterThan(0);
    expect(Number.isFinite(v.durationMs)).toBe(true);
    expect(v.durationMs).toBeGreaterThan(0);
  });

  it('is deterministic: same (seed, config, trace) -> identical verdict', () => {
    const trace = encodeTrace([{ tick: 1, dir: 1, launch: true }]);
    const a = runWithModule(wasmModule, seed, fastCfgInts, trace);
    const b = runWithModule(wasmModule, seed, fastCfgInts, trace);
    expect(a).toEqual(b);
  });

  it('seed binds the trace: identical trace under many seeds spreads outcomes', () => {
    // Launch, then sweep the paddle back and forth so the ball stays in play long
    // enough for the seeded launch to diverge chaotically. Default config (longer
    // round) gives that divergence room. A memorized trace cannot win across seeds.
    const records: { tick: number; dir: -1 | 0 | 1; launch: boolean }[] = [
      { tick: 1, dir: 0, launch: true },
    ];
    for (let t = 30; t < 3000; t += 30) {
      records.push({ tick: t, dir: (t / 30) % 2 === 0 ? 1 : -1, launch: false });
    }
    const trace = encodeTrace(records);
    const outcomes = new Set<string>();
    for (let s = 0; s < 16; s += 1) {
      const v = runWithModule(wasmModule, [s * 2654435761, s + 1, s + 7, s + 13], configToInts(null), trace);
      outcomes.add(`${v.score}/${v.durationMs}`);
    }
    expect(outcomes.size).toBeGreaterThan(1);
  });

  it('accepts a base64 trace (the wire form)', () => {
    const bytes = encodeTrace([{ tick: 1, dir: 0, launch: true }]);
    const b64 = Buffer.from(bytes).toString('base64');
    const fromBytes = runWithModule(wasmModule, seed, fastCfgInts, bytes);
    const fromB64 = runWithModule(wasmModule, seed, fastCfgInts, b64);
    expect(fromB64).toEqual(fromBytes);
  });
});
