// Browser-side bridge to the SAME clean wasm the server replays. The iframe CSP
// forbids fetching a `.wasm`, so the module is gzip+base64-inlined
// (src/generated/live-wasm.ts) and decoded with the kit's `inflateWasm`. Unlike
// the replay isolate, the browser MAY compile bytes, so we instantiate with empty
// imports (the module is import-free, as the determinism spike proved) and drive
// the raw live_* C-ABI: step the sim, read entity positions from linear memory,
// pull the recorded trace at round end.

import type { Seed } from '@caputchin/replay-contract';
import { inflateWasm } from '@caputchin/replay-wasm';
import liveWasmB64 from './generated/live-wasm.js';

interface LiveExports {
  memory: WebAssembly.Memory;
  cap_alloc(len: number): number;
  live_new(
    s0: number,
    s1: number,
    s2: number,
    s3: number,
    cfgPtr: number,
    cfgLen: number,
  ): number;
  live_step(ptr: number, qx: number, qz: number, pulse: number): void;
  live_state(ptr: number): number;
  live_trace(ptr: number): number;
  live_trace_len(ptr: number): number;
  live_free(ptr: number): void;
}

export interface Enemy {
  kind: number;
  x: number;
  z: number;
}

export interface LiveState {
  phase: number;
  score: number;
  shield: number;
  tick: number;
  wave: number;
  px: number;
  pz: number;
  enemies: Enemy[];
}

/** A live play session over the wasm sim. Create once, `step` each fixed tick,
 *  `state` each frame to render, `trace` once the round ends. */
export class LiveSim {
  private constructor(
    private readonly ex: LiveExports,
    private readonly ptr: number,
  ) {}

  static async create(seed: Seed, configInts: Int32Array): Promise<LiveSim> {
    const bytes = await inflateWasm(liveWasmB64);
    // inflateWasm's return type widens to ArrayBufferLike (the fflate fallback);
    // the runtime value is always a fresh ArrayBuffer-backed view.
    const module = await WebAssembly.compile(bytes as BufferSource);
    const instance = await WebAssembly.instantiate(module, {});
    const ex = instance.exports as unknown as LiveExports;

    // Marshal the config i32s into linear memory via the same bump allocator the
    // replay path uses (cap_alloc), then hand live_new the pointer.
    let cfgPtr = 0;
    if (configInts.length > 0) {
      cfgPtr = ex.cap_alloc(configInts.length * 4);
      const dv = new DataView(ex.memory.buffer);
      for (let i = 0; i < configInts.length; i += 1) {
        dv.setInt32(cfgPtr + i * 4, configInts[i]!, true);
      }
    }
    const ptr = ex.live_new(
      seed[0] >>> 0,
      seed[1] >>> 0,
      seed[2] >>> 0,
      seed[3] >>> 0,
      cfgPtr,
      configInts.length,
    );
    return new LiveSim(ex, ptr);
  }

  /** Advance one fixed tick. `qx`/`qz` are the cursor target in milliunits. */
  step(qx: number, qz: number, pulse: boolean): void {
    this.ex.live_step(this.ptr, qx | 0, qz | 0, pulse ? 1 : 0);
  }

  /** Snapshot the render state. Reads linear memory fresh (a prior step may have
   *  grown + detached the buffer). Valid only until the next wasm call. */
  state(): LiveState {
    const base = this.ex.live_state(this.ptr);
    const dv = new DataView(this.ex.memory.buffer);
    const i = (k: number): number => dv.getInt32(base + k * 4, true);
    const count = i(7);
    const enemies: Enemy[] = [];
    for (let k = 0; k < count; k += 1) {
      const b = 8 + k * 3;
      enemies.push({ kind: i(b), x: i(b + 1) / 1000, z: i(b + 2) / 1000 });
    }
    return {
      phase: i(0),
      score: i(1),
      shield: i(2),
      tick: i(3),
      wave: i(4),
      px: i(5) / 1000,
      pz: i(6) / 1000,
      enemies,
    };
  }

  /** Copy the recorded input trace out of linear memory (call at round end). */
  trace(): Uint8Array {
    const ptr = this.ex.live_trace(this.ptr);
    const len = this.ex.live_trace_len(this.ptr);
    return new Uint8Array(this.ex.memory.buffer, ptr, len).slice();
  }

  free(): void {
    this.ex.live_free(this.ptr);
  }
}
