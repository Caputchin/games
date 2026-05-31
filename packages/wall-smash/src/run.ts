// The conforming replay artifact. The marketplace pins this (caputchin.json
// `run.entry`) and the replay isolate loads it: it exports `run(seed, config,
// trace) -> verdict`. The Bevy sim is the headless WASM module (`wall-smash.wasm`,
// declared in `run.modules`); the isolate supplies it precompiled, which
// `run-core` instantiates (never compiling bytes, per the Worker Loader rule).

import type { RunFn } from '@caputchin/replay-contract';
// In the replay isolate this resolves to the precompiled WebAssembly.Module the
// loader provides for `wall-smash.wasm`; tsup keeps the specifier external so the
// isolate's module map satisfies it.
// @ts-expect-error -- wasm module supplied by the loader
import wasm from './wall-smash.wasm';
import { runWithModule } from './run-core.js';

// config is the opaque, server-sourced object (manifest snake_case keys); the
// sim params are resolved from it (never from the trace) inside run-core.
export const run: RunFn<Record<string, unknown>> = (seed, config, trace) =>
  runWithModule(wasm as WebAssembly.Module, seed, config, trace);
