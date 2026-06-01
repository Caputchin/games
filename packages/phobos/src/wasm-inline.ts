// Decode the gzip+base64-inlined live engine wasm. It ships inlined (not fetched)
// because the game iframe's CSP is `connect-src 'none'`; it ships gzipped (not raw
// base64) to keep the bundle entry under the marketplace size gate. Decode =
// base64 -> gunzip, losslessly reproducing the exact bytes the build emitted.
//
// Kept in its own module (no engine/glue imports) so it is unit-testable: game.ts
// pulls in the generated emscripten glue, which only exists after a live build.
// fflate/browser = the worker-less build; the bare 'fflate' entry pulls in
// worker_threads/createRequire (node) which leak into the browser IIFE.
import { gunzipSync } from 'fflate/browser';

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

// Native DecompressionStream where available (fast); fflate fallback for pre-2023
// Safari/Firefox so the captcha still loads everywhere.
export async function inflateWasm(b64: string): Promise<Uint8Array> {
  const gz = base64ToBytes(b64);
  if (typeof DecompressionStream !== 'undefined') {
    const stream = new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return gunzipSync(gz);
}
