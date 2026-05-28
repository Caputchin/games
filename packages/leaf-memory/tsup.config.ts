import { defineConfig } from 'tsup';
import { copyFileSync } from 'node:fs';

export default defineConfig([
  // 1. Live iframe bundle (IIFE): the widget embeds this. Leaf art inlined as
  //    data-URIs so the bundle is fully self-contained.
  {
    entry: { 'leaf-memory': 'src/index.ts' },
    format: ['iife'],
    outExtension: () => ({ js: '.js' }),
    splitting: false,
    treeshake: true,
    minify: true,
    noExternal: [/.*/],
    clean: true,
    target: 'es2020',
    loader: { '.svg': 'dataurl' },
  },
  // 2. Headless run artifact (ESM): the replay host imports `run` from here.
  //    No DOM, no assets - pure logic only.
  //    The `./engine.wasm` import in run.ts is kept external via a small
  //    esbuild plugin so tsup leaves the bare specifier in the output; the
  //    replay host (apps/replay) places the precompiled WebAssembly.Module
  //    under that name when it boots the isolate (the wasm-as-module-entry
  //    path; Worker Loader cannot compile bytes at runtime, so a `.wasm`
  //    import cannot be inlined as bytes in the ESM bundle).
  {
    entry: { run: 'src/run.ts' },
    format: ['esm'],
    outExtension: () => ({ js: '.js' }),
    splitting: false,
    treeshake: true,
    minify: false,
    noExternal: [/.*/],
    clean: false,
    target: 'es2022',
    dts: false,
    esbuildPlugins: [
      {
        name: 'external-wasm',
        setup(build) {
          build.onResolve({ filter: /\.wasm$/ }, (args) => ({
            path: args.path,
            external: true,
          }));
        },
      },
    ],
    async onSuccess() {
      // Copy the precompiled engine.wasm next to dist/run.js so the marketplace
      // packs the artifact pair (the manifest's `run.modules[*].path` points
      // at dist/engine.wasm). The src copy is the version-controlled truth.
      copyFileSync('src/engine.wasm', 'dist/engine.wasm');
    },
  },
]);
