// Registers @caputchin/leaf-memory with the iframe's Caputchin global.
// The iframe runtime invokes our factory with (container, bridge, ctx) when
// the widget kicks off the round. The manifest carries our language presets
// (en + ar) which the widget resolves and ships down as ctx.lang.

import { register, type GameManifest } from '@caputchin/game-sdk';
import { runLeafMemory } from './game.js';
import { STAGE_WIDTH, STAGE_HEIGHT } from './styles.js';
import manifestJson from '../caputchin.json';

const manifest: GameManifest = {
  ...(manifestJson as GameManifest),
  preferredWidth: STAGE_WIDTH,
  preferredHeight: STAGE_HEIGHT,
};

register(manifest, (container, bridge, ctx) => {
  return runLeafMemory({ container, bridge, ctx });
});
