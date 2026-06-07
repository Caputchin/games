// Serializable sim types. The authoritative state lives in the melonJS physics
// world (me.Body positions/velocities, driven by world.update); SimState is a
// plain-JSON projection read back each step for the verdict + the renderer. The
// live melonJS bodies / Application live in the preset's per-round api.ctx.

export type Dir = 0 | 1 | 2 | 3;

export type GhostMode = 'scatter' | 'chase' | 'frightened' | 'eaten';

/** One player input. The runner is still by default; these drive it:
 *  - `hold`    a direction key/button went (or stays) down: move that way,
 *              continuing past cell centers while held.
 *  - `release` the held key/button went up: finish the current cell, then stop
 *              (a quick down+up = a one-cell "tap" via the engine's pending-tap).
 *  Click/tap-to-move is NOT a sim action: the live driver converts a tap into
 *  these same hold/release inputs client-side, so the sim never pathfinds. */
export type SimAction =
  | { readonly k: 'hold'; readonly d: Dir }
  | { readonly k: 'release' };

export interface MoverView {
  /** Pixel position (from the physics body). */
  x: number;
  y: number;
  /** Current facing. */
  dir: Dir;
}

export interface GhostView extends MoverView {
  mode: GhostMode;
  kind: number;
}

export interface SimConfig {
  /** Percent of the maze's dots (pellets + power dots) the runner must eat to
   *  pass. 50 = half (default), 100 = clear the whole board (Challenge). */
  clearPercent: number;
  ghosts: number;
}

export interface SimState {
  cols: number;
  rows: number;
  /** Flat cols*rows wall grid (the generated maze); read by the live renderer. */
  walls: boolean[];
  /** Flat cols*rows pellet grid: 0 none, 1 pellet, 2 power. Mutated as eaten. */
  pellets: number[];
  pelletsLeft: number;
  /** Total dots the maze started with (pellets + power dots); the win target is
   *  a fraction of this. */
  totalDots: number;
  /** Dots that must be eaten to pass (ceil(totalDots * clearPercent / 100)). */
  passDots: number;
  runner: MoverView;
  /** Manual movement intent (from hold/release). `wantDir` is the desired
   *  direction; `held` keeps moving past cell centers; `pendingTap` commits at
   *  least one cell even if released first (the one-block tap). */
  wantDir: Dir | null;
  held: boolean;
  pendingTap: boolean;
  ghosts: GhostView[];
  score: number;
  ghostsEatenThisFright: number;
  frightTimer: number;
  phase: 'scatter' | 'chase';
  phaseTimer: number;
  tick: number;
  passed: boolean;
  status: 'playing' | 'won' | 'caught';
}

/** Render projection the live renderer consumes. Exposes only the on-screen
 *  entities and game status. Internal AI scheduler fields (phase, phaseTimer,
 *  ghostsEatenThisFright, wantDir, held, pendingTap, totalDots,
 *  passDots, tick) are omitted so the view does not leak solver-useful latent
 *  state. `frightTimer` is retained as a render hint: the renderer uses it to
 *  flash frightened ghosts in the final stretch (a player-visible cue). */
export interface SimView {
  /** Maze dimensions - needed by the renderer to compute cell positions. */
  cols: number;
  rows: number;
  /** Flat wall grid so the renderer can draw the maze layout. */
  walls: readonly boolean[];
  /** Remaining pellet grid (0 none, 1 pellet, 2 power). Already mutated in
   *  state; the renderer draws only cells where pellets[i] !== 0. */
  pellets: readonly number[];
  pelletsLeft: number;
  /** Runner pixel position and facing direction. */
  runner: MoverView;
  /** On-screen ghost entities (position, direction, mode, kind). Mode drives
   *  the frightened/eaten visual; kind selects the sprite color. */
  ghosts: readonly GhostView[];
  /** Ticks remaining in the frightened phase. Render hint for the flash
   *  animation; omits phase-schedule internals (phase, phaseTimer). */
  frightTimer: number;
  score: number;
  passed: boolean;
  status: 'playing' | 'won' | 'caught';
}
