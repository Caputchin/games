import { defineConfig } from 'vitest/config';

// Node environment: the headless run boots Excalibur under the preset's own DOM
// shim, faithful to the replay isolate (no happy-dom). The pure-sim gate tests
// need no DOM at all.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
