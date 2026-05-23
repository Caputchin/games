// Registers @caputchin/game-leaf-memory with the iframe's Caputchin global.
// The iframe runtime invokes our factory with (container, bridge, ctx) when
// the widget kicks off the round. The manifest carries our language presets
// (en + ar) which the widget resolves and ships down as ctx.locale.

import { register, type GameManifest } from '@caputchin/game-sdk';
import { runLeafMemory } from './game.js';
import manifestJson from '../caputchin.json';

// caputchin.json is the whole manifest, preferred footprint included. Its
// `preferred.width` / `preferred.height` stay in lockstep with the stage's
// computed footprint via tests/preferred-footprint.test.ts.
const manifest = manifestJson as GameManifest;

register(manifest, (container, bridge, ctx) => {
  return runLeafMemory({ container, bridge, ctx });
});
