// Node ESM loader hook: resolve `import mod from './engine.wasm'` to the
// compiled WebAssembly.Module as the default export, replicating the
// Cloudflare/workerd module-loader convention this game's dist/run.js is
// authored against (the production replay isolate compiles a .wasm import to a
// Module). This lets the determinism self-check replay the exact shipped
// artifact in plain Node CI; WebAssembly execution is deterministic across V8,
// so the Node verdict matches the workerd one.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, next) {
  if (specifier.endsWith('.wasm')) {
    const resolved = await next(specifier, context);
    return { url: resolved.url, format: 'cap-wasm-module', shortCircuit: true };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (context.format === 'cap-wasm-module') {
    const path = fileURLToPath(url);
    const source =
      "import { readFileSync } from 'node:fs';\n" +
      `const mod = new WebAssembly.Module(readFileSync(${JSON.stringify(path)}));\n` +
      'export default mod;\n';
    return { format: 'module', source, shortCircuit: true };
  }
  return next(url, context);
}
