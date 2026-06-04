import { defineConfig } from 'tsup';

export default defineConfig([
  // IIFE live bundle: the playable game the iframe runtime loads. KAPLAY and the
  // preset are bundled in (noExternal) so the artifact is self-contained under
  // the game CSP (no runtime fetch).
  {
    entry: { blockfall: 'src/index.ts' },
    format: ['iife'],
    outExtension: () => ({ js: '.js' }),
    splitting: false,
    treeshake: true,
    minify: true,
    noExternal: [/.*/],
    clean: true,
    target: 'es2020',
  },
  // ESM run artifact: the headless replay entry pinned by caputchin.json
  // `run.entry`. Also self-contained (it boots KAPLAY headless in the isolate).
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
  },
]);
