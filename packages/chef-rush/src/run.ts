// Headless replay entry (caputchin.json `run.entry`). The install side-effect MUST
// be first so the headless DOM shim + deterministic Math + frozen clock are in
// place before excalibur evaluates.
import '@caputchin/preset-excalibur/install';
import { excaliburRun } from '@caputchin/preset-excalibur';
import { game } from './game.js';

export const run = excaliburRun(game);
