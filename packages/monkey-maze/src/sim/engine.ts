// Monkey Maze sim, built on the FULL melonJS engine via @caputchin/preset-melonjs.
// The runner and chasers are real me.Body dynamic bodies (top-down, gravity 0)
// moving by velocity; the maze walls are static me.Body bodies; melonJS resolves
// wall collisions inside world.update. The preset's deterministic env makes that
// float physics bit-reproducible, so the same trace replays to the same verdict.
//
// Grid coordinates are used only for high-level decisions (which turns are open,
// where pellets sit); the engine owns the actual movement + collision.

import {
  defineMelonGame,
  type MelonGameApi,
  type MelonGameSpec,
  type Result,
} from '@caputchin/preset-melonjs';
import * as me from 'melonjs';
import {
  TILE,
  DIRS,
  reverse,
  RUNNER_SPEED,
  GHOST_SPEED,
  FRIGHT_SPEED,
  EATEN_SPEED,
  CENTER_EPS,
  SCATTER_TICKS,
  CHASE_TICKS,
  FRIGHT_TICKS,
  SCORE_PELLET,
  SCORE_POWER,
  SCORE_GHOST,
} from './constants.js';
import { generateMaze, isOpen } from './maze.js';
import { resolveSimConfig } from './config.js';
import type { Dir, GhostView, SimAction, SimConfig, SimState, SimView } from './types.js';

type RawConfig = Record<string, unknown>;

interface Body {
  pos: { x: number; y: number; set(x: number, y: number): void };
  vel: { x: number; y: number; set(x: number, y: number): void };
}
interface Mover {
  body: { pos: Body['pos']; vel: Body['vel'] };
}

interface Ctx {
  cols: number;
  rows: number;
  walls: readonly boolean[];
  cfg: SimConfig;
  runner: Mover;
  ghosts: Array<Mover & { homeX: number; homeY: number; penX: number; penY: number }>;
}

const HOME_CORNERS: ReadonlyArray<readonly [number, number]> = [
  [1, 1], [-2, 1], [1, -2], [-2, -2],
];

// Pixel centre of a cell's top-left origin (bodies are placed at cell origin).
function cellCenterX(cx: number): number {
  return cx * TILE;
}
function cellOf(px: number): number {
  return Math.round(px / TILE);
}
function atCenter(px: number, cell: number): boolean {
  return Math.abs(px - cell * TILE) <= CENTER_EPS;
}

function firstOpenDir(walls: readonly boolean[], cols: number, rows: number, cx: number, cy: number): Dir {
  for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
    const v = DIRS[d] as readonly [number, number];
    if (isOpen(walls, cols, rows, cx + v[0], cy + v[1])) return d;
  }
  return 3;
}

function makeBody(api: MelonGameApi<RawConfig>, cx: number, cy: number, dynamic: boolean): Mover {
  const size = TILE - 2;
  const off = (TILE - size) / 2;
  const r = new api.me.Renderable(cellCenterX(cx) + off, cy * TILE + off, size, size);
  const b = new api.me.Body(r);
  b.addShape(new api.me.Rect(0, 0, size, size));
  b.gravityScale = 0;
  if (dynamic) {
    b.collisionType = api.me.collision.types.PLAYER_OBJECT;
    b.setCollisionMask(api.me.collision.types.WORLD_SHAPE);
    b.setMaxVelocity(8, 8);
    b.setFriction(0, 0);
  } else {
    b.collisionType = api.me.collision.types.WORLD_SHAPE;
    b.setStatic(true);
  }
  (r as unknown as Record<string, unknown>).body = b;
  api.app.world.addChild(r);
  // Bodies are positioned by their top-left; we track the cell origin (off cancels).
  return { body: { pos: r.pos as Body['pos'], vel: b.vel as Body['vel'] } } as Mover;
}

function setVel(m: Mover, dir: Dir, speed: number): void {
  const v = DIRS[dir] as readonly [number, number];
  m.body.vel.set(v[0] * speed, v[1] * speed);
}

// Read a mover's cell origin from its body pixel position.
function moverCell(m: Mover): { cx: number; cy: number } {
  const off = 1; // (TILE-size)/2 = 1
  return { cx: cellOf(m.body.pos.x - off), cy: cellOf(m.body.pos.y - off) };
}

// Snap the off-axis to the lane centre to keep grid alignment.
function snapToLane(m: Mover, dir: Dir): void {
  const off = 1;
  const { cx, cy } = moverCell(m);
  if (dir === 0 || dir === 2) m.body.pos.set(cx * TILE + off, m.body.pos.y); // vertical -> lock x
  else m.body.pos.set(m.body.pos.x, cy * TILE + off); // horizontal -> lock y
}

function ghostTarget(g: GhostView, runner: { cx: number; cy: number }, home: [number, number]): [number, number] {
  if (g.mode === 'scatter') return home;
  switch (g.kind % 4) {
    case 0: return [runner.cx, runner.cy];
    case 1: return [runner.cx, runner.cy - 4];
    case 2: return [runner.cx + 4, runner.cy];
    default: {
      const dist = Math.abs(g.x / TILE - runner.cx) + Math.abs(g.y / TILE - runner.cy);
      return dist > 6 ? [runner.cx, runner.cy] : home;
    }
  }
}

// BFS distance field: number of corridor steps from every open cell to `target`
// (clamped into bounds). Walls / unreachable cells stay Infinity. This is the
// crux of the chaser AI - it respects walls, so a chaser always steps toward the
// genuine shortest path instead of hugging a wall in the target's Manhattan
// direction (which made them circle the border of open mazes). Pure integer grid
// work, so it is bit-identical live and on replay.
function bfsField(tx: number, ty: number, walls: readonly boolean[], cols: number, rows: number): number[] {
  const field = new Array<number>(cols * rows).fill(Infinity);
  const cx = Math.max(0, Math.min(cols - 1, tx));
  const cy = Math.max(0, Math.min(rows - 1, ty));
  const start = cy * cols + cx;
  field[start] = 0;
  const queue: number[] = [start];
  let head = 0;
  while (head < queue.length) {
    const idx = queue[head] as number;
    head += 1;
    const x = idx % cols;
    const y = (idx - x) / cols;
    const nd = (field[idx] as number) + 1;
    for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
      const v = DIRS[d] as readonly [number, number];
      const nx = x + v[0];
      const ny = y + v[1];
      if (!isOpen(walls, cols, rows, nx, ny)) continue;
      const ni = ny * cols + nx;
      if (nd < (field[ni] as number)) {
        field[ni] = nd;
        queue.push(ni);
      }
    }
  }
  return field;
}

// Random open turn (frightened chasers): pick uniformly among non-reverse open
// neighbors. Reverse only when boxed in.
function randomDir(
  cx: number,
  cy: number,
  curDir: Dir,
  walls: readonly boolean[],
  cols: number,
  rows: number,
  rng: () => number,
): Dir {
  const back = reverse(curDir);
  const opts: Dir[] = [];
  for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
    if (d === back) continue;
    const v = DIRS[d] as readonly [number, number];
    if (isOpen(walls, cols, rows, cx + v[0], cy + v[1])) opts.push(d);
  }
  if (opts.length === 0) return back;
  return opts[Math.floor(rng() * opts.length)] as Dir;
}

// Step toward the target by descending the BFS field: among non-reverse open
// neighbors, take the one with the smallest distance-to-target (dir order breaks
// ties). Reverse only at a dead end. No local minima, so no circling.
function stepDownField(
  cx: number,
  cy: number,
  curDir: Dir,
  field: readonly number[],
  walls: readonly boolean[],
  cols: number,
  rows: number,
): Dir {
  const back = reverse(curDir);
  let best: Dir | null = null;
  let bestDist = Infinity;
  let fallback: Dir | null = null;
  for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
    const v = DIRS[d] as readonly [number, number];
    const nx = cx + v[0];
    const ny = cy + v[1];
    if (!isOpen(walls, cols, rows, nx, ny)) continue;
    if (fallback === null) fallback = d;
    if (d === back) continue;
    const dist = field[ny * cols + nx] ?? Infinity;
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best ?? fallback ?? back;
}

// One step of click-to-move: among open neighbors, the one with the STRICTLY
// smallest distance-to-target (no reverse exclusion - the runner follows the
// shortest path even if that means turning back). Returns null when no neighbor
// is closer, i.e. the runner has arrived or is at the closest reachable cell to
// a walled / unreachable click - so it stops gracefully instead of oscillating.
function gotoStep(
  cx: number,
  cy: number,
  field: readonly number[],
  walls: readonly boolean[],
  cols: number,
  rows: number,
): Dir | null {
  let best: Dir | null = null;
  let bestDist = field[cy * cols + cx] ?? Infinity;
  for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
    const v = DIRS[d] as readonly [number, number];
    const nx = cx + v[0];
    const ny = cy + v[1];
    if (!isOpen(walls, cols, rows, nx, ny)) continue;
    const dist = field[ny * cols + nx] ?? Infinity;
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}

// Distinct spawn cells for the chasers, spread out from the pen along its open
// row (center, then alternating outward). All chasers share one `G` cell in the
// maze, and the BFS AI would otherwise march them in lockstep stacked on top of
// each other; spreading the starts (plus the per-kind targets) keeps them apart.
// Deterministic (no rng), so live and replay spawn identically.
function spreadSpawns(
  base: { cx: number; cy: number },
  count: number,
  walls: readonly boolean[],
  cols: number,
  rows: number,
): Array<{ cx: number; cy: number }> {
  // Prefer 2-cell spacing (clearly separate sprites), then fall back to the odd
  // offsets if the row runs short.
  const offsets: number[] = [0];
  for (let i = 2; i < cols; i += 2) offsets.push(i, -i);
  for (let i = 1; i < cols; i += 2) offsets.push(i, -i);
  const cells: Array<{ cx: number; cy: number }> = [];
  for (const off of offsets) {
    if (cells.length >= count) break;
    const cx = base.cx + off;
    if (isOpen(walls, cols, rows, cx, base.cy)) cells.push({ cx, cy: base.cy });
  }
  while (cells.length < count) cells.push({ cx: base.cx, cy: base.cy });
  return cells;
}

const spec: MelonGameSpec<SimState, SimAction, RawConfig, SimView> = {
  me,
  width: 13 * TILE,
  height: 13 * TILE,

  setup(api): SimState {
    const cfg = resolveSimConfig(api.config);
    // Procedurally generate a unique maze from the round seed (server replays the
    // same seed -> the same maze). Consumes only api.rng, so it stays in lockstep
    // with the headless replay.
    const maze = generateMaze(api.rng);
    const { cols, rows, walls } = maze;

    // Static wall bodies (the engine resolves runner/chaser collisions with these).
    for (let cy = 0; cy < rows; cy += 1) {
      for (let cx = 0; cx < cols; cx += 1) {
        if (walls[cy * cols + cx]) {
          const r = new api.me.Renderable(cx * TILE, cy * TILE, TILE, TILE);
          const b = new api.me.Body(r);
          b.addShape(new api.me.Rect(0, 0, TILE, TILE));
          b.collisionType = api.me.collision.types.WORLD_SHAPE;
          b.setStatic(true);
          (r as unknown as Record<string, unknown>).body = b;
          api.app.world.addChild(r);
        }
      }
    }

    const runner = makeBody(api, maze.runnerSpawn.cx, maze.runnerSpawn.cy, true);
    const runnerDir = firstOpenDir(walls, cols, rows, maze.runnerSpawn.cx, maze.runnerSpawn.cy);

    const ghosts: Ctx['ghosts'] = [];
    const ghostViews: GhostView[] = [];
    const pen = maze.ghostSpawns[0] as { cx: number; cy: number };
    const spawnCells = spreadSpawns(pen, cfg.ghosts, walls, cols, rows);
    for (let k = 0; k < cfg.ghosts; k += 1) {
      const sp = spawnCells[k] as { cx: number; cy: number };
      const corner = HOME_CORNERS[k % 4] as readonly [number, number];
      const homeX = corner[0] < 0 ? cols + corner[0] : corner[0];
      const homeY = corner[1] < 0 ? rows + corner[1] : corner[1];
      const m = makeBody(api, sp.cx, sp.cy, true);
      ghosts.push({ ...m, homeX, homeY, penX: sp.cx, penY: sp.cy });
      const gdir = firstOpenDir(walls, cols, rows, sp.cx, sp.cy);
      ghostViews.push({ x: sp.cx * TILE, y: sp.cy * TILE, dir: gdir, mode: 'scatter', kind: k });
    }

    const ctx = api.ctx as unknown as Ctx;
    ctx.cols = cols;
    ctx.rows = rows;
    ctx.walls = walls;
    ctx.cfg = cfg;
    ctx.runner = runner;
    ctx.ghosts = ghosts;

    const totalDots = maze.pelletsLeft;
    const passDots = Math.max(1, Math.ceil((totalDots * cfg.clearPercent) / 100));

    return {
      cols,
      rows,
      walls: walls.slice(),
      pellets: maze.pellets.slice(),
      pelletsLeft: maze.pelletsLeft,
      totalDots,
      passDots,
      runner: { x: maze.runnerSpawn.cx * TILE, y: maze.runnerSpawn.cy * TILE, dir: runnerDir },
      wantDir: null,
      held: false,
      pendingTap: false,
      gotoTarget: null,
      ghosts: ghostViews,
      score: 0,
      ghostsEatenThisFright: 0,
      frightTimer: 0,
      phase: 'scatter',
      phaseTimer: SCATTER_TICKS,
      tick: 0,
      passed: false,
      status: 'playing',
    };
  },

  input(state, action) {
    switch (action.k) {
      case 'hold':
        // Key/button down: head this way + keep going while held. pendingTap
        // guarantees at least one cell even if released before the next centre.
        state.wantDir = action.d;
        state.held = true;
        state.pendingTap = true;
        state.gotoTarget = null;
        break;
      case 'release':
        // Key/button up: stop continuing (a pending one-cell tap still completes).
        state.held = false;
        break;
      case 'goto':
        state.gotoTarget = { cx: action.cx, cy: action.cy };
        state.wantDir = null;
        state.held = false;
        state.pendingTap = false;
        break;
      default:
        break;
    }
    return state;
  },

  afterStep(state, api): SimState {
    const ctx = api.ctx as unknown as Ctx;
    const { walls, cols, rows } = ctx;
    state.tick += 1;

    // Phase schedule.
    if (state.frightTimer === 0) {
      state.phaseTimer -= 1;
      if (state.phaseTimer <= 0) {
        state.phase = state.phase === 'scatter' ? 'chase' : 'scatter';
        state.phaseTimer = state.phase === 'scatter' ? SCATTER_TICKS : CHASE_TICKS;
        for (const g of state.ghosts) if (g.mode === 'scatter' || g.mode === 'chase') g.mode = state.phase;
      }
    } else {
      state.frightTimer -= 1;
      if (state.frightTimer === 0) {
        for (const g of state.ghosts) if (g.mode === 'frightened') g.mode = state.phase;
        state.ghostsEatenThisFright = 0;
      }
    }

    // ---- runner movement (still by default; player-driven) ----
    // Decisions only at cell centres so movement stays grid-aligned and a tap
    // commits exactly one cell. Between centres the body coasts on the velocity
    // set at the last centre, so it always completes the cell it entered.
    const rc = moverCell(ctx.runner);
    if (atCenter(ctx.runner.body.pos.x - 1, rc.cx) && atCenter(ctx.runner.body.pos.y - 1, rc.cy)) {
      let nextDir: Dir | null = null;

      // 1) click-to-move: walk down the BFS field toward the target, stopping at
      //    the closest reachable cell (handles a wall / unreachable click).
      if (state.gotoTarget) {
        if (rc.cx === state.gotoTarget.cx && rc.cy === state.gotoTarget.cy) {
          state.gotoTarget = null;
        } else {
          const field = bfsField(state.gotoTarget.cx, state.gotoTarget.cy, walls, cols, rows);
          const d = gotoStep(rc.cx, rc.cy, field, walls, cols, rows);
          if (d !== null) nextDir = d;
          else state.gotoTarget = null;
        }
      }

      // 2) manual hold/tap (only when not auto-walking to a goto target).
      if (nextDir === null && state.wantDir !== null) {
        const wv = DIRS[state.wantDir] as readonly [number, number];
        if (isOpen(walls, cols, rows, rc.cx + wv[0], rc.cy + wv[1])) {
          if (state.held) {
            nextDir = state.wantDir;
          } else if (state.pendingTap) {
            nextDir = state.wantDir;
            state.pendingTap = false;
          }
        } else {
          state.pendingTap = false; // can't tap into a wall
        }
      }

      if (nextDir !== null) {
        state.runner.dir = nextDir;
        snapToLane(ctx.runner, nextDir);
        setVel(ctx.runner, nextDir, RUNNER_SPEED);
      } else {
        ctx.runner.body.vel.set(0, 0);
        state.pendingTap = false;
      }
    }
    state.runner.x = ctx.runner.body.pos.x - 1;
    state.runner.y = ctx.runner.body.pos.y - 1;

    // pellet pickup (cell-based, off the physics position)
    const ri = rc.cy * cols + rc.cx;
    const pellet = state.pellets[ri] ?? 0;
    if (pellet === 1) {
      state.pellets[ri] = 0;
      state.pelletsLeft -= 1;
      state.score += SCORE_PELLET;
    } else if (pellet === 2) {
      state.pellets[ri] = 0;
      state.pelletsLeft -= 1;
      state.score += SCORE_POWER;
      state.frightTimer = FRIGHT_TICKS;
      state.ghostsEatenThisFright = 0;
      for (const g of state.ghosts) if (g.mode === 'scatter' || g.mode === 'chase') g.mode = 'frightened';
    }

    // ---- chasers ----
    for (let k = 0; k < state.ghosts.length; k += 1) {
      const gv = state.ghosts[k] as GhostView;
      const gm = ctx.ghosts[k] as Ctx['ghosts'][number];
      const gc = moverCell(gm);
      if (atCenter(gm.body.pos.x - 1, gc.cx) && atCenter(gm.body.pos.y - 1, gc.cy)) {
        const target = gv.mode === 'eaten'
          ? ([gm.penX, gm.penY] as [number, number])
          : ghostTarget(gv, rc, [gm.homeX, gm.homeY]);
        const dir = gv.mode === 'frightened'
          ? randomDir(gc.cx, gc.cy, gv.dir, walls, cols, rows, api.rng)
          : stepDownField(gc.cx, gc.cy, gv.dir, bfsField(target[0], target[1], walls, cols, rows), walls, cols, rows);
        gv.dir = dir;
        snapToLane(gm, dir);
        const speed = gv.mode === 'eaten' ? EATEN_SPEED : gv.mode === 'frightened' ? FRIGHT_SPEED : GHOST_SPEED;
        setVel(gm, dir, speed);
        if (gv.mode === 'eaten' && gc.cx === gm.penX && gc.cy === gm.penY) gv.mode = state.phase;
      }
      gv.x = gm.body.pos.x - 1;
      gv.y = gm.body.pos.y - 1;

      // contact (cell match)
      if (gc.cx === rc.cx && gc.cy === rc.cy) {
        if (gv.mode === 'frightened') {
          state.ghostsEatenThisFright += 1;
          state.score += SCORE_GHOST * state.ghostsEatenThisFright;
          gv.mode = 'eaten';
        } else if (gv.mode !== 'eaten') {
          state.status = 'caught';
        }
      }
    }

    // Win = eat at least the target fraction of the maze's dots. Clearing the
    // whole board (target reached at 100%, or any leftover-free finish) is the
    // "won" status; a sub-100% target just passes the check.
    const eaten = state.totalDots - state.pelletsLeft;
    if (!state.passed && eaten >= state.passDots) state.passed = true;
    if (state.pelletsLeft <= 0) {
      state.status = 'won';
      state.passed = true;
    }
    return state;
  },

  isOver(state) {
    return state.passed || state.status !== 'playing';
  },

  result(state): Result {
    return { score: state.score, passed: state.passed || state.status === 'won' };
  },

  view(state): SimView {
    // Project only on-screen entities and render hints. Internal AI/scheduler
    // fields (phase, phaseTimer, ghostsEatenThisFright, wantDir, held,
    // pendingTap, gotoTarget, totalDots, passDots, tick) are intentionally
    // omitted so the view does not expose latent solver-useful state.
    // `frightTimer` is retained as a render hint for the flash animation.
    return {
      cols: state.cols,
      rows: state.rows,
      walls: state.walls,
      pellets: state.pellets,
      pelletsLeft: state.pelletsLeft,
      runner: state.runner,
      ghosts: state.ghosts,
      frightTimer: state.frightTimer,
      score: state.score,
      passed: state.passed,
      status: state.status,
    };
  },
};

export const gameSpec = spec;
export const engine = defineMelonGame<SimState, SimAction, RawConfig, SimView>(spec);
