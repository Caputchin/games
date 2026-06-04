import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { freezeClock, sealHeadlessAmbient } from '@caputchin/determinism';
import type { Seed } from '@caputchin/replay-contract';

// Regression guard for the headless-clock fix in src/run.ts. The Emscripten DOOM
// runtime reads Date / performance while createPhobos() boots the module - which
// happens INSIDE run(), under the replay self-check's run-time ambient ban. run.ts
// freezes + seals the clock at load so that boot reads a frozen constant instead
// of tripping the ban. If that freeze+seal is dropped, the published run artifact
// stops conforming ("ambient-time") and the game falls back to browse-only. These
// tests reproduce the ban (a throwing Date proxy, installed configurable exactly
// as the prober's patchGlobal) and assert both halves: the hazard is real, and the
// fix neutralises it.

const WASM = fileURLToPath(new URL('../build/phobos-headless.wasm', import.meta.url));
const maybe = existsSync(WASM) ? describe : describe.skip;

function banDate(): () => void {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'Date');
  const thrower = new Proxy(function () {}, {
    get() { throw new Error('ambient Date access'); },
    apply() { throw new Error('ambient Date access'); },
    construct() { throw new Error('ambient Date access'); },
  });
  try {
    Object.defineProperty(globalThis, 'Date', { value: thrower, configurable: true, writable: true });
  } catch { /* already sealed: the ban cannot reconfigure it, which is the point */ }
  return () => { try { if (prior) Object.defineProperty(globalThis, 'Date', prior); } catch { /* best effort */ } };
}

// A fresh run-core (and therefore a fresh, un-memoised Emscripten module) per
// case, so a failed boot in one case cannot poison the next.
async function freshRunWithModule() {
  vi.resetModules();
  const { runWithModule } = await import('../src/run-core.js');
  const mod = await WebAssembly.compile(readFileSync(WASM));
  return { runWithModule, mod };
}

maybe('phobos headless clock determinism (src/run.ts)', () => {
  // CASE ORDER IS LOAD-BEARING: the "WITHOUT freeze" case MUST run before the
  // "WITH freeze+seal" case. Once the second case seals Date non-configurable,
  // banDate() can no longer install its throwing proxy (the reconfigure throws and
  // is swallowed), so the first case would read the frozen Date, never throw, and
  // silently false-pass. Vitest runs `it` in source order, so do not reorder these
  // or add a `.only` that flips them.
  it('WITHOUT the freeze, the Emscripten boot trips the ambient-time ban', async () => {
    const { runWithModule, mod } = await freshRunWithModule();
    const restore = banDate();
    let msg = '';
    try {
      await runWithModule(mod, [0, 0, 0, 0] as unknown as Seed, null, new Uint8Array(0));
    } catch (e) {
      msg = String(e);
    } finally {
      restore();
    }
    expect(msg).toMatch(/ambient Date access/);
  });

  it('WITH the run.ts freeze+seal, the sealed clock survives the ban and the boot conforms', async () => {
    const { runWithModule, mod } = await freshRunWithModule();
    // Exactly what src/run.ts does at module load, before the prober applies its ban.
    freezeClock(globalThis, 0);
    sealHeadlessAmbient(globalThis);
    const restore = banDate(); // cannot shadow the now non-configurable Date
    let err = '';
    let verdict: { passed: boolean; score: number; durationMs: number } | null = null;
    try {
      verdict = await runWithModule(mod, [1, 2, 3, 4] as unknown as Seed, null, new Uint8Array(0));
    } catch (e) {
      err = String(e);
    } finally {
      restore();
    }
    expect(err).toBe('');
    expect(verdict).not.toBeNull();
    expect(typeof verdict!.passed).toBe('boolean');
  }, 30_000);
});
