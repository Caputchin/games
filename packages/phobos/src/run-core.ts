// Core replay logic, independent of how the WASM module is obtained. The
// `run.ts` entry supplies the loader-provided precompiled module; tests supply
// a locally-compiled one. Either way `runWithModule` drives the headless DOOM
// sim and returns the verdict.
import type { Seed, Verdict } from '@caputchin/replay-contract';
import { resolvePhobosConfig, effectiveMaxTics } from './config.js';
// Emscripten glue (bundled into run.js). No published types.
// @ts-expect-error -- generated module
import createPhobos from '../build/phobos-headless.js';

const TICRATE = 35;

interface EmscriptenModule {
  _malloc(n: number): number;
  _free(p: number): void;
  HEAPU8: Uint8Array;
  ccall(name: string, ret: string, argTypes: string[], args: number[]): number;
}

let modulePromise: Promise<EmscriptenModule> | null = null;

function instantiate(wasmModule: WebAssembly.Module): Promise<EmscriptenModule> {
  if (!modulePromise) {
    modulePromise = createPhobos({
      instantiateWasm(
        imports: WebAssembly.Imports,
        success: (inst: WebAssembly.Instance, mod: WebAssembly.Module) => void,
      ) {
        const inst = new WebAssembly.Instance(wasmModule, imports);
        success(inst, wasmModule);
        return inst.exports;
      },
    }) as Promise<EmscriptenModule>;
  }
  return modulePromise;
}

function toBytes(trace: Uint8Array | string): Uint8Array {
  if (typeof trace !== 'string') return trace;
  const bin = typeof atob === 'function'
    ? atob(trace)
    : Buffer.from(trace, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** Replay a captcha round over a precompiled headless DOOM module. `config` is
 *  the opaque, server-sourced config (manifest snake_case keys) or null. */
export async function runWithModule(
  wasmModule: WebAssembly.Module,
  seed: Seed,
  config: Record<string, unknown> | null,
  trace: Uint8Array | string,
): Promise<Verdict> {
  const M = await instantiate(wasmModule);
  const cfg = resolvePhobosConfig(config);
  const bytes = toBytes(trace);
  const maxTics = effectiveMaxTics(cfg.timeLimit);
  const tics = Math.min(Math.floor(bytes.length / 4) || 1, maxTics);

  const ptr = M._malloc(bytes.length || 1);
  M.HEAPU8.set(bytes, ptr);
  const kills = M.ccall(
    'phobos_run',
    'number',
    ['number', 'number', 'number', 'number', 'number', 'number',
      'number', 'number', 'number', 'number', 'number', 'number'],
    [seed[0] >>> 0, seed[1] >>> 0, seed[2] >>> 0, seed[3] >>> 0, ptr, bytes.length,
      cfg.startLevel, cfg.waveCount, cfg.skill, cfg.fastMonsters ? 1 : 0,
      cfg.respawnMonsters ? 1 : 0, maxTics],
  );
  M._free(ptr);

  return { passed: kills >= cfg.passKills, score: kills, durationMs: (tics * 1000) / TICRATE };
}
