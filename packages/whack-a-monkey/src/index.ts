// Registers @caputchin/game-whack-a-monkey with the iframe's Caputchin global.
// The iframe runtime invokes our factory with (container, bridge, ctx) when the
// widget kicks off the round; the server resolves the locale / skin /
// configuration presets and ships them down as ctx. caputchin.json is read
// server-side by the marketplace indexer, not passed to register.

import { register } from '@caputchin/game-sdk';
import { runWhackAMonkey } from './game.js';

register((container, bridge, ctx) => {
  return runWhackAMonkey({ container, bridge, ctx });
});
