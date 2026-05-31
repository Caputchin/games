// Core replay logic, independent of how the WASM module is obtained. The `run.ts`
// entry supplies the loader-provided precompiled module; tests compile a local
// one. Either way `runWithModule` drives the headless Bevy sim and returns the
// verdict. The replay isolate forbids byte-compilation, so we only ever
// INSTANTIATE a precompiled module here, never compile bytes.

import type { Seed, Verdict } from '@caputchin/replay-contract';
import { configToInts } from './config.js';

interface WasmExports {
  memory: WebAssembly.Memory;
  ws_alloc(len: number): number;
  ws_run(
    s0: number,
    s1: number,
    s2: number,
    s3: number,
    tracePtr: number,
    traceLen: number,
    cfgPtr: number,
    cfgLen: number,
  ): number;
}

function toBytes(trace: Uint8Array | string): Uint8Array {
  if (typeof trace !== 'string') return trace;
  const bin =
    typeof atob === 'function' ? atob(trace) : Buffer.from(trace, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** Replay a captcha round over a precompiled headless Bevy sim module. `config`
 *  is the opaque, server-sourced config (manifest snake_case keys) or null. */
export function runWithModule(
  wasmModule: WebAssembly.Module,
  seed: Seed,
  config: Record<string, unknown> | null,
  trace: Uint8Array | string,
): Verdict {
  // Instantiate the precompiled module (no imports: the sim is freestanding).
  const instance = new WebAssembly.Instance(wasmModule, {});
  const ex = instance.exports as unknown as WasmExports;

  const traceBytes = toBytes(trace);
  const cfgInts = configToInts(config);

  // Allocate + fill linear memory. ws_alloc may grow memory and detach the
  // backing ArrayBuffer, so re-read `ex.memory.buffer` after each allocation.
  const tracePtr = traceBytes.length > 0 ? ex.ws_alloc(traceBytes.length) : 0;
  if (tracePtr !== 0) {
    new Uint8Array(ex.memory.buffer, tracePtr, traceBytes.length).set(traceBytes);
  }

  const cfgPtr = ex.ws_alloc(cfgInts.length * 4);
  {
    const view = new DataView(ex.memory.buffer);
    for (let i = 0; i < cfgInts.length; i += 1) view.setInt32(cfgPtr + i * 4, cfgInts[i] ?? 0, true);
  }

  const verdictPtr = ex.ws_run(
    seed[0] >>> 0,
    seed[1] >>> 0,
    seed[2] >>> 0,
    seed[3] >>> 0,
    tracePtr,
    traceBytes.length,
    cfgPtr,
    cfgInts.length,
  );

  const v = new DataView(ex.memory.buffer);
  const passed = v.getInt32(verdictPtr, true) !== 0;
  const score = v.getInt32(verdictPtr + 4, true);
  const durationMs = v.getInt32(verdictPtr + 8, true);
  return { passed, score, durationMs };
}
