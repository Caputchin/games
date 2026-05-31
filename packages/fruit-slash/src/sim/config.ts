// SimConfig derivation for Fruit Slash. The RAW dashboard config (or null) is
// turned into the sim's gameplay config HERE, in one place: engine.init calls
// resolveSimConfig, and both the live driver and the headless replay reach the
// engine through that same init, so the sim params can't drift between play and
// verification. Reuses resolveFruitSlashConfig (the display resolver) as the
// single source of resolution + clamps; this just projects the sim-affecting
// fields out of it.

import { resolveFruitSlashConfig } from '../config.js';
import type { SimConfig } from './types.js';

/** Resolve the RAW dashboard config (or null) into the headless SimConfig. THE
 *  single config->sim transform site: engine.init calls this so the live driver
 *  and the replay derive identical sim params. `null` -> the manifest defaults
 *  via the shared resolver. */
export function resolveSimConfig(raw: Record<string, unknown> | null): SimConfig {
  const cfg = resolveFruitSlashConfig(raw);
  return {
    passScore: cfg.passScore,
    lives: cfg.lives,
    spawnRate: cfg.spawnRate,
    gravity: cfg.gravity,
    hazardChance: cfg.hazardChance,
  };
}
