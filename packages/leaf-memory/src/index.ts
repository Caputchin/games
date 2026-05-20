// Registers @caputchin/leaf-memory with the iframe's Caputchin global.
// The iframe runtime invokes our factory with (container, bridge) when
// the widget kicks off the round.

import { register, type GameManifest } from '@caputchin/game-sdk';
import { runLeafMemory } from './game.js';
import { STAGE_WIDTH, STAGE_HEIGHT } from './styles.js';

const manifest: GameManifest = {
  id: '@caputchin/leaf-memory',
  version: '0.1.0',
  displayName: 'Leaf Memory',
  preferredWidth: STAGE_WIDTH,
  preferredHeight: STAGE_HEIGHT,
};

register(manifest, (container, bridge) => {
  return runLeafMemory({ container, bridge });
});
