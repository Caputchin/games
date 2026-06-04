// Original maze layouts (NOT the 1980 Pac-Man grid - that trade dress is
// protected). Four distinct topologies - two pillar grids, an open arena, and
// vertical galleries - each guaranteed connected (every corridor cell reachable
// from every other; a connectivity test asserts this). The round seed picks one
// layout, so consecutive sessions vary; a fixed-seed harness always shows the
// first.
//
// Symbols: '#' wall, '.' pellet, 'o' power pellet, 'P' runner spawn,
//          'G' chaser pen, ' ' empty path.

// Runner (P) spawns bottom-center, chasers (G) top-center: maximum initial
// separation so the round is winnable. Power dots sit near the corners.
// Runner (P) spawns bottom-center, chasers (G) top-center: maximum initial
// separation so the round is winnable. Power dots sit on INNER rows (never the
// spawn rows), so passing requires real navigation into the maze rather than a
// straight line into an adjacent power dot.
export const MAZES: ReadonlyArray<readonly string[]> = [
  [
    '#############',
    '#.....G.....#',
    '#.#.#.#.#.#.#',
    '#o.........o#',
    '#.#.#.#.#.#.#',
    '#...........#',
    '#.#.#.#.#.#.#',
    '#...........#',
    '#.#.#.#.#.#.#',
    '#o.........o#',
    '#.#.#.#.#.#.#',
    '#.....P.....#',
    '#############',
  ],
  [
    '#############',
    '#.....G.....#',
    '#.#.#.#.#.#.#',
    '#...........#',
    '#.#.#.#.#.#.#',
    '#o.........o#',
    '#.#.#.#.#.#.#',
    '#o.........o#',
    '#.#.#.#.#.#.#',
    '#...........#',
    '#.#.#.#.#.#.#',
    '#.....P.....#',
    '#############',
  ],
  // Open arena: wide clear rows with a few stub blocks. Fewer walls than the
  // pillar grids, so chasers cut across and the runner has more open ground.
  [
    '#############',
    '#.....G.....#',
    '#...........#',
    '#o.##.#.##.o#',
    '#...........#',
    '#.#.#.#.#.#.#',
    '#...........#',
    '#.#.#.#.#.#.#',
    '#...........#',
    '#o.##.#.##.o#',
    '#...........#',
    '#.....P.....#',
    '#############',
  ],
  // Vertical galleries: long lanes split by full-height bars, joined only along
  // the open top row and the open basement (rows 9-11). Lane-switching forces
  // commitment, so it plays very differently from the pillar grids.
  [
    '#############',
    '#.....G.....#',
    '#.#.#.#.#.#.#',
    '#.#.#.#.#.#.#',
    '#.#.#.#.#.#.#',
    '#o#.#.#.#.#o#',
    '#.#.#.#.#.#.#',
    '#.#.#.#.#.#.#',
    '#.#.#.#.#.#.#',
    '#o.........o#',
    '#...........#',
    '#.....P.....#',
    '#############',
  ],
];

export interface ParsedMaze {
  readonly cols: number;
  readonly rows: number;
  readonly walls: readonly boolean[]; // flat cols*rows
  readonly pellets: number[]; // flat cols*rows: 0 none, 1 pellet, 2 power
  readonly pelletsLeft: number;
  readonly runnerSpawn: { cx: number; cy: number };
  readonly ghostSpawns: ReadonlyArray<{ cx: number; cy: number }>;
}

export function mazeCount(): number {
  return MAZES.length;
}

/** Parse a layout id into walls, pellets, and spawns. Deterministic + pure. */
export function parseMaze(id: number): ParsedMaze {
  const layout = MAZES[((id % MAZES.length) + MAZES.length) % MAZES.length] as readonly string[];
  const rows = layout.length;
  const cols = (layout[0] ?? '').length;
  const walls: boolean[] = new Array(cols * rows).fill(false);
  const pellets: number[] = new Array(cols * rows).fill(0);
  let runnerSpawn = { cx: 1, cy: 1 };
  const ghostSpawns: Array<{ cx: number; cy: number }> = [];
  let pelletsLeft = 0;

  for (let r = 0; r < rows; r += 1) {
    const line = layout[r] ?? '';
    for (let c = 0; c < cols; c += 1) {
      const ch = line[c] ?? '#';
      const i = r * cols + c;
      switch (ch) {
        case '#':
          walls[i] = true;
          break;
        case '.':
          pellets[i] = 1;
          pelletsLeft += 1;
          break;
        case 'o':
          pellets[i] = 2;
          pelletsLeft += 1;
          break;
        case 'P':
          runnerSpawn = { cx: c, cy: r };
          break;
        case 'G':
          ghostSpawns.push({ cx: c, cy: r });
          break;
        default:
          break; // empty path
      }
    }
  }

  if (ghostSpawns.length === 0) ghostSpawns.push({ cx: Math.floor(cols / 2), cy: Math.floor(rows / 2) });

  return { cols, rows, walls, pellets, pelletsLeft, runnerSpawn, ghostSpawns };
}

/** True when (cx,cy) is inside the grid and not a wall. */
export function isOpen(walls: readonly boolean[], cols: number, rows: number, cx: number, cy: number): boolean {
  if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return false;
  return !walls[cy * cols + cx];
}

const STEPS4: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

/** Count of open cells reachable from `start` (flood fill). */
function reachableOpen(walls: readonly boolean[], cols: number, rows: number, start: { cx: number; cy: number }): number {
  const seen = new Uint8Array(cols * rows);
  const queue: number[] = [start.cy * cols + start.cx];
  seen[queue[0] as number] = 1;
  let head = 0;
  let count = 0;
  while (head < queue.length) {
    const idx = queue[head] as number;
    head += 1;
    count += 1;
    const cx = idx % cols;
    const cy = (idx - cx) / cols;
    for (const s of STEPS4) {
      const nx = cx + s[0];
      const ny = cy + s[1];
      if (!isOpen(walls, cols, rows, nx, ny)) continue;
      const ni = ny * cols + nx;
      if (!seen[ni]) {
        seen[ni] = 1;
        queue.push(ni);
      }
    }
  }
  return count;
}

/** Total open cells in the grid. */
function totalOpen(walls: readonly boolean[]): number {
  let n = 0;
  for (let i = 0; i < walls.length; i += 1) if (!walls[i]) n += 1;
  return n;
}

const GEN_ATTEMPTS = 12;

function evensIn(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let n = lo % 2 === 0 ? lo : lo + 1; n <= hi; n += 2) out.push(n);
  return out;
}
function oddsIn(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let n = lo % 2 === 0 ? lo + 1 : lo; n <= hi; n += 2) out.push(n);
  return out;
}

/**
 * Recursive division. Splits a chamber with a straight wall on an EVEN coordinate
 * leaving one ODD-coordinate gap (a passage), then recurses on the two halves.
 * The per-wall gap is what makes the result a connected maze (real corridors +
 * walls) rather than scattered blocks, and connectivity is guaranteed by
 * construction. Walls land on even rows/cols and gaps on odd, so odd/odd cells
 * are never walls (the spawns + power dots sit there).
 */
function recursiveDivide(
  walls: boolean[],
  rng: () => number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cols: number,
  rows: number,
): void {
  const w = x2 - x1 + 1;
  const h = y2 - y1 + 1;
  if (w < 3 || h < 3) return;
  const horizontal = h > w ? true : w > h ? false : rng() < 0.5;
  if (horizontal) {
    const rowOpts = evensIn(y1 + 1, y2 - 1);
    if (rowOpts.length === 0) return;
    const wy = rowOpts[Math.floor(rng() * rowOpts.length)] as number;
    const gapOpts = oddsIn(x1, x2);
    const gap = gapOpts.length ? (gapOpts[Math.floor(rng() * gapOpts.length)] as number) : x1;
    for (let x = x1; x <= x2; x += 1) if (x !== gap) walls[wy * cols + x] = true;
    recursiveDivide(walls, rng, x1, y1, x2, wy - 1, cols, rows);
    recursiveDivide(walls, rng, x1, wy + 1, x2, y2, cols, rows);
  } else {
    const colOpts = evensIn(x1 + 1, x2 - 1);
    if (colOpts.length === 0) return;
    const wx = colOpts[Math.floor(rng() * colOpts.length)] as number;
    const gapOpts = oddsIn(y1, y2);
    const gap = gapOpts.length ? (gapOpts[Math.floor(rng() * gapOpts.length)] as number) : y1;
    for (let y = y1; y <= y2; y += 1) if (y !== gap) walls[y * cols + wx] = true;
    recursiveDivide(walls, rng, x1, y1, wx - 1, y2, cols, rows);
    recursiveDivide(walls, rng, wx + 1, y1, x2, y2, cols, rows);
  }
}

const BRAID_PROB = 0.7;

/**
 * Braid: open most dead-ends (open cells with <=1 open neighbor) into a wall, so
 * the maze gains loops. A pure recursive-division maze is a tree of dead-ends -
 * bad for a chase (you get cornered) - so braiding adds escape routes while
 * keeping the maze look. Opening walls only ADDS connectivity, so the maze stays
 * connected.
 */
function braid(walls: boolean[], rng: () => number, cols: number, rows: number): void {
  for (let y = 1; y < rows - 1; y += 1) {
    for (let x = 1; x < cols - 1; x += 1) {
      if (walls[y * cols + x]) continue;
      let open = 0;
      const wallNbrs: number[] = [];
      for (const s of STEPS4) {
        const nx = x + s[0];
        const ny = y + s[1];
        if (isOpen(walls, cols, rows, nx, ny)) open += 1;
        else if (nx > 0 && ny > 0 && nx < cols - 1 && ny < rows - 1) wallNbrs.push(ny * cols + nx);
      }
      if (open <= 1 && wallNbrs.length > 0 && rng() < BRAID_PROB) {
        walls[wallNbrs[Math.floor(rng() * wallNbrs.length)] as number] = false;
      }
    }
  }
}

/**
 * Deterministically GENERATE a maze from a seeded rng (the round seed's stream),
 * so the server replays the identical maze. Recursive division carves real
 * connected corridors + walls (not scattered pillars); braiding opens dead-ends
 * into loops for fair chase play. Connected by construction, re-checked by flood
 * fill, with a hand-maze fallback. Spawns + the four corner power dots sit on
 * odd/odd cells (never walls). Consumes ONLY the passed rng, so it is
 * bit-reproducible on the server replay.
 */
export function generateMaze(rng: () => number, cols = 13, rows = 13): ParsedMaze {
  const oddNear = (n: number): number => (n % 2 === 0 ? n - 1 : n);
  const spawnCol = oddNear(Math.floor(cols / 2));
  const runnerSpawn = { cx: spawnCol, cy: rows - 2 };
  const pen = { cx: spawnCol, cy: 1 };

  for (let attempt = 0; attempt < GEN_ATTEMPTS; attempt += 1) {
    const walls: boolean[] = new Array(cols * rows).fill(false);
    for (let c = 0; c < cols; c += 1) {
      walls[c] = true;
      walls[(rows - 1) * cols + c] = true;
    }
    for (let r = 0; r < rows; r += 1) {
      walls[r * cols] = true;
      walls[r * cols + cols - 1] = true;
    }

    recursiveDivide(walls, rng, 1, 1, cols - 2, rows - 2, cols, rows);
    braid(walls, rng, cols, rows);

    // Spawns are odd/odd (never walled), but force-open + carry their own gap
    // defensively.
    walls[runnerSpawn.cy * cols + runnerSpawn.cx] = false;
    walls[pen.cy * cols + pen.cx] = false;

    if (reachableOpen(walls, cols, rows, runnerSpawn) === totalOpen(walls)) {
      return assembleGenerated(walls, cols, rows, runnerSpawn, pen);
    }
  }

  // Unreachable in practice (recursive division + braid is always connected);
  // fall back to a known-good hand layout rather than ever ship an unwinnable round.
  return parseMaze(Math.floor(rng() * MAZES.length));
}

function assembleGenerated(
  walls: boolean[],
  cols: number,
  rows: number,
  runnerSpawn: { cx: number; cy: number },
  pen: { cx: number; cy: number },
): ParsedMaze {
  const pellets: number[] = new Array(cols * rows).fill(0);
  // Four symmetric inner-corner power dots (odd row/col, always open).
  const power: ReadonlyArray<readonly [number, number]> = [
    [1, 3],
    [cols - 2, 3],
    [1, rows - 4],
    [cols - 2, rows - 4],
  ];
  const isPower = (cx: number, cy: number): boolean => power.some(([px, py]) => px === cx && py === cy);
  const isSpawn = (cx: number, cy: number): boolean =>
    (cx === runnerSpawn.cx && cy === runnerSpawn.cy) || (cx === pen.cx && cy === pen.cy);

  let pelletsLeft = 0;
  for (let r = 1; r < rows - 1; r += 1) {
    for (let c = 1; c < cols - 1; c += 1) {
      const i = r * cols + c;
      if (walls[i] || isSpawn(c, r)) continue;
      pellets[i] = isPower(c, r) ? 2 : 1;
      pelletsLeft += 1;
    }
  }
  return { cols, rows, walls, pellets, pelletsLeft, runnerSpawn, ghostSpawns: [pen] };
}
