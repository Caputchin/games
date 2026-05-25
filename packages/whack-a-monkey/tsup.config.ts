import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { 'whack-a-monkey': 'src/index.ts' },
  format: ['iife'],
  outExtension: () => ({ js: '.js' }),
  splitting: false,
  treeshake: true,
  minify: true,
  // Bundle every dependency (the game-sdk types/helpers) into the single
  // self-contained IIFE the widget loads inside the game iframe. No runtime
  // fetch, per the game-distribution bundle constraint.
  noExternal: [/.*/],
  clean: true,
  target: 'es2020',
  // The capuchin + decoy sprites (Kenney CC0 PNGs) inline as base64 data URIs
  // so the game stays one self-contained bundle with no runtime asset fetch.
  // PNG is raster, drawn straight to canvas via drawImage (no decode step).
  loader: { '.png': 'dataurl' },
});
