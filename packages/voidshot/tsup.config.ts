import { defineConfig } from 'tsup';
import { copyFileSync } from 'node:fs';

// Voidshot ships two artifacts from ONE wasm:
//  - dist/voidshot.js : the live IIFE the iframe runtime loads. The rapier3d sim
//    wasm is gzip+base64-inlined (src/generated/live-wasm.ts) and OGL is bundled,
//    so there is no fetch (CSP connect-src 'none'). The JS live-driver steps the
//    same wasm via its raw live_* exports and OGL renders the state buffer.
//  - dist/run.js + dist/voidshot.wasm : the headless replay entry (caputchin.json
//    run.entry) over the SAME sim module (run.modules). `./voidshot.wasm` stays
//    external because the replay isolate supplies it precompiled via the module map.
export default defineConfig([
  {
    entry: { voidshot: 'src/index.ts' },
    format: ['iife'],
    outExtension: () => ({ js: '.js' }),
    splitting: false,
    treeshake: true,
    minify: true,
    noExternal: [/.*/],
    clean: true,
    target: 'es2020',
    // Inline the vendored .glb models as Uint8Array (render-only; the CSP forbids
    // fetch, so the geometry must travel inside the IIFE like the wasm does).
    esbuildOptions(options) {
      options.loader = { ...options.loader, '.glb': 'binary' };
    },
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
      copyFileSync('build/voidshot.wasm', 'dist/voidshot.wasm');
    },
  },
]);
