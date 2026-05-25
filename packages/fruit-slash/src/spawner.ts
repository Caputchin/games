// Spawn scheduler + target lifecycle (state only, no DOM/canvas). Schedules
// launches on a jittered cadence, integrates every live target by real dt
// (frame-rate independent via launch.integrate), and reports targets that
// exited off the bottom so the caller can debit a life for a missed good fruit.

import type { Rng } from './rng.js';
import { deriveLaunch, integrate, isOffBottom, type LaunchBounds, type LaunchState } from './launch.js';

export type TargetKind = 'good' | 'hazard';

export interface Target {
  id: number;
  kind: TargetKind;
  state: LaunchState;
  sliced: boolean;
  /** Palette index (0..2) for good fruit; ignored for bombs. */
  hue: number;
  /** Spin angle (radians) for the drawn shape, advanced by the orchestrator. */
  spin: number;
  spinRate: number;
}

export interface SpawnConfig {
  spawnRate: number;
  hazardChance: number;
  maxConcurrent: number;
}

export class Spawner {
  private nextId = 0;
  private timer = 0;
  private interval: number;
  private targets: Target[] = [];
  // Mutable so the orchestrator can ramp difficulty over time (progression.ts).
  private spawnRate: number;
  private hazardChance: number;
  private readonly maxConcurrent: number;

  constructor(
    private readonly rng: Rng,
    private readonly bounds: LaunchBounds,
    cfg: SpawnConfig,
  ) {
    this.spawnRate = cfg.spawnRate;
    this.hazardChance = cfg.hazardChance;
    this.maxConcurrent = cfg.maxConcurrent;
    this.interval = this.pickInterval();
  }

  /** Update the live difficulty (spawn cadence + bomb chance). */
  setDifficulty(d: { spawnRate: number; hazardChance: number }): void {
    this.spawnRate = d.spawnRate;
    this.hazardChance = d.hazardChance;
  }

  get live(): readonly Target[] {
    return this.targets;
  }

  reset(): void {
    this.targets = [];
    this.timer = 0;
    this.nextId = 0;
    this.interval = this.pickInterval();
  }

  /** Advance time by `dt` seconds: emit due spawns (respecting maxConcurrent),
   *  integrate live targets, and split off any that exited the bottom. */
  update(dt: number): { spawned: Target[]; escaped: Target[] } {
    const spawned: Target[] = [];
    this.timer += dt;
    // `while` so a long (clamped) dt can still emit at most a few; the
    // maxConcurrent cap bounds it.
    while (this.timer >= this.interval) {
      this.timer -= this.interval;
      this.interval = this.pickInterval();
      if (this.targets.length < this.maxConcurrent) {
        const t = this.spawnOne();
        this.targets.push(t);
        spawned.push(t);
      }
    }

    const escaped: Target[] = [];
    const survivors: Target[] = [];
    for (const t of this.targets) {
      if (t.sliced) continue; // sliced this frame -> drop (orchestrator handles fx)
      t.state = integrate(t.state, this.bounds.gravity, dt);
      t.spin += t.spinRate * dt;
      if (isOffBottom(t.state, this.bounds.height, this.bounds.radius)) {
        escaped.push(t);
      } else {
        survivors.push(t);
      }
    }
    this.targets = survivors;
    return { spawned, escaped };
  }

  private pickInterval(): number {
    const base = 1 / Math.max(0.1, this.spawnRate);
    const jitter = base * 0.4 * (this.rng() * 2 - 1);
    return Math.max(0.15, base + jitter);
  }

  private spawnOne(): Target {
    const kind: TargetKind = this.rng() < this.hazardChance ? 'hazard' : 'good';
    const state = deriveLaunch(this.rng, this.bounds);
    return {
      id: this.nextId++,
      kind,
      state,
      sliced: false,
      hue: Math.floor(this.rng() * 3),
      spin: this.rng() * Math.PI * 2,
      spinRate: (this.rng() * 2 - 1) * 1.5,
    };
  }
}
