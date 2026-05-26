// Shared constants for the Leaf Memory sim.

import { FIXED_TIMESTEP_MS } from '@caputchin/engine-runtime';

export { FIXED_TIMESTEP_MS };

/** Maximum ticks the replay host will drive before calling the run
 *  truncated. Must be >> any reachable budgetTicks + flip-back overhead.
 *  L4: 30s * 62.5 ticks/s = 1875 ticks. 12000 gives 6× headroom. */
export const MAX_TICKS = 12_000;
