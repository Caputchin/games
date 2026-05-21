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

export default defineConfig({
  plugins: [svgDataUri()],
  test: {
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**'],
    },
  },
});
