// The conforming replay artifact. The marketplace pins this (caputchin.json
// `run.entry`) and the replay isolate loads it: it exports `run(seed, config,
// trace) -> verdict`. The DOOM sim is the headless WASM module (`phobos.wasm`,
// declared in `run.modules`); the isolate supplies it precompiled, which
// `run-core` instantiates (never compiling bytes, per the Worker Loader rule).
import type { RunFn } from '@caputchin/replay-contract';
// In the replay isolate this resolves to the precompiled WebAssembly.Module the
// loader provides for `phobos.wasm`; tsup keeps the specifier external so the
// isolate's module map satisfies it.
// @ts-expect-error -- wasm module supplied by the loader
import phobosWasm from './phobos.wasm';
import { runWithModule } from './run-core.js';

// config is the opaque, server-sourced object (manifest snake_case keys); the
// gate threshold is read from it (never from the trace) inside run-core.
export const run: RunFn<Record<string, unknown>> = (seed, config, trace) =>
  runWithModule(phobosWasm as WebAssembly.Module, seed, config, trace);
