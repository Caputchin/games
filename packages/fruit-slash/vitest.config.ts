import { defineConfig, type Plugin } from 'vitest/config';
import { readFileSync } from 'node:fs';

// Mirror tsup's `dataurl` loader for asset imports so unit tests get the same
// module shape (a data URI) as the production bundle.
const ASSET_MIME: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg',
};
function assetDataUri(): Plugin {
  return {
    name: 'asset-dataurl',
    enforce: 'pre',
    load(id) {
      const clean = id.split('?')[0]!;
      const ext = clean.slice(clean.lastIndexOf('.'));
      const mime = ASSET_MIME[ext];
      if (!mime) return null;
      const b64 = readFileSync(clean).toString('base64');
      return `export default ${JSON.stringify(`data:${mime};base64,${b64}`)};`;
    },
  };
}

export default defineConfig({
  plugins: [assetDataUri()],
  test: {
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**'],
    },
  },
});
