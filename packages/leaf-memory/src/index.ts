// Registers @caputchin/leaf-memory with the iframe's Caputchin global.
// The iframe runtime invokes our factory with (container, bridge) when
// the widget kicks off the round.

import { register } from '@caputchin/game-sdk';
import { runLeafMemory } from './game.js';

register('@caputchin/leaf-memory', (container, bridge) => {
  return runLeafMemory({ container, bridge });
});
