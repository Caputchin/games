import { defineConfig } from 'vitest/config';

// `node` environment: the sim is pure integer logic and the replay test boots
// KAPLAY under the preset's own shim (faithful to the replay isolate, which has
// no happy-dom). The live render path is browser-only and validated by hand, not
// here.
export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['src/sim/**', 'src/strings.ts'],
    },
  },
});
