import { defineConfig } from 'tsup';
import { copyFileSync } from 'node:fs';

// Phobos ships two artifacts:
//  - dist/run.js  : the ESM headless replay entry (caputchin.json `run.entry`).
//    The Emscripten glue is bundled in; `./phobos.wasm` stays external because
//    the replay isolate supplies it precompiled via the module map.
//  - dist/phobos.wasm : the headless DOOM engine module (caputchin.json
//    `run.modules`), copied from the engine build.
// The live IIFE bundle (dist/phobos.js) is added once the live driver lands.
export default defineConfig([
  {
    // Live IIFE: the self-contained game widget the iframe runtime loads. The
    // engine + WAD are base64-inlined (SINGLE_FILE) inside the bundled glue, so
    // there is no fetch (CSP connect-src 'none').
    entry: { phobos: 'src/index.ts' },
    format: ['iife'],
    outExtension: () => ({ js: '.js' }),
    splitting: false,
    treeshake: true,
    minify: true,
    noExternal: [/.*/],
    clean: true,
    target: 'es2020',
  },
  {
    entry: { run: 'src/run.ts' },
    format: ['esm'],
    outExtension: () => ({ js: '.js' }),
    splitting: false,
    treeshake: true,
    minify: true,
    noExternal: [/.*/],
    clean: true,
    target: 'es2020',
    // Keep `./phobos.wasm` an external import: the replay isolate resolves it
    // from its module map (precompiled). esbuild ignores relative-path externals
    // unless an onResolve plugin marks them.
    esbuildPlugins: [
      {
        name: 'external-wasm',
        setup(build) {
          build.onResolve({ filter: /\.wasm$/ }, (args) => ({ path: args.path, external: true }));
        },
      },
    ],
    async onSuccess() {
      copyFileSync('build/phobos-headless.wasm', 'dist/phobos.wasm');
    },
  },
]);
