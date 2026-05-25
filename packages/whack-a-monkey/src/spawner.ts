// Grid spawn scheduler + mole lifecycle (state only, no DOM/canvas). Each of the
// HOLE_COUNT holes holds at most one mole. Launches happen on a jittered cadence
// (a practical Poisson approximation, like fruit-slash's spawner); a hole that
// just fired is on cooldown so it does not pop twice in a row. `update` steps
// every live mole by real dt and culls dead ones. A monkey that ducks untapped
// carries no penalty (the clock, not misses, bounds the round), so update has
// no return value. Deterministic under a seeded RNG for tests.

import type { Rng } from './rng.js';
import {
  DECOY_SPECIES,
  HOLE_COOLDOWN_FACTOR,
  MAX_CONCURRENT,
  MAX_CONCURRENT_DECOY,
  MIN_INTERVAL,
  SPAWN_JITTER,
} from './constants.js';
import { spawnMole, stepMole, tapMole, isTappable, type Mole, type MoleKind } from './mole.js';

export interface SpawnConfig {
  /** Moles launched per second. */
  spawnRate: number;
  /** Probability a launched mole is a decoy, 0..1. */
  decoyChance: number;
  /** How long a mole stays up before ducking (ms). */
  uptimeMs: number;
}

interface Hole {
  index: number;
  cooldown: number; // seconds remaining before this hole can spawn again
  mole: Mole | null;
}

export class Spawner {
  private readonly holes: Hole[];
  private timer = 0;
  private interval: number;
  private nextId = 0;
  private lastHole = -1;
  private spawnRate: number;
  private decoyChance: number;
  private uptimeS: number;

  constructor(
    private readonly rng: Rng,
    holeCount: number,
    cfg: SpawnConfig,
  ) {
    this.holes = Array.from({ length: holeCount }, (_, index) => ({ index, cooldown: 0, mole: null }));
    this.spawnRate = cfg.spawnRate;
    this.decoyChance = cfg.decoyChance;
    this.uptimeS = cfg.uptimeMs / 1000;
    this.interval = this.pickInterval();
  }

  /** Swap in new difficulty for subsequent spawns (level change). Moles already
   *  up keep their own uptime. */
  setDifficulty(cfg: SpawnConfig): void {
    this.spawnRate = cfg.spawnRate;
    this.decoyChance = cfg.decoyChance;
    this.uptimeS = cfg.uptimeMs / 1000;
  }

  /** Live moles (anything not yet fully ducked), for render + hit-test. */
  get moles(): Mole[] {
    const out: Mole[] = [];
    for (const h of this.holes) if (h.mole) out.push(h.mole);
    return out;
  }

  reset(): void {
    for (const h of this.holes) {
      h.mole = null;
      h.cooldown = 0;
    }
    this.timer = 0;
    this.nextId = 0;
    this.lastHole = -1;
    this.interval = this.pickInterval();
  }

  /** Apply a tap to the mole at `holeIndex`. Returns the tapped mole's kind, or
   *  null if the hole has no tappable mole. */
  tap(holeIndex: number): MoleKind | null {
    const h = this.holes[holeIndex];
    if (!h || !h.mole || !isTappable(h.mole)) return null;
    const kind = h.mole.kind;
    h.mole = tapMole(h.mole);
    return kind;
  }

  /** Advance time by `dt` seconds: emit due spawns (respecting caps + cooldown),
   *  step every live mole, and cull the dead. A monkey that ducks untapped is
   *  not penalized, so nothing is reported. */
  update(dt: number): void {
    this.timer += dt;
    // `while` so a long (clamped) dt can still emit, but the caps bound it.
    while (this.timer >= this.interval) {
      this.timer -= this.interval;
      this.interval = this.pickInterval();
      this.trySpawn();
    }

    for (const h of this.holes) {
      if (h.cooldown > 0) h.cooldown -= dt;
      if (!h.mole) continue;
      const next = stepMole(h.mole, dt);
      h.mole = next.phase === 'dead' ? null : next;
    }
  }

  private pickInterval(): number {
    const base = 1 / Math.max(0.1, this.spawnRate);
    const jitter = base * SPAWN_JITTER * (this.rng() * 2 - 1);
    return Math.max(MIN_INTERVAL, base + jitter);
  }

  /** Count up moles of a kind (the gameplay-relevant "active" threats; a
   *  retracting mole no longer counts toward the cap, though its hole stays
   *  occupied until it dies). */
  private countUp(kind: MoleKind): number {
    let n = 0;
    for (const h of this.holes) if (h.mole && h.mole.phase === 'up' && h.mole.kind === kind) n++;
    return n;
  }

  private trySpawn(): void {
    // Decide the kind first, then honor the per-kind cap (downgrade or skip).
    let kind: MoleKind = this.rng() < this.decoyChance ? 'decoy' : 'monkey';
    const goodFull = this.countUp('monkey') >= MAX_CONCURRENT;
    const decoyFull = this.countUp('decoy') >= MAX_CONCURRENT_DECOY;
    if (kind === 'monkey' && goodFull) kind = 'decoy';
    if (kind === 'decoy' && decoyFull) kind = 'monkey';
    if ((kind === 'monkey' && goodFull) || (kind === 'decoy' && decoyFull)) return; // both full

    // Eligible holes: empty + off cooldown, preferring not the last-used hole.
    // The cooldown already blocks immediate reuse; the last-hole preference
    // spreads pops out a little more when several holes are free.
    const eligible = this.holes.filter((h) => h.mole === null && h.cooldown <= 0);
    if (eligible.length === 0) return;
    const spread = eligible.filter((h) => h.index !== this.lastHole);
    const pool = spread.length > 0 ? spread : eligible;
    const hole = pool[Math.floor(this.rng() * pool.length)]!;

    const species = kind === 'decoy' ? DECOY_SPECIES[Math.floor(this.rng() * DECOY_SPECIES.length)]! : null;
    hole.mole = spawnMole(this.nextId++, hole.index, kind, species, this.uptimeS);
    hole.cooldown = HOLE_COOLDOWN_FACTOR * this.interval;
    this.lastHole = hole.index;
  }
}
