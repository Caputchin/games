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
    endless: number,
  ): number;
  live_step(ptr: number, qx: number, qz: number, fire: number): void;
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

export interface Bolt {
  x: number;
  z: number;
  dx: number;
  dz: number;
}

export interface Asteroid {
  x: number;
  z: number;
  /** Height above the plane; 0 at impact. */
  y: number;
}

export interface Death {
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
  /** Player position (world units). */
  px: number;
  pz: number;
  /** Player facing unit vector (the bolt stream direction). */
  fx: number;
  fz: number;
  enemies: Enemy[];
  bolts: Bolt[];
  asteroids: Asteroid[];
  /** Drones + asteroid blasts that resolved this draw window (for explosion VFX). */
  deaths: Death[];
}

/** A live play session over the wasm sim. Create once, `step` each fixed tick,
 *  `state` each frame to render, `trace` once the round ends. */
export class LiveSim {
  // Inflate + compile the module once; instantiate per round so Try Again / Play
  // Again restart instantly (no re-inflate of the 560 KB wasm each time).
  private static modulePromise: Promise<WebAssembly.Module> | null = null;

  private constructor(
    private readonly ex: LiveExports,
    private readonly ptr: number,
  ) {}

  private static compiled(): Promise<WebAssembly.Module> {
    if (!LiveSim.modulePromise) {
      LiveSim.modulePromise = inflateWasm(liveWasmB64).then((bytes) =>
        // inflateWasm widens to ArrayBufferLike (the fflate fallback); the runtime
        // value is always a fresh ArrayBuffer-backed view.
        WebAssembly.compile(bytes as BufferSource),
      );
    }
    return LiveSim.modulePromise;
  }

  static async create(
    seed: Seed,
    configInts: Int32Array,
    endless = false,
  ): Promise<LiveSim> {
    const module = await LiveSim.compiled();
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
      endless ? 1 : 0,
    );
    return new LiveSim(ex, ptr);
  }

  /** Advance one fixed tick. `qx`/`qz` are the cursor target in milliunits;
   *  `fire` arms the forward bolt stream. */
  step(qx: number, qz: number, fire: boolean): void {
    this.ex.live_step(this.ptr, qx | 0, qz | 0, fire ? 1 : 0);
  }

  /** Snapshot the render state. Reads linear memory fresh (a prior step may have
   *  grown + detached the buffer). Valid only until the next wasm call.
   *  Layout mirrors `live_state` in lib.rs. */
  state(): LiveState {
    const base = this.ex.live_state(this.ptr);
    const dv = new DataView(this.ex.memory.buffer);
    const i = (k: number): number => dv.getInt32(base + k * 4, true);
    const enemyCount = i(9);
    const boltCount = i(10);
    const asteroidCount = i(11);
    const deathCount = i(12);
    let off = 13;

    const enemies: Enemy[] = [];
    for (let k = 0; k < enemyCount; k += 1) {
      enemies.push({ kind: i(off), x: i(off + 1) / 1000, z: i(off + 2) / 1000 });
      off += 3;
    }
    const bolts: Bolt[] = [];
    for (let k = 0; k < boltCount; k += 1) {
      bolts.push({
        x: i(off) / 1000,
        z: i(off + 1) / 1000,
        dx: i(off + 2) / 1000,
        dz: i(off + 3) / 1000,
      });
      off += 4;
    }
    const asteroids: Asteroid[] = [];
    for (let k = 0; k < asteroidCount; k += 1) {
      asteroids.push({ x: i(off) / 1000, z: i(off + 1) / 1000, y: i(off + 2) / 1000 });
      off += 3;
    }
    const deaths: Death[] = [];
    for (let k = 0; k < deathCount; k += 1) {
      deaths.push({ kind: i(off), x: i(off + 1) / 1000, z: i(off + 2) / 1000 });
      off += 3;
    }

    return {
      phase: i(0),
      score: i(1),
      shield: i(2),
      tick: i(3),
      wave: i(4),
      px: i(5) / 1000,
      pz: i(6) / 1000,
      fx: i(7) / 1000,
      fz: i(8) / 1000,
      enemies,
      bolts,
      asteroids,
      deaths,
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
