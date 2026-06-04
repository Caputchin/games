// Registers @caputchin/game-blockfall with the iframe runtime. The widget calls
// the factory with (container, bridge, ctx) when the round kicks off; the preset
// boots KAPLAY live, records the input trace, and reports the pass.

import { register } from '@caputchin/game-sdk';
import { mountKaplayGame } from '@caputchin/preset-kaplay';
import { game } from './game.js';

register((container, bridge, ctx) => mountKaplayGame(game, { container, bridge, ctx }));
