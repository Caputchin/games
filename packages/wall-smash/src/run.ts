// The conforming replay artifact. The marketplace pins this (caputchin.json
// `run.entry`) and the replay isolate loads it: it exports `run(seed, config,
// trace) -> verdict`. The Bevy sim is the headless WASM module (`wall-smash.wasm`,
// declared in `run.modules`); the isolate supplies it precompiled, which
// `@caputchin/replay-wasm` instantiates (never compiling bytes, per the Worker
// Loader rule).

import type { RunFn } from '@caputchin/replay-contract';
import { runWithModule } from '@caputchin/replay-wasm';
// In the replay isolate this resolves to the precompiled WebAssembly.Module the
// loader provides for `wall-smash.wasm`; tsup keeps the specifier external so the
// isolate's module map satisfies it.
// @ts-expect-error -- wasm module supplied by the loader
import wasm from './wall-smash.wasm';
import { configToInts } from './config.js';

// config is the opaque, server-sourced object (manifest snake_case keys); we
// resolve it to the sim's i32 array here (never from the trace), then the kit's
// runWithModule marshals those ints into the headless module's cap_run.
export const run: RunFn<Record<string, unknown>> = (seed, config, trace) =>
  runWithModule(wasm as WebAssembly.Module, seed, configToInts(config), trace);
