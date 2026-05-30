// Registers @caputchin/game-phobos with the iframe runtime. The factory is
// invoked with (container, bridge, ctx) when the widget starts the round; the
// server resolves the locale / skin / configuration presets and ships them down
// as ctx. caputchin.json is read server-side by the indexer, not passed to register.
import { register } from '@caputchin/game-sdk';
import { runPhobos } from './game.js';

register((container, bridge, ctx) => runPhobos({ container, bridge, ctx }));
