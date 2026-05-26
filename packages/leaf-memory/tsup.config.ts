import { defineConfig } from 'tsup';

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
  //    No DOM, no assets — pure logic only.
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
  },
]);
