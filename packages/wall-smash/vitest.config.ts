import { defineConfig } from 'vitest/config';

// The replay path (run.ts + @caputchin/replay-wasm) drives the headless Bevy WASM sim, which needs
// Node's filesystem + WebAssembly. DOM-touching tests opt in per-file with
// `// @vitest-environment happy-dom`.
export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**'],
    },
  },
});
