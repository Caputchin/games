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
});
