//! Wall Smash deterministic sim, authored as Bevy ECS (`bevy_ecs`).
//!
//! The SAME systems compile into the headless replay build and the live browser
//! build, so the server and the player run identical logic. Determinism is by
//! construction: fixed-point i32 math (1 unit = 256 subunits), a fixed logical
//! tick, an integer PRNG, and no clock / float transcendentals anywhere. The host
//! drives the sim one `tick` at a time, feeding the recorded input for that tick.

use bevy_ecs::prelude::*;

/// Subunits per world unit (fixed-point scale).
pub const FP: i32 = 256;
/// Logical ticks per second (fixed timestep). Used only to report durationMs.
pub const TICK_HZ: u32 = 60;

/// Per-paddle-hit horizontal influence: ball vx gains `offset >> CONTROL_SHIFT`.
const CONTROL_SHIFT: i32 = 3;

/// Upward launch directions in 1/256 fixed-point unit vectors (magnitude ~256),
/// a dense arc from -60deg to +60deg off vertical. The seed selects one and adds
/// a fine horizontal jitter, so the launch vector has hundreds of distinct values
/// whose trajectories diverge chaotically over bounces. That is the anti-cheat
/// property: a trace memorized under one seed misses under another.
const LAUNCH_DIRS: [(i32, i32); 21] = [
    (-222, -128),
    (-207, -150),
    (-190, -171),
    (-171, -190),
    (-150, -207),
    (-128, -222),
    (-104, -234),
    (-79, -243),
    (-53, -250),
    (-27, -255),
    (0, -256),
    (27, -255),
    (53, -250),
    (79, -243),
    (104, -234),
    (128, -222),
    (150, -207),
    (171, -190),
    (190, -171),
    (207, -150),
    (222, -128),
];

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Phase {
    Playing,
    Won,
    Lost,
}

/// Resolved, opaque-config-derived gameplay parameters. All lengths in world units.
#[derive(Clone, Copy, Debug)]
pub struct SimConfig {
    pub arena_w: i32,
    pub arena_h: i32,
    pub paddle_w: i32,
    pub paddle_h: i32,
    pub paddle_speed: i32, // subunits / tick
    pub ball_r: i32,
    pub ball_speed: i32, // subunits / tick (vector magnitude)
    pub num_levels: u32, // walls to clear (in order) to win; capped to LEVELS.len()
    pub brick_gap: i32, // units between bricks
    pub top_margin: i32,
    pub lives: u32,
    pub timeout_ticks: u32,
}

impl SimConfig {
    /// Build from the host-resolved flat i32 array (config.ts emits this exact
    /// order for BOTH the live and headless builds, so the two agree). A
    /// non-positive field keeps the default. Order is the contract with config.ts.
    pub fn from_ints(f: &[i32]) -> Self {
        let mut c = SimConfig::default();
        let g = |i: usize, d: i32| *f.get(i).filter(|v| **v > 0).unwrap_or(&d);
        c.paddle_w = g(0, c.paddle_w);
        c.ball_speed = g(1, c.ball_speed);
        c.num_levels = g(2, c.num_levels as i32) as u32;
        c.lives = g(3, c.lives as i32) as u32;
        c.timeout_ticks = g(4, c.timeout_ticks as i32) as u32;
        c
    }
}

impl Default for SimConfig {
    /// Reference (`default`) configuration. The pass threshold is "clear the wall".
    fn default() -> Self {
        // Tuned for a 5-10s captcha: short arena (less ball travel), fast ball,
        // few big bricks, 2 default levels. Cleared in seconds, not minutes.
        SimConfig {
            arena_w: 200,
            arena_h: 150,
            paddle_w: 44,
            paddle_h: 6,
            paddle_speed: 9 * FP / 2, // 4.5 u/tick
            ball_r: 3,
            ball_speed: 9 * FP / 2, // 4.5 u/tick = 270 u/s
            num_levels: 2,
            brick_gap: 2,
            top_margin: 14,
            lives: 3,
            timeout_ticks: TICK_HZ * 45, // 45 s ceiling
        }
    }
}

// --- Resources ---------------------------------------------------------------

#[derive(Resource, Clone, Copy)]
pub struct Cfg(pub SimConfig);

/// Deterministic integer PRNG (xorshift32), seeded from the server seed.
#[derive(Resource)]
pub struct Rng(pub u32);

impl Rng {
    fn next(&mut self) -> u32 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.0 = x;
        x
    }
}

#[derive(Resource, Clone, Copy)]
pub struct Status {
    pub phase: Phase,
    pub score: u32,
    pub tick: u32,
    pub lives: u32,
    pub bricks_left: u32,
}

/// The input applied for the current tick, set by the host before each `tick`.
#[derive(Resource, Default, Clone, Copy)]
pub struct PendingInput {
    pub dir: i32, // -1 left, 0 none, 1 right
    pub launch: bool,
}

/// Current 0-indexed level. The wall is cleared `num_levels` times to win; each
/// level re-sticks the ball so the player relaunches. Part of the replayed sim.
#[derive(Resource, Default, Clone, Copy)]
pub struct Level(pub u32);

// --- Components ---------------------------------------------------------------

/// Center position in subunits (origin top-left, y down).
#[derive(Component, Clone, Copy)]
pub struct Pos {
    pub x: i32,
    pub y: i32,
}

/// Axis-aligned half-extent in subunits.
#[derive(Component, Clone, Copy)]
pub struct Half {
    pub hx: i32,
    pub hy: i32,
}

#[derive(Component)]
pub struct Paddle;

#[derive(Component)]
pub struct Ball {
    pub vx: i32,
    pub vy: i32,
    pub stuck: bool,
}

#[derive(Component)]
pub struct Brick;

// --- World construction -------------------------------------------------------

fn paddle_y(cfg: &SimConfig) -> i32 {
    cfg.arena_h * FP - 10 * FP
}

/// A brick wall shape. Patterns keep early levels small (fast captcha) and add
/// visual variety without growing the brick count much.
#[derive(Clone, Copy)]
enum Pattern {
    Full,
    Checker,
    Pyramid,
    Diamond,
}

/// Level table: (cols, rows, pattern). Ordered easy -> hard; `num_levels` plays
/// the first N. Deterministic (no RNG), so live + replay build identical walls.
const LEVELS: [(i32, i32, Pattern); 5] = [
    (4, 2, Pattern::Full),     // 8 big bricks - very quick
    (5, 2, Pattern::Checker),  // ~5
    (5, 3, Pattern::Pyramid),  // ~
    (6, 3, Pattern::Diamond),  // ~
    (6, 4, Pattern::Checker),  // ~
];

fn brick_present(pat: Pattern, col: i32, row: i32, cols: i32, rows: i32) -> bool {
    match pat {
        Pattern::Full => true,
        Pattern::Checker => (col + row) % 2 == 0,
        Pattern::Pyramid => (col - cols / 2).abs() <= row,
        Pattern::Diamond => {
            (col - cols / 2).abs() + (row - rows / 2).abs() <= cols.max(rows) / 2
        }
    }
}

/// The brick (center, half-extent) list for a given level. Pure + deterministic.
fn level_brick_layout(cfg: &SimConfig, level: u32) -> Vec<(Pos, Half)> {
    let (cols, rows, pat) = LEVELS[(level as usize).min(LEVELS.len() - 1)];
    let usable_w = cfg.arena_w - (cols + 1) * cfg.brick_gap;
    let bw = usable_w / cols;
    let bh = 8;
    let mut out = Vec::new();
    for row in 0..rows {
        for col in 0..cols {
            if !brick_present(pat, col, row, cols, rows) {
                continue;
            }
            let x = cfg.brick_gap + col * (bw + cfg.brick_gap) + bw / 2;
            let y = cfg.top_margin + row * (bh + cfg.brick_gap) + bh / 2;
            out.push((Pos { x: x * FP, y: y * FP }, Half { hx: bw * FP / 2, hy: bh * FP / 2 }));
        }
    }
    out
}

/// Effective number of levels (config request clamped to the table).
pub fn level_count(cfg: &SimConfig) -> u32 {
    cfg.num_levels.clamp(1, LEVELS.len() as u32)
}

/// Build a fresh sim `World` with all entities + resources. Pure; no clock/IO.
pub fn build_world(cfg: SimConfig, seed: [u32; 4]) -> World {
    let mut world = World::new();
    spawn_sim(&mut world, cfg, seed);
    world
}

/// Spawn the sim entities + resources into an existing `World`. The live build
/// calls this on the Bevy `App`'s world so render entities live alongside the
/// sim; the headless build calls it on a fresh world. Same entities both ends.
pub fn spawn_sim(world: &mut World, cfg: SimConfig, seed: [u32; 4]) {
    let seed0 = seed[0] ^ seed[1].rotate_left(11) ^ seed[2].rotate_left(19) ^ seed[3];
    let seed0 = if seed0 == 0 { 0x9e3779b9 } else { seed0 };
    world.insert_resource(Cfg(cfg));
    world.insert_resource(Rng(seed0));

    // paddle
    let px = cfg.arena_w * FP / 2;
    world.spawn((
        Paddle,
        Pos { x: px, y: paddle_y(&cfg) },
        Half { hx: cfg.paddle_w * FP / 2, hy: cfg.paddle_h * FP / 2 },
    ));
    // ball (starts stuck atop the paddle)
    world.spawn((
        Ball { vx: 0, vy: 0, stuck: true },
        Pos { x: px, y: paddle_y(&cfg) - (cfg.paddle_h * FP / 2) - cfg.ball_r * FP },
        Half { hx: cfg.ball_r * FP, hy: cfg.ball_r * FP },
    ));
    // level 0 brick wall
    let layout = level_brick_layout(&cfg, 0);
    let bricks_left = layout.len() as u32;
    for (pos, half) in layout {
        world.spawn((Brick, pos, half));
    }
    world.insert_resource(Level(0));
    world.insert_resource(Status {
        phase: Phase::Playing,
        score: 0,
        tick: 0,
        lives: cfg.lives,
        bricks_left,
    });
    world.insert_resource(PendingInput::default());
}

// --- Systems (the ordered per-tick pipeline) ---------------------------------

fn sys_paddle(input: Res<PendingInput>, cfg: Res<Cfg>, mut q: Query<&mut Pos, With<Paddle>>) {
    let c = cfg.0;
    let half = c.paddle_w * FP / 2;
    for mut p in &mut q {
        p.x += input.dir.signum() * c.paddle_speed;
        p.x = p.x.clamp(half, c.arena_w * FP - half);
    }
}

fn sys_launch(
    input: Res<PendingInput>,
    cfg: Res<Cfg>,
    mut rng: ResMut<Rng>,
    paddles: Query<&Pos, With<Paddle>>,
    mut balls: Query<(&mut Ball, &mut Pos), Without<Paddle>>,
) {
    let c = cfg.0;
    let paddle = paddles.iter().next().copied();
    for (mut ball, mut pos) in &mut balls {
        if ball.stuck {
            if let Some(pp) = paddle {
                pos.x = pp.x;
                pos.y = paddle_y(&c) - (c.paddle_h * FP / 2) - c.ball_r * FP;
            }
            if input.launch {
                let dir = LAUNCH_DIRS[(rng.next() % LAUNCH_DIRS.len() as u32) as usize];
                let jitter = (rng.next() % 13) as i32 - 6; // -6..6 subunits
                ball.vx = (dir.0 + jitter) * c.ball_speed / 256;
                ball.vy = dir.1 * c.ball_speed / 256;
                ball.stuck = false;
            }
        }
    }
}

fn sys_ball_move(mut q: Query<(&mut Pos, &Ball)>) {
    for (mut pos, ball) in &mut q {
        if !ball.stuck {
            pos.x += ball.vx;
            pos.y += ball.vy;
        }
    }
}

fn sys_walls(
    cfg: Res<Cfg>,
    mut status: ResMut<Status>,
    mut q: Query<(&mut Pos, &mut Ball, &Half)>,
) {
    let c = cfg.0;
    let aw = c.arena_w * FP;
    let ah = c.arena_h * FP;
    for (mut pos, mut ball, half) in &mut q {
        if ball.stuck {
            continue;
        }
        if pos.x - half.hx < 0 {
            pos.x = half.hx;
            ball.vx = ball.vx.abs();
        } else if pos.x + half.hx > aw {
            pos.x = aw - half.hx;
            ball.vx = -ball.vx.abs();
        }
        if pos.y - half.hy < 0 {
            pos.y = half.hy;
            ball.vy = ball.vy.abs();
        }
        if pos.y - half.hy > ah {
            // fell past the bottom -> lose a life, re-stick
            if status.lives > 0 {
                status.lives -= 1;
            }
            ball.stuck = true;
            ball.vx = 0;
            ball.vy = 0;
        }
    }
}

fn aabb(a: &Pos, ah: &Half, b: &Pos, bh: &Half) -> bool {
    (a.x - b.x).abs() < ah.hx + bh.hx && (a.y - b.y).abs() < ah.hy + bh.hy
}

fn sys_paddle_bounce(
    cfg: Res<Cfg>,
    paddles: Query<(&Pos, &Half), With<Paddle>>,
    mut balls: Query<(&mut Pos, &mut Ball, &Half), Without<Paddle>>,
) {
    let c = cfg.0;
    let Some((pp, ph)) = paddles.iter().next() else { return };
    for (mut pos, mut ball, bh) in &mut balls {
        if ball.stuck || ball.vy <= 0 {
            continue;
        }
        if aabb(&pos, bh, pp, ph) {
            pos.y = pp.y - ph.hy - bh.hy;
            ball.vy = -ball.vy.abs();
            let offset = pos.x - pp.x;
            ball.vx += offset >> CONTROL_SHIFT;
            ball.vx = ball.vx.clamp(-c.ball_speed, c.ball_speed);
        }
    }
}

fn sys_bricks(
    mut commands: Commands,
    mut status: ResMut<Status>,
    mut balls: Query<(&mut Pos, &mut Ball, &Half)>,
    bricks: Query<(Entity, &Pos, &Half), (With<Brick>, Without<Ball>)>,
) {
    for (mut bpos, mut ball, bh) in &mut balls {
        if ball.stuck {
            continue;
        }
        for (ent, kp, kh) in &bricks {
            if !aabb(&bpos, bh, kp, kh) {
                continue;
            }
            // reflect along the axis of smaller penetration
            let pen_x = (bh.hx + kh.hx) - (bpos.x - kp.x).abs();
            let pen_y = (bh.hy + kh.hy) - (bpos.y - kp.y).abs();
            if pen_x < pen_y {
                ball.vx = if bpos.x < kp.x { -ball.vx.abs() } else { ball.vx.abs() };
                bpos.x += ball.vx.signum() * pen_x;
            } else {
                ball.vy = if bpos.y < kp.y { -ball.vy.abs() } else { ball.vy.abs() };
                bpos.y += ball.vy.signum() * pen_y;
            }
            commands.entity(ent).despawn();
            status.score += 100;
            status.bricks_left = status.bricks_left.saturating_sub(1);
            break; // at most one brick per tick keeps reflection unambiguous
        }
    }
}

/// When the wall is cleared and more levels remain, spawn the next wall and
/// re-stick the ball. The last cleared level falls through to `sys_state` -> Won.
fn sys_advance_level(
    mut commands: Commands,
    cfg: Res<Cfg>,
    mut level: ResMut<Level>,
    mut status: ResMut<Status>,
    mut balls: Query<(&mut Ball, &mut Pos)>,
) {
    let c = cfg.0;
    if status.bricks_left != 0 || status.phase != Phase::Playing {
        return;
    }
    if level.0 + 1 >= level_count(&c) {
        return; // last level cleared -> sys_state marks Won
    }
    level.0 += 1;
    let layout = level_brick_layout(&c, level.0);
    status.bricks_left = layout.len() as u32;
    for (pos, half) in layout {
        commands.spawn((Brick, pos, half));
    }
    // re-stick the ball; sys_launch re-pins it to the paddle next tick
    for (mut ball, mut pos) in &mut balls {
        ball.stuck = true;
        ball.vx = 0;
        ball.vy = 0;
        pos.x = c.arena_w * FP / 2;
        pos.y = paddle_y(&c) - (c.paddle_h * FP / 2) - c.ball_r * FP;
    }
}

fn sys_state(cfg: Res<Cfg>, mut status: ResMut<Status>) {
    let c = cfg.0;
    status.tick += 1;
    if status.bricks_left == 0 {
        status.phase = Phase::Won;
    } else if status.lives == 0 || status.tick >= c.timeout_ticks {
        status.phase = Phase::Lost;
    }
}

/// Build the ordered per-tick schedule. Same schedule both builds.
pub fn tick_schedule() -> Schedule {
    let mut s = Schedule::default();
    s.add_systems(
        (
            sys_paddle,
            sys_launch,
            sys_ball_move,
            sys_walls,
            sys_paddle_bounce,
            sys_bricks,
            sys_advance_level,
            sys_state,
        )
            .chain(),
    );
    s
}

/// Headless driver: owns the `World` + tick `Schedule`. The live build reuses the
/// same `build_world` + `tick_schedule`, driving it from a fixed-step accumulator.
pub struct Sim {
    pub world: World,
    schedule: Schedule,
}

impl Sim {
    pub fn new(cfg: SimConfig, seed: [u32; 4]) -> Self {
        Sim { world: build_world(cfg, seed), schedule: tick_schedule() }
    }

    pub fn tick(&mut self, dir: i32, launch: bool) {
        {
            let mut input = self.world.resource_mut::<PendingInput>();
            input.dir = dir;
            input.launch = launch;
        }
        self.schedule.run(&mut self.world);
    }

    pub fn status(&self) -> Status {
        *self.world.resource::<Status>()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Read ball x + stuck and paddle x from the world (a competent auto-player).
    fn read(sim: &mut Sim) -> (i32, bool, i32) {
        let mut bq = sim.world.query::<(&Pos, &Ball)>();
        let (bx, stuck) = bq.iter(&sim.world).next().map(|(p, b)| (p.x, b.stuck)).unwrap();
        let mut pq = sim.world.query_filtered::<&Pos, With<Paddle>>();
        let px = pq.iter(&sim.world).next().map(|p| p.x).unwrap();
        (bx, stuck, px)
    }

    // Auto-player: track the ball with the paddle, relaunch whenever stuck. Keeps
    // the ball alive so the seed-driven launch diverges into different outcomes.
    fn drive(seed: [u32; 4], ticks: u32) -> Status {
        let mut sim = Sim::new(SimConfig::default(), seed);
        for _ in 0..ticks {
            let (bx, stuck, px) = read(&mut sim);
            let dir = (bx - px).signum();
            sim.tick(dir, stuck);
            if sim.status().phase != Phase::Playing {
                break;
            }
        }
        sim.status()
    }

    #[test]
    fn deterministic_same_seed() {
        let s = [1u32, 2, 3, 4];
        let a = drive(s, 600);
        let b = drive(s, 600);
        assert_eq!(a.score, b.score);
        assert_eq!(a.tick, b.tick);
        assert_eq!(a.bricks_left, b.bricks_left);
        assert_eq!(a.phase, b.phase);
    }

    #[test]
    fn seed_changes_trajectory() {
        // Identical inputs under many seeds must produce a spread of outcomes:
        // the seed-bound launch makes a memorized trace fail under a fresh seed.
        // Key on (score, end-tick, lives) so trajectory divergence counts even when
        // the cleared-brick total happens to coincide.
        let mut outcomes = std::collections::HashSet::new();
        for s in 0..24u32 {
            let st = drive([s.wrapping_mul(2654435761), s + 1, s + 7, s + 13], 1200);
            outcomes.insert((st.score, st.tick, st.lives));
        }
        assert!(outcomes.len() > 4, "expected varied outcomes across seeds, got {}", outcomes.len());
    }

    #[test]
    fn ball_launches_and_breaks_bricks() {
        let s = drive([7, 7, 7, 7], 800);
        assert!(s.score > 0, "expected some bricks broken");
    }

    #[test]
    fn advances_through_levels() {
        // A competent tracker clears past level 0 into later walls (and usually wins
        // the default 2-level game inside the budget).
        let s = drive([42, 1, 2, 3], 6000);
        assert!(
            s.score >= 800 || s.phase == Phase::Won,
            "expected multi-level progress, got score {} phase {:?}",
            s.score,
            s.phase
        );
    }
}
