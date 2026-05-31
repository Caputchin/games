import { defineConfig } from 'tsup';
import { copyFileSync } from 'node:fs';

// Wall Smash ships two artifacts:
//  - dist/wall-smash.js : the live IIFE the iframe runtime loads. The Bevy render
//    wasm + wasm-bindgen glue are base64-inlined, so there is no fetch (CSP
//    connect-src 'none').
//  - dist/run.js + dist/wall-smash.wasm : the headless replay entry (caputchin.json
//    run.entry) and the Bevy sim module (run.modules). `./wall-smash.wasm` stays
//    external because the replay isolate supplies it precompiled via the module map.
export default defineConfig([
  {
    entry: { 'wall-smash': 'src/index.ts' },
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
    clean: false,
    target: 'es2020',
    esbuildPlugins: [
      {
        name: 'external-wasm',
        setup(build) {
          build.onResolve({ filter: /\.wasm$/ }, (args) => ({ path: args.path, external: true }));
        },
      },
    ],
    async onSuccess() {
      copyFileSync('build/wall-smash-headless.wasm', 'dist/wall-smash.wasm');
    },
  },
]);
