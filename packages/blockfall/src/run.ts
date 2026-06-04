// The conforming replay artifact. caputchin.json `run.entry` pins this; the
// replay isolate loads it and calls run(seed, config, trace). The preset boots
// KAPLAY headless and replays the SAME scene the browser ran over the recorded
// trace, so the verdict matches live play by construction.

import { kaplayRun } from '@caputchin/preset-kaplay';
import { game } from './game.js';

export const run = kaplayRun(game);
