// The conforming replay artifact. The marketplace pins this (caputchin.json
// `run.entry`) and the replay isolate loads it: it exports `run(seed, config,
// trace) -> verdict`. The DOOM sim is the headless WASM module (`phobos.wasm`,
// declared in `run.modules`); the isolate supplies it precompiled, which
// `run-core` instantiates (never compiling bytes, per the Worker Loader rule).
import type { RunFn } from '@caputchin/replay-contract';
import { freezeClock, sealHeadlessAmbient } from '@caputchin/determinism';
// In the replay isolate this resolves to the precompiled WebAssembly.Module the
// loader provides for `phobos.wasm`; tsup keeps the specifier external so the
// isolate's module map satisfies it.
// @ts-expect-error -- wasm module supplied by the loader
import phobosWasm from './phobos.wasm';
import { runWithModule } from './run-core.js';

// Headless determinism for the Emscripten DOOM runtime. Unlike a Caputchin
// framework preset (melonJS, Phaser), phobos is a raw Emscripten build with no
// preset to install a headless shim, and the generated glue reads Date.now() /
// performance.now() as it boots the module - which happens inside run(), i.e.
// INSIDE the replay self-check's run-time ambient ban (the prober only catches
// RUN-time access, so this never surfaced at module eval). Freeze the wall clock
// to a constant and seal it NON-CONFIGURABLE so the ban cannot shadow it - the
// same sanctioned carve-out the framework presets apply via sealHeadlessAmbient.
// The frozen constant keeps the boot deterministic; DOOM's sim RNG is seeded
// from the server seed, never the clock. Guarded on a headless runtime (no
// `document`): this is the replay-isolate entry and never the live browser
// bundle (that is dist/phobos.js, built from src/index.ts), and the guard keeps
// any non-headless import inert.
if (typeof (globalThis as { document?: unknown }).document === 'undefined') {
  freezeClock(globalThis, 0);
  sealHeadlessAmbient(globalThis);
}

// config is the opaque, server-sourced object (manifest snake_case keys); the
// gate threshold is read from it (never from the trace) inside run-core.
export const run: RunFn<Record<string, unknown>> = (seed, config, trace) =>
  runWithModule(phobosWasm as WebAssembly.Module, seed, config, trace);
