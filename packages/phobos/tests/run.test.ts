import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Seed } from '@caputchin/replay-contract';
import { runWithModule } from '../src/run-core.js';

const WASM = fileURLToPath(new URL('../build/phobos-headless.wasm', import.meta.url));

// The engine artifact is produced by `pnpm build:engines` (Emscripten). Skip the
// replay tests when it is absent so a TS-only checkout still runs green.
const hasEngine = existsSync(WASM);
const maybe = hasEngine ? describe : describe.skip;

/** Synthetic input trace: every tic, slow turn + hold fire (4 bytes/tic). */
function trace(tics: number): Uint8Array {
  const t = new Uint8Array(tics * 4);
  for (let i = 0; i < tics; i += 1) {
    t[i * 4 + 2] = 1; // angleturn high byte -> slow sweep
    t[i * 4 + 3] = 1; // BT_ATTACK
  }
  return t;
}

maybe('phobos run() replay', () => {
  let mod: WebAssembly.Module;
  const seedA: Seed = [0xc0ffee01, 0xdeadbeef, 0x12345678, 0x9abcdef0];
  const seedB: Seed = [1, 2, 3, 4];

  beforeAll(async () => {
    mod = await WebAssembly.compile(readFileSync(WASM));
  });

  it('returns a well-formed verdict', async () => {
    const v = await runWithModule(mod, seedA, null, trace(700));
    expect(typeof v.passed).toBe('boolean');
    expect(Number.isFinite(v.score)).toBe(true);
    expect(v.score).toBeGreaterThanOrEqual(0);
    expect(v.durationMs).toBeGreaterThan(0);
  });

  it('is deterministic: same (seed, trace) -> identical verdict', async () => {
    const t = trace(1400);
    const v1 = await runWithModule(mod, seedA, null, t);
    const v2 = await runWithModule(mod, seedA, null, t);
    const v3 = await runWithModule(mod, seedA, null, t);
    expect(v2).toEqual(v1);
    expect(v3).toEqual(v1);
  });

  it('start state varies with the seed (anti-replay)', async () => {
    // A sweep-and-fire trace under a busy arena: the seed places the demons, so
    // the same recorded input scores differently across seeds (a pre-recorded
    // demo for seed A misses under seed B).
    const t = spinTrace(1400);
    const a = await runWithModule(mod, seedA, { wave_count: 12, skill: 4 }, t);
    const b = await runWithModule(mod, seedB, { wave_count: 12, skill: 4 }, t);
    expect(a.score).not.toBe(b.score);
  });

  it('reads the pass threshold from config (snake_case), not the trace', async () => {
    const t = trace(1400);
    const easy = await runWithModule(mod, seedA, { pass_kills: 0 }, t);
    const hard = await runWithModule(mod, seedA, { pass_kills: 9999 }, t);
    expect(easy.passed).toBe(true);
    expect(hard.passed).toBe(false);
    expect(easy.score).toBe(hard.score); // same sim, only the gate differs
  });

  // Stationary spin-and-fire: the player holds position, sweeps, and fires, so
  // fast monsters reach and maul it -> the outcome depends on fast_monsters.
  function spinTrace(tics: number): Uint8Array {
    const t = new Uint8Array(tics * 4);
    for (let i = 0; i < tics; i += 1) { t[i * 4 + 2] = 3; t[i * 4 + 3] = 1; }
    return t;
  }

  it('config reaches the C sim, not just the TS resolver (guards the F9 clobber)', async () => {
    // These asserts are seed-pinned: seedA is chosen because it discriminates
    // these configs (fast mauls the stationary player -> fewer kills; more
    // demons -> different kills). If the C ever ignored the flags again, the
    // scores would coincide and `not.toBe` would FAIL loudly (not silently pass),
    // which is the regression we want. If seedA stops discriminating, the test
    // fails and the seed must be re-picked -- it never green-lights a broken wire.
    const t = spinTrace(3000);
    // fast_monsters must be APPLIED in the engine (it was clobbered by
    // G_DoNewGame before the fix). Same difficulty-arg path as respawn.
    const slow = await runWithModule(mod, seedA, { wave_count: 8, skill: 4, fast_monsters: false }, t);
    const fast = await runWithModule(mod, seedA, { wave_count: 8, skill: 4, fast_monsters: true }, t);
    expect(fast.score).not.toBe(slow.score);
    // wave_count changes how many demons the seed spawns -> different outcome.
    const few = await runWithModule(mod, seedA, { wave_count: 2, skill: 3 }, t);
    const many = await runWithModule(mod, seedA, { wave_count: 12, skill: 3 }, t);
    expect(few.score).not.toBe(many.score);
  });

  it('is stable across configs on a warm module (no states[] leak)', async () => {
    // Toggling fast_monsters must not corrupt the shared engine for later runs
    // (the in-place states[] mutation was non-idempotent). Re-running a config
    // after a different one must reproduce its first result.
    const t = trace(1400);
    const a1 = await runWithModule(mod, seedA, { skill: 3, fast_monsters: false }, t);
    await runWithModule(mod, seedA, { skill: 3, fast_monsters: true }, t);
    const a2 = await runWithModule(mod, seedA, { skill: 3, fast_monsters: false }, t);
    expect(a2.score).toBe(a1.score);
  });

  it('handles an empty trace without throwing', async () => {
    const v = await runWithModule(mod, seedA, null, new Uint8Array(0));
    expect(v.passed).toBe(false);
    expect(v.score).toBe(0);
  });
});
