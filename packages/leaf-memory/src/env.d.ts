// SVG files are inlined as data URIs by tsup's `dataurl` loader (configured
// in tsup.config.ts). The game decodes them back to SVG markup at runtime
// so `fill="currentColor"` inside the source SVG inherits the skin's
// current color through normal CSS - `<img src>` would NOT inherit.
declare module '*.svg' {
  const dataUri: string;
  export default dataUri;
}

// `.wasm` files import as a precompiled WebAssembly.Module. The platform's
// replay host (apps/replay) attaches the compiled module under this specifier
// when it boots the isolate; in a standalone Node test we instantiate it from
// bytes (the test helper does the WebAssembly.compile + module shimming).
declare module '*.wasm' {
  const module: WebAssembly.Module;
  export default module;
}
