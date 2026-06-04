// Default sim parameters. The board is deliberately NOT the 10x20 well that is
// part of the Tetris trade dress; 7x12 is a distinct, portrait-friendly field.
// Every value is overridable per site through the dashboard config.
//
// Blockfall is a SPRINT: the board starts as a near-complete seeded wall with a
// few open-top gaps, and the round is won by clearing a small number of lines in
// a handful of placements (a ~10-15s captcha, not a long Tetris session). So
// gravity is gentle (the piece hangs while you aim) and placement is driven by a
// drop (swipe down / space), which sends the piece quickly to the floor.
export const DEFAULT_COLS = 7;
export const DEFAULT_ROWS = 12;
export const DEFAULT_PASS_LINES = 2;

// Timing is in fixed ticks (the preset runs the sim at 50 ticks per second).
export const GRAVITY = 55; // ~1.1s per cell; very gentle, since the player places with a drop / tap
export const LOCK_DELAY = 16; // ticks a resting piece waits before locking (~0.3s)
export const SOFT_DROP_INTERVAL = 2; // ticks per cell while soft dropping
// The drop (swipe down / space): the piece falls FAST but visibly - one cell per
// tick (~0.16s for a full-height drop), not an instant teleport - then commits
// (locks on landing without waiting out the lock delay).
export const FAST_FALL_INTERVAL = 1;
export const DAS_DELAY = 9; // ticks before horizontal auto-repeat engages
export const ARR = 2; // ticks between auto-repeat steps

// The spawn box is 4 wide; spawn just above the field.
export const SPAWN_ROW = 0;

// --- Puzzle generation ---
// Rows pre-filled as the starting "wall". The bottom `passLines` of these are the
// rows the player completes; the rest sit above as decoration (they never fill,
// so they never complete). Tall enough to read as a substantial wall.
export const WALL_ROWS = 4;
// How many 2-wide open-top slots to carve into the wall (each takes one O-piece
// "key"). Few, so the round is a handful of deliberate placements (~10-15s).
export const GAP_SLOTS_MIN = 2;
export const GAP_SLOTS_MAX = 3;
