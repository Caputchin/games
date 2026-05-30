// Registers @caputchin/game-phobos with the iframe runtime. The factory is
// invoked with (container, bridge, ctx) when the widget starts the round; the
// manifest carries the locale / skin / configuration presets the widget resolves
// and ships down as ctx.
import { register, type GameManifest } from '@caputchin/game-sdk';
import { runPhobos } from './game.js';
import manifestJson from '../caputchin.json';

const manifest = manifestJson as GameManifest;

register(manifest, (container, bridge, ctx) => runPhobos({ container, bridge, ctx }));
