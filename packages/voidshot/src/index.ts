// Live mount entry. The iframe runtime loads this IIFE and calls the registered
// factory with the container, the bridge, and the resolved per-round context
// (seed, skin, config, locale). Everything else lives in the driver.

import { register, randomSeed } from '@caputchin/game-sdk';
import type { GameContext } from '@caputchin/game-sdk';
import { startGame } from './driver.js';

register((container: HTMLElement, bridge, ctx?: GameContext) => {
  const seed = ctx?.seed ?? randomSeed();
  const game = startGame({
    container,
    bridge,
    seed,
    config: (ctx?.config ?? null) as Record<string, unknown> | null,
    skin: ctx?.skin ?? null,
    locale: ctx?.locale ?? null,
  });
  return () => game.dispose();
});
