import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { 'dino-runner': 'src/index.ts' },
  format: ['iife'],
  outExtension: () => ({ js: '.js' }),
  splitting: false,
  treeshake: true,
  minify: true,
  noExternal: [/.*/],
  clean: true,
  target: 'es2020',
  // Every sprite lives in src/assets/sprites/*.svg as an editable pixel-art
  // file. Each one is inlined as a `data:image/svg+xml;base64,…` URI at build
  // time so the game stays a single self-contained iframe bundle (no fetch,
  // per the game-distribution bundle constraint). The game decodes the data
  // URI back to SVG markup at runtime so `fill="currentColor"` keeps
  // inheriting the skin's day / night color through normal CSS.
  loader: { '.svg': 'dataurl' },
});
