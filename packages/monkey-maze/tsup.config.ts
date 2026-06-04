import { defineConfig } from 'tsup';

// Mute melonJS's console noise (the "melonJS 2 (vX) | http://melonjs.org" boot
// banner + renderer/resolution/physics lines). melonJS logs the banner from a
// top-level DOMContentLoaded->boot(): synchronously at module-eval when the page
// is already loaded (render-check), but DEFERRED to the DOMContentLoaded event
// when the bundle runs while the iframe is still parsing (the widget) - which is
// why a timed restore could not catch it. So we mute log/info/warn PERMANENTLY in
// the game's own realm (timing-independent); console.error/debug are untouched,
// so real failures still surface. Injected as a banner so it runs before any
// bundled module and cannot be tree-shaken.
const MUTE_BOOT_BANNER =
  '(function(){try{var c=console,n=function(){};if(c){c.log=n;c.info=n;c.warn=n;}}catch(e){}})();';

export default defineConfig([
  // IIFE live bundle: the playable game widget the iframe runtime loads. Bundles
  // everything (melonjs + the preset) into one self-contained artifact - the
  // game frame has no network (CSP), so nothing is external.
  {
    entry: { 'monkey-maze': 'src/index.ts' },
    format: ['iife'],
    outExtension: () => ({ js: '.js' }),
    splitting: false,
    treeshake: true,
    minify: true,
    noExternal: [/.*/],
    clean: true,
    target: 'es2020',
    banner: { js: MUTE_BOOT_BANNER },
    loader: { '.svg': 'dataurl', '.png': 'dataurl', '.ogg': 'dataurl' },
  },
  // ESM run artifact: the headless replay entry the marketplace pins
  // (caputchin.json `run.entry`). melonjs is bundled in (it IS the headless sim);
  // no DOM, no rendering, no assets.
  {
    entry: { run: 'src/run.ts' },
    format: ['esm'],
    outExtension: () => ({ js: '.js' }),
    splitting: false,
    treeshake: true,
    minify: true,
    noExternal: [/.*/],
    clean: false,
    target: 'es2020',
    banner: { js: MUTE_BOOT_BANNER },
  },
]);
