import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { 'fruit-slash': 'src/index.ts' },
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
  // Any sprite art / sound effects added later inline as data URIs so the
  // game stays one self-contained bundle; SVGs decode back to markup at
  // runtime so `fill="currentColor"` keeps inheriting the skin color.
  loader: { '.svg': 'dataurl', '.ogg': 'dataurl' },
});
