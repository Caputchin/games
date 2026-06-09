// Live entry (caputchin.json `entry`): the playable browser game. Registers the
// preset's live mount with the widget. No `install` import here - live runs in a
// real browser with a real DOM.
import { register } from '@caputchin/game-sdk';
import { mountExcaliburGame } from '@caputchin/preset-excalibur';
import { game } from './game.js';

register((container, bridge, ctx) => mountExcaliburGame(game, { container, bridge, ctx }));
