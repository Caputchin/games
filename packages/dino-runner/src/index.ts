// Registers @caputchin/game-dino-runner with the iframe's Caputchin global.
// The iframe runtime invokes our factory with (container, bridge, ctx) when
// the widget kicks off the round; the manifest carries the locale / skin /
// configuration presets the widget resolves and ships down as ctx.

import { register, type GameManifest } from '@caputchin/game-sdk';
import { runDinoRunner } from './game.js';
import manifestJson from '../caputchin.json';

const manifest = manifestJson as GameManifest;

register(manifest, (container, bridge, ctx) => {
  return runDinoRunner({ container, bridge, ctx });
});
