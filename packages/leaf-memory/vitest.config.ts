import { defineConfig, type Plugin } from 'vitest/config';
import { readFileSync } from 'node:fs';

// Mirror tsup's `dataurl` loader for SVG imports so unit tests get the
// same module shape as the production bundle.
function svgDataUri(): Plugin {
  return {
    name: 'svg-dataurl',
    enforce: 'pre',
    load(id) {
      const clean = id.split('?')[0]!;
      if (!clean.endsWith('.svg')) return null;
      const raw = readFileSync(clean, 'utf-8');
      const b64 = Buffer.from(raw, 'utf-8').toString('base64');
      return `export default ${JSON.stringify(`data:image/svg+xml;base64,${b64}`)};`;
    },
  };
}

// Shim the `import x from './engine.wasm'` syntax for the unit-test
// environment (vite doesn't ship ESM wasm support without a plugin). At
// build time tsup keeps the import external (apps/replay provides the
// precompiled WebAssembly.Module); here we compile from disk synchronously
// and emit a default-export of the resulting Module so run.ts can be
// imported the same way both paths see it.
function wasmAsModule(): Plugin {
  return {
    name: 'wasm-as-module',
    enforce: 'pre',
    load(id) {
      const clean = id.split('?')[0]!;
      if (!clean.endsWith('.wasm')) return null;
      const bytes = readFileSync(clean);
      // Hex-encode so the synthesized module is pure JS (no Buffer import
      // dance in happy-dom). new WebAssembly.Module is synchronous and runs
      // at load, exactly the shape the production loader provides.
      const hex = bytes.toString('hex');
      return [
        `const _hex = ${JSON.stringify(hex)};`,
        `const _bytes = new Uint8Array(_hex.length / 2);`,
        `for (let i = 0; i < _hex.length; i += 2) _bytes[i / 2] = parseInt(_hex.slice(i, i + 2), 16);`,
        `export default new WebAssembly.Module(_bytes);`,
      ].join('\n');
    },
  };
}

export default defineConfig({
  plugins: [svgDataUri(), wasmAsModule()],
  test: {
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**'],
    },
  },
});
