// JS-level live == replay verification. Drives the wasm's live C-ABI (via the
// inlined-wasm decode path the browser uses) to record an input trace, then
// replays that trace through `runWithModule` (the exact path run.ts uses in the
// isolate) and asserts the verdict matches the live outcome. Because both sides
// load the same module bytes, this exercises the full JS stack: inflateWasm decode,
// the live_* bindings, the codec round-trip, and the cap_run replay marshalling.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Seed } from '@caputchin/replay-contract';
import { runWithModule } from '@caputchin/replay-wasm';
import { describe, expect, it } from 'vitest';
import { configToInts } from '../src/config.js';
import { LiveSim } from '../src/wasm.js';

const WASM = join(dirname(fileURLToPath(import.meta.url)), '../dist/voidshot.wasm');

describe('voidshot replay (JS path)', () => {
  it('a recorded live trace replays to the same verdict', async () => {
    const seed: Seed = [7, 11, 13, 17];
    const cfg = configToInts(null);

    // Record a live session: sweep the cursor target while firing until the round
    // resolves, so the trace exercises bolts, kills, and splits.
    const live = await LiveSim.create(seed, cfg);
    let st = live.state();
    for (let t = 0; t < 3600 && st.phase === 0; t += 1) {
      const a = t * 0.05;
      live.step(Math.round(Math.cos(a) * 6000), Math.round(Math.sin(a) * 6000), true);
      st = live.state();
    }
    const finalLive = live.state();
    const trace = live.trace();
    live.free();

    expect(finalLive.phase).not.toBe(0); // round resolved within the cap

    // Replay the recorded trace through the run.ts path.
    const module = await WebAssembly.compile(readFileSync(WASM) as unknown as BufferSource);
    const verdict = runWithModule(module, seed, cfg, trace);

    expect(verdict.passed).toBe(finalLive.phase === 1);
    expect(verdict.score).toBe(finalLive.score);
  });
});
