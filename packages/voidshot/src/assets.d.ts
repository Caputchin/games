// Vendored binary assets imported via esbuild's `binary` loader (tsup config):
// a `*.glb` import resolves to the model bytes as a Uint8Array, inlined into the
// IIFE so the sandboxed iframe never fetches (CSP connect-src 'none').
declare module '*.glb' {
  const data: Uint8Array;
  export default data;
}
