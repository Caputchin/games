import { describe, it, expect, afterEach, vi } from 'vitest';
import { gzipSync } from 'fflate';
import { inflateWasm } from '../src/wasm-inline.js';

// A deterministic non-trivial byte pattern standing in for the wasm; the decoder
// is content-agnostic, so a lossless round-trip on arbitrary bytes proves it.
const sample = new Uint8Array(Array.from({ length: 4096 }, (_, i) => (i * 31 + 7) & 0xff));
const inlined = Buffer.from(gzipSync(sample)).toString('base64');

describe('inflateWasm (gzip+base64 live wasm decode)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('round-trips losslessly via native DecompressionStream', async () => {
    expect(typeof DecompressionStream).not.toBe('undefined'); // present under node 22
    const out = await inflateWasm(inlined);
    expect(Array.from(out)).toEqual(Array.from(sample));
  });

  it('round-trips losslessly via the fflate fallback (no DecompressionStream)', async () => {
    vi.stubGlobal('DecompressionStream', undefined);
    const out = await inflateWasm(inlined);
    expect(Array.from(out)).toEqual(Array.from(sample));
  });
});
