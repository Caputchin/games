// Registers @caputchin/game-monkey-maze with the iframe's Caputchin global. The
// iframe runtime invokes our factory with (container, bridge, ctx) on kickoff;
// the server resolves the locale / skin / configuration presets and the seed and
// ships them down as ctx. caputchin.json is read server-side by the marketplace
// indexer, not passed to register.

import { register } from '@caputchin/game-sdk';
import { runMonkeyMaze } from './game.js';

register((container, bridge, ctx) => runMonkeyMaze({ container, bridge, ctx }));
