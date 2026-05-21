import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { 'leaf-memory': 'src/index.ts' },
  format: ['iife'],
  outExtension: () => ({ js: '.js' }),
  splitting: false,
  treeshake: true,
  minify: true,
  noExternal: [/.*/],
  clean: true,
  target: 'es2020',
  // Leaf art lives in src/assets/leaves/*.svg as editable files. Each one
  // gets inlined as a `data:image/svg+xml;base64,…` URI at build time so
  // the game stays a single self-contained iframe bundle (no fetch). The
  // game decodes the data URI back to SVG markup at runtime to preserve
  // CSS `currentColor` inheritance for skin-driven recoloring.
  loader: { '.svg': 'dataurl' },
});
