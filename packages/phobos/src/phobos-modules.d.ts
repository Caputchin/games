// Ambient declarations for the generated Emscripten glue + the headless WASM
// module so `tsc` type-checks without the built artifacts present.
interface EmscriptenFactoryOptions {
  instantiateWasm?(
    imports: WebAssembly.Imports,
    success: (inst: WebAssembly.Instance, mod: WebAssembly.Module) => void,
  ): WebAssembly.Exports | object;
  print?(text: string): void;
  printErr?(text: string): void;
}

declare module '../build/phobos-headless.js' {
  const createPhobos: (opts?: EmscriptenFactoryOptions) => Promise<unknown>;
  export default createPhobos;
}

declare module './phobos.wasm' {
  const mod: WebAssembly.Module;
  export default mod;
}

declare module '../build/phobos-live.js' {
  const createPhobosLive: (opts?: EmscriptenFactoryOptions) => Promise<unknown>;
  export default createPhobosLive;
}

// NOTE: the base64 live wasm (./generated/phobos-live-wasm.js) is typed by the
// committed src/generated/phobos-live-wasm.d.ts, NOT an ambient declaration here.
// It lives under src/ (a tsconfig `include` root), so tsc does real file
// resolution and ignores a relative-path `declare module` -- it needs a real
// declaration file at the path. (The ../build/*.js declares above DO work because
// build/ is outside `include`.) The stub lets typecheck run without the heavy
// live build; build:engines emits the .ts value alongside it.
