// Tunable constants for the Monkey Maze sim. Movement is now driven by real
// melonJS physics (me.Body velocity + collision with wall bodies); the preset
// makes the float physics bit-reproducible, so these are ordinary numbers, not
// fixed-point. Grid coordinates are still used for high-level decisions (which
// turns are open, where pellets sit).

export const TILE = 16; // px per cell

// Body velocities in px-per-step (melonJS body.vel units). Tuned for control, not
// frantic speed (~3.75 cells/s for the runner). The runner is only a little
// faster than the chasers, so they are a real threat you must dodge - escapable
// with skill, not trivially outrun; frightened/eyes speeds keep them catchable.
export const RUNNER_SPEED = 1.0;
export const GHOST_SPEED = 0.85;
export const FRIGHT_SPEED = 0.5;
export const EATEN_SPEED = 1.5;

// How close (px) an entity must be to a cell centre to count as "at" it (turn
// decisions + pellet pickup happen at cell centres). Slightly above one step of
// the slower chasers so they reliably register at junctions.
export const CENTER_EPS = 1.4;

// Phase schedule (ticks), classic-style scatter/chase alternation. Scatter is
// kept short: chasers path to their home corner and idle there, which reads as
// "stuck on the edge", so we only grant a brief breather before they hunt again.
export const SCATTER_TICKS = 3 * 60;
export const CHASE_TICKS = 20 * 60;
export const FRIGHT_TICKS = 6 * 60;

// Scoring. Score is cosmetic now (the win is dots-eaten, not a score threshold),
// so eating a chaser is a small bonus, not a jackpot - it must not dwarf the
// dot-clearing that actually wins the round. Progressive within one fright
// (50 / 100 / 150 / 200 for a 1-2-3-4 chain).
export const SCORE_PELLET = 10;
export const SCORE_POWER = 50;
export const SCORE_GHOST = 50;

// A non-terminating run is rejectable; bound it well above a real round.
export const MAX_TICKS = 6000;

// Win condition is "eat at least this percent of the dots" (pellets + power
// dots), not a score threshold. 50 = half the maze (the default), 100 = clear
// the whole board (the Challenge preset). The dot count target is derived per
// round from the chosen maze's total pickups.
export const DEFAULT_CLEAR_PERCENT = 50;
export const DEFAULT_GHOSTS = 4;

// Directions: index -> [dx, dy]. Order is the ghost tie-break (up, left, down, right).
export const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [-1, 0],
  [0, 1],
  [1, 0],
];

/** Opposite direction. */
export function reverse(dir: number): import('./types.js').Dir {
  return ((dir + 2) % 4) as import('./types.js').Dir;
}
