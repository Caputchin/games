import { defineConfig } from 'tsup';

// Two artifacts:
//   1. dist/whack-a-monkey.js — the LIVE bundle the widget loads in the game
//      iframe. IIFE, registers the game via side-effect, carries the full
//      renderer + DOM.
//   2. dist/run.js — the headless REPLAY artifact the marketplace pins and the
//      replay host loads in an isolate. ESM exporting `run(seed, config,
//      trace)`; no DOM, no renderer — just the pure sim wrapped by `toRun`.
export default defineConfig([
  {
    entry: { 'whack-a-monkey': 'src/index.ts' },
    format: ['iife'],
    outExtension: () => ({ js: '.js' }),
    splitting: false,
    treeshake: true,
    minify: true,
    // Bundle every dependency (the game-sdk + kit helpers) into the single
    // self-contained IIFE. No runtime fetch, per the bundle constraint.
    noExternal: [/.*/],
    clean: true,
    target: 'es2020',
    // The capuchin + decoy sprites (Kenney CC0 PNGs) inline as base64 data
    // URIs so the game stays one self-contained bundle.
    loader: { '.png': 'dataurl' },
  },
  {
    entry: { run: 'src/run.ts' },
    format: ['esm'],
    outExtension: () => ({ js: '.js' }),
    splitting: false,
    treeshake: true,
    minify: true,
    // Self-contained ESM: the isolate imports it with no resolver, so the
    // kit + contract + sim must all be bundled in.
    noExternal: [/.*/],
    // Second config in the array — must NOT clean (it would wipe whack-a-monkey.js).
    clean: false,
    target: 'es2020',
  },
]);
