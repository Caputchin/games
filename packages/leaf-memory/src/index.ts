// Registers @caputchin/game-leaf-memory with the iframe's Caputchin global.
// The iframe runtime invokes our factory with (container, bridge, ctx) when
// the widget kicks off the round. The manifest carries our language presets
// (en + ar) which the widget resolves and ships down as ctx.locale.

import { register } from '@caputchin/game-sdk';
import { runLeafMemory } from './game.js';

// The server resolves our language presets (en + ar) and ships them down as
// ctx.locale. caputchin.json is the indexer's source of truth (its
// `preferred.width` / `preferred.height` stay in lockstep with the stage via
// tests/preferred-footprint.test.ts); it is not passed to register.
register((container, bridge, ctx) => {
  return runLeafMemory({ container, bridge, ctx });
});
