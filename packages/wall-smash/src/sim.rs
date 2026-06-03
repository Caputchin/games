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
    pub num_levels: u32, // walls to clear (in order) to win; capped to LEVEL_ROWS.len()
    pub brick_gap: i32,  // units between bricks
    pub top_margin: i32,
    pub lives: u32,
    pub timeout_ticks: u32,
}

impl SimConfig {
    /// Build from the host-resolved flat i32 array (config.ts emits this exact
    /// order for BOTH the live and headless builds, so the two agree). A
    /// non-positive field keeps the default. Order is the contract with config.ts.
    pub fn from_ints(f: &[i32]) -> Self {
        let d = SimConfig::default();
        let g = |i: usize, dv: i32| *f.get(i).filter(|v| **v > 0).unwrap_or(&dv);
        SimConfig {
            paddle_w: g(0, d.paddle_w),
            ball_speed: g(1, d.ball_speed),
            num_levels: g(2, d.num_levels as i32) as u32,
            lives: g(3, d.lives as i32) as u32,
            timeout_ticks: g(4, d.timeout_ticks as i32) as u32,
            ..d
        }
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
            num_levels: 1,
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
    /// Latches true the first tick the ball is launched (leaves the paddle). The
    /// countdown timer is FROZEN until this flips, so the clock starts when the
    /// player starts playing, not on mount. Pure sim state -> live + replay agree.
    pub started: bool,
    /// Ticks elapsed SINCE the first launch (0 while `!started`). The timeout is
    /// checked against this, so idling on the launch prompt never burns the budget.
    pub play_ticks: u32,
}

/// Live-only "play for fun" mode, switched on by the win screen's Keep-playing
/// button AFTER the captcha is already passed + submitted. While active the round
/// never wins (keeps spawning ever-harder walls), never times out, and never loses
/// a life (endless bonus play). The headless replay NEVER inserts this resource, so
/// every shared system reads it as `Option<Res<BonusMode>>` = None and the verified
/// captcha round is byte-identical to a fresh replay. Bonus play is never recorded.
#[derive(Resource, Default, Clone, Copy)]
pub struct BonusMode(pub bool);

fn bonus_on(b: &Option<Res<BonusMode>>) -> bool {
    b.as_ref().map(|r| r.0).unwrap_or(false)
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

/// Rows per level: `num_levels` plays the first N, and the row count paces difficulty
/// (early levels stay short for a fast captcha). The column count + pattern are SEEDED
/// per session in `level_brick_layout` so the wall varies between seeds while staying
/// deterministic given the seed (live + replay build the identical wall).
const LEVEL_ROWS: [i32; 5] = [2, 2, 3, 3, 4];

/// Row ceiling for bonus (live-only) levels: rows keep growing past the table but
/// stop here so the wall still clears the paddle with room for the ball to play.
/// (arena_h 150, ~10 units/row from top_margin 14 -> 8 rows ends well above paddle.)
const MAX_BONUS_ROWS: i32 = 8;

fn brick_present(pat: Pattern, col: i32, row: i32, cols: i32, rows: i32) -> bool {
    match pat {
        Pattern::Full => true,
        Pattern::Checker => (col + row) % 2 == 0,
        Pattern::Pyramid => (col - cols / 2).abs() <= row,
        Pattern::Diamond => (col - cols / 2).abs() + (row - rows / 2).abs() <= cols.max(rows) / 2,
    }
}

const PATTERNS: [Pattern; 4] = [
    Pattern::Full,
    Pattern::Checker,
    Pattern::Pyramid,
    Pattern::Diamond,
];

/// Layout PRNG seed, derived from the server seed but kept SEPARATE from the launch
/// PRNG stream. Seeding the wall means every session's starting board differs, so an
/// attacker can't pre-plan against a fixed layout (defense in depth on top of the
/// seed-bound launch). Live + replay derive it from the same seed, so they still
/// build the identical wall.
pub fn layout_seed_of(seed: [u32; 4]) -> u32 {
    let s = seed[0].rotate_left(5) ^ seed[1].rotate_left(17) ^ seed[2] ^ seed[3].rotate_left(27);
    if s == 0 { 0x85eb_ca6b } else { s }
}

fn brick_count(pat: Pattern, cols: i32, rows: i32) -> usize {
    (0..rows)
        .flat_map(|row| (0..cols).map(move |col| (col, row)))
        .filter(|&(col, row)| brick_present(pat, col, row, cols, rows))
        .count()
}

/// The brick (center, half-extent) list for a level. SEEDED per session: `lseed`
/// picks the column count (4..=6) + the pattern, so the wall differs between seeds;
/// the row count stays paced by LEVEL_ROWS so early levels stay short (a fast
/// captcha). Pure + deterministic given (cfg, level, lseed) -> live + replay agree.
fn level_brick_layout(cfg: &SimConfig, level: u32, lseed: u32) -> Vec<(Pos, Half)> {
    let lvl = level as usize;
    // Per-level seeded value (decorrelated across levels so each wall varies).
    let r = (lseed ^ level.wrapping_mul(0x9e37_79b9))
        .wrapping_mul(2654_435761)
        .rotate_left(level % 29 + 1);
    // Captcha levels follow the LEVEL_ROWS table (paced for a fast verify). Bonus
    // levels (live-only; level past the table, unreachable in headless because
    // `num_levels <= LEVEL_ROWS.len()`) keep escalating: one more row each level up
    // to a cap that still clears the paddle, and always-dense walls so they get
    // genuinely harder rather than repeating.
    let bonus = lvl >= LEVEL_ROWS.len();
    let rows = if bonus {
        // grow past the table's last row, capped at MAX_BONUS_ROWS (fits above paddle)
        (LEVEL_ROWS[LEVEL_ROWS.len() - 1] + (lvl - LEVEL_ROWS.len() + 1) as i32).min(MAX_BONUS_ROWS)
    } else {
        LEVEL_ROWS[lvl]
    };
    let cols = if bonus {
        5 + (r % 2) as i32
    } else {
        4 + (r % 3) as i32
    }; // bonus 5..=6, else 4..=6
    let mut pat = if bonus {
        // dense walls for bonus (Full / Checker only), so difficulty rises with rows
        if r & 1 == 0 {
            Pattern::Full
        } else {
            Pattern::Checker
        }
    } else {
        PATTERNS[((r >> 7) % 4) as usize]
    };
    // Never a near-empty wall: a too-sparse seeded pattern falls back to a Full wall,
    // so the round is always solvable regardless of seed.
    if brick_count(pat, cols, rows) < 3 {
        pat = Pattern::Full;
    }
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
            out.push((
                Pos {
                    x: x * FP,
                    y: y * FP,
                },
                Half {
                    hx: bw * FP / 2,
                    hy: bh * FP / 2,
                },
            ));
        }
    }
    out
}

/// Effective number of levels (config request clamped to the table).
pub fn level_count(cfg: &SimConfig) -> u32 {
    cfg.num_levels.clamp(1, LEVEL_ROWS.len() as u32)
}

/// Hard tick ceiling for a headless replay loop. The timeout is launch-relative now
/// (a pre-launch grace = the budget, then the play clock = the budget), so a replay
/// can run at most ~2x the budget before `sys_state` forces an outcome. Bound the
/// loop a hair above that so it always reaches the sim's own terminal state first.
pub fn replay_tick_cap(cfg: &SimConfig) -> u32 {
    cfg.timeout_ticks.saturating_mul(2).saturating_add(8)
}

/// Build a fresh sim `World` with all entities + resources. Pure; no clock/IO.
pub fn build_world(cfg: SimConfig, seed: [u32; 4]) -> World {
    let mut world = World::new();
    spawn_sim(&mut world, cfg, seed);
    world
}

/// The original server seed, kept so the live build can restart a round under the
/// SAME seed (a retry replays identically). Headless never restarts.
#[derive(Resource, Clone, Copy)]
pub struct SimSeed(pub [u32; 4]);

/// Mix the 4-word seed into the PRNG seed. Both spawn + restart use this so a retry
/// re-runs the identical seeded launch stream.
fn mix_seed(seed: [u32; 4]) -> u32 {
    let s = seed[0] ^ seed[1].rotate_left(11) ^ seed[2].rotate_left(19) ^ seed[3];
    if s == 0 { 0x9e3779b9 } else { s }
}

/// Spawn the sim entities + resources into an existing `World`. The live build
/// calls this on the Bevy `App`'s world so render entities live alongside the
/// sim; the headless build calls it on a fresh world. Same entities both ends.
pub fn spawn_sim(world: &mut World, cfg: SimConfig, seed: [u32; 4]) {
    let seed0 = mix_seed(seed);
    world.insert_resource(Cfg(cfg));
    world.insert_resource(SimSeed(seed));
    world.insert_resource(Rng(seed0));

    // paddle
    let px = cfg.arena_w * FP / 2;
    world.spawn((
        Paddle,
        Pos {
            x: px,
            y: paddle_y(&cfg),
        },
        Half {
            hx: cfg.paddle_w * FP / 2,
            hy: cfg.paddle_h * FP / 2,
        },
    ));
    // ball (starts stuck atop the paddle)
    world.spawn((
        Ball {
            vx: 0,
            vy: 0,
            stuck: true,
        },
        Pos {
            x: px,
            y: paddle_y(&cfg) - (cfg.paddle_h * FP / 2) - cfg.ball_r * FP,
        },
        Half {
            hx: cfg.ball_r * FP,
            hy: cfg.ball_r * FP,
        },
    ));
    // level 0 brick wall (seeded layout)
    let layout = level_brick_layout(&cfg, 0, layout_seed_of(seed));
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
        started: false,
        play_ticks: 0,
    });
    world.insert_resource(PendingInput::default());
}

/// Restart the round IN PLACE (live-only; the headless replay never calls this).
/// Keeps the paddle + ball entities (so their render visuals persist) and resets
/// their state; despawns + re-spawns the level-0 bricks (the brick-skinning system
/// re-skins fresh bricks); re-seeds the PRNG to the ORIGINAL seed so a retry plays
/// under the same seeded launch. Resets the sim resources.
pub fn reset_sim(world: &mut World) {
    let cfg = world.resource::<Cfg>().0;
    let seed = world.resource::<SimSeed>().0;
    let seed0 = mix_seed(seed);
    let px = cfg.arena_w * FP / 2;

    let bricks: Vec<Entity> = world
        .query_filtered::<Entity, With<Brick>>()
        .iter(world)
        .collect();
    for e in bricks {
        world.entity_mut(e).despawn();
    }
    {
        let mut q = world.query_filtered::<&mut Pos, With<Paddle>>();
        for mut p in q.iter_mut(world) {
            p.x = px;
            p.y = paddle_y(&cfg);
        }
    }
    {
        let mut q = world.query::<(&mut Ball, &mut Pos)>();
        for (mut ball, mut pos) in q.iter_mut(world) {
            ball.vx = 0;
            ball.vy = 0;
            ball.stuck = true;
            pos.x = px;
            pos.y = paddle_y(&cfg) - (cfg.paddle_h * FP / 2) - cfg.ball_r * FP;
        }
    }
    let layout = level_brick_layout(&cfg, 0, layout_seed_of(seed));
    let bricks_left = layout.len() as u32;
    for (pos, half) in layout {
        world.spawn((Brick, pos, half));
    }
    world.insert_resource(Rng(seed0));
    world.insert_resource(Level(0));
    world.insert_resource(Status {
        phase: Phase::Playing,
        score: 0,
        tick: 0,
        lives: cfg.lives,
        bricks_left,
        started: false,
        play_ticks: 0,
    });
    world.insert_resource(PendingInput::default());
}

/// Switch an already-passed round into endless bonus play (live-only; the headless
/// replay never calls this). Turns on `BonusMode`, drops the cleared wall, spawns the
/// next (harder) bonus wall, restores full lives, KEEPS the score, resets the play
/// clock, and re-sticks the ball. The captcha trace is already submitted; bonus play
/// is never recorded, so this can't touch the verified result.
pub fn enter_bonus(world: &mut World) {
    world.insert_resource(BonusMode(true));
    let cfg = world.resource::<Cfg>().0;
    let seed = world.resource::<SimSeed>().0;
    let next = world.resource::<Level>().0 + 1;

    let bricks: Vec<Entity> = world
        .query_filtered::<Entity, With<Brick>>()
        .iter(world)
        .collect();
    for e in bricks {
        world.entity_mut(e).despawn();
    }
    let layout = level_brick_layout(&cfg, next, layout_seed_of(seed));
    let n = layout.len() as u32;
    for (pos, half) in layout {
        world.spawn((Brick, pos, half));
    }
    world.insert_resource(Level(next));
    {
        let mut st = world.resource_mut::<Status>();
        st.phase = Phase::Playing;
        st.lives = cfg.lives;
        st.bricks_left = n;
        st.started = false;
        st.play_ticks = 0;
        // score carries over into bonus (it is the running fun score now)
    }
    let px = cfg.arena_w * FP / 2;
    let mut q = world.query::<(&mut Ball, &mut Pos)>();
    for (mut ball, mut pos) in q.iter_mut(world) {
        ball.vx = 0;
        ball.vy = 0;
        ball.stuck = true;
        pos.x = px;
        pos.y = paddle_y(&cfg) - (cfg.paddle_h * FP / 2) - cfg.ball_r * FP;
    }
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
    bonus: Option<Res<BonusMode>>,
    mut status: ResMut<Status>,
    mut q: Query<(&mut Pos, &mut Ball, &Half)>,
) {
    let c = cfg.0;
    let bonus = bonus_on(&bonus);
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
            // fell past the bottom -> lose a life, re-stick. Bonus play is endless,
            // so it never costs a life (live-only; headless never sets bonus).
            if !bonus && status.lives > 0 {
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
    let Some((pp, ph)) = paddles.iter().next() else {
        return;
    };
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

// Bevy system params are inherently complex query types; aliasing them would
// hurt readability more than the lint helps.
#[allow(clippy::type_complexity)]
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
                ball.vx = if bpos.x < kp.x {
                    -ball.vx.abs()
                } else {
                    ball.vx.abs()
                };
                bpos.x += ball.vx.signum() * pen_x;
            } else {
                ball.vy = if bpos.y < kp.y {
                    -ball.vy.abs()
                } else {
                    ball.vy.abs()
                };
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
    seed: Res<SimSeed>,
    bonus: Option<Res<BonusMode>>,
    mut level: ResMut<Level>,
    mut status: ResMut<Status>,
    mut balls: Query<(&mut Ball, &mut Pos)>,
) {
    let c = cfg.0;
    if status.bricks_left != 0 || status.phase != Phase::Playing {
        return;
    }
    // In bonus mode the round never wins: clearing the final captcha wall instead
    // advances into an ever-harder bonus wall, so play continues forever. Off bonus,
    // the last cleared level falls through to `sys_state` -> Won (the captcha pass).
    if !bonus_on(&bonus) && level.0 + 1 >= level_count(&c) {
        return; // last level cleared -> sys_state marks Won
    }
    level.0 += 1;
    let layout = level_brick_layout(&c, level.0, layout_seed_of(seed.0));
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

fn sys_state(
    cfg: Res<Cfg>,
    bonus: Option<Res<BonusMode>>,
    balls: Query<&Ball>,
    mut status: ResMut<Status>,
) {
    let c = cfg.0;
    let bonus = bonus_on(&bonus);
    status.tick += 1;
    // Latch `started` the first tick a ball is in flight, then count the play clock.
    // The countdown is frozen until launch (the timer starts when the player starts
    // playing) and stays continuous across levels thereafter.
    if !status.started && balls.iter().any(|b| !b.stuck) {
        status.started = true;
    }
    if status.started {
        status.play_ticks = status.play_ticks.saturating_add(1);
    }
    if status.bricks_left == 0 {
        status.phase = Phase::Won;
    } else if status.lives == 0 {
        status.phase = Phase::Lost;
    } else if !bonus {
        // Two timeout fences, both = the configured budget: a pre-launch grace
        // (idling on the prompt still bounds the replay) and the play clock once
        // launched. Bonus play is endless, so neither fence applies there.
        let timed_out = if status.started {
            status.play_ticks >= c.timeout_ticks
        } else {
            status.tick >= c.timeout_ticks
        };
        if timed_out {
            status.phase = Phase::Lost;
        }
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
        Sim {
            world: build_world(cfg, seed),
            schedule: tick_schedule(),
        }
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
        let (bx, stuck) = bq
            .iter(&sim.world)
            .next()
            .map(|(p, b)| (p.x, b.stuck))
            .unwrap();
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
        assert!(
            outcomes.len() > 4,
            "expected varied outcomes across seeds, got {}",
            outcomes.len()
        );
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

    #[test]
    fn seed_varies_the_starting_wall() {
        // The starting wall MUST vary by seed (no fixed board to pre-plan against)
        // AND be deterministic for a given seed (live + replay build the same wall).
        let wall = |seed: [u32; 4]| {
            let mut sim = Sim::new(SimConfig::default(), seed);
            let mut q = sim.world.query_filtered::<&Pos, With<Brick>>();
            let mut v: Vec<(i32, i32)> = q.iter(&sim.world).map(|p| (p.x, p.y)).collect();
            v.sort();
            v
        };
        // determinism: same seed -> identical wall (replay safety)
        assert_eq!(wall([5, 6, 7, 8]), wall([5, 6, 7, 8]));
        // variety + always-solvable across many seeds
        let mut distinct = std::collections::HashSet::new();
        for s in 0..24u32 {
            let w = wall([s.wrapping_mul(2654435761), s + 1, s + 9, s + 17]);
            assert!(
                w.len() >= 3,
                "seed {} gave a near-empty wall ({})",
                s,
                w.len()
            );
            distinct.insert(w);
        }
        assert!(
            distinct.len() > 4,
            "expected varied starting walls, got {}",
            distinct.len()
        );
    }

    #[test]
    fn reset_restores_a_fresh_round() {
        let cfg = SimConfig::default();
        let mut sim = Sim::new(cfg, [9, 9, 9, 9]);
        // play a while so score/tick/level/bricks all diverge from a fresh round
        for _ in 0..400 {
            let (bx, stuck, px) = read(&mut sim);
            sim.tick((bx - px).signum(), stuck);
            if sim.status().phase != Phase::Playing {
                break;
            }
        }
        assert!(sim.status().tick > 0);

        reset_sim(&mut sim.world);
        let st = sim.status();
        assert_eq!(st.tick, 0, "tick reset");
        assert_eq!(st.score, 0, "score reset");
        assert_eq!(st.lives, cfg.lives, "lives restored");
        assert_eq!(st.phase, Phase::Playing, "playing again");
        assert!(st.bricks_left > 0, "level-0 wall respawned");
        assert_eq!(sim.world.resource::<Level>().0, 0, "back to level 0");

        // a reset round replays identically to a fresh game under the same seed
        let fresh = drive([9, 9, 9, 9], 400);
        for _ in 0..400 {
            let (bx, stuck, px) = read(&mut sim);
            sim.tick((bx - px).signum(), stuck);
            if sim.status().phase != Phase::Playing {
                break;
            }
        }
        assert_eq!(
            sim.status().score,
            fresh.score,
            "reset == fresh under same seed"
        );
        assert_eq!(sim.status().tick, fresh.tick);
    }

    #[test]
    fn timer_frozen_until_launch() {
        // The play clock must not move while the ball is stuck on the paddle: the
        // timer starts when the player launches, not on mount. Idle (no launch) for
        // a stretch shorter than the budget -> still Playing, clock at zero.
        let mut sim = Sim::new(SimConfig::default(), [3, 1, 4, 1]);
        for _ in 0..300 {
            sim.tick(0, false); // move nowhere, never launch
        }
        let st = sim.status();
        assert!(!st.started, "must not be 'started' before any launch");
        assert_eq!(st.play_ticks, 0, "play clock frozen pre-launch");
        assert_eq!(
            st.phase,
            Phase::Playing,
            "idle pre-launch is not a loss yet"
        );
        assert_eq!(st.score, 0);
        // launch -> the clock starts ticking from this point.
        sim.tick(0, true);
        for _ in 0..30 {
            sim.tick(0, false);
        }
        let st = sim.status();
        assert!(st.started, "launching starts the clock");
        assert!(
            st.play_ticks > 0 && st.play_ticks <= 31,
            "play clock counts post-launch"
        );
    }

    #[test]
    fn idle_on_prompt_loses_at_the_budget() {
        // Never launching still terminates the round at the budget (the pre-launch
        // grace bounds the replay), and the loop cap is comfortably above that.
        let cfg = SimConfig {
            timeout_ticks: 120, // 2s budget for a fast test
            ..SimConfig::default()
        };
        let mut sim = Sim::new(cfg, [9, 8, 7, 6]);
        let mut ticks = 0u32;
        for _ in 0..replay_tick_cap(&cfg) {
            sim.tick(0, false); // never launch
            ticks += 1;
            if sim.status().phase != Phase::Playing {
                break;
            }
        }
        let st = sim.status();
        assert_eq!(st.phase, Phase::Lost, "idling past the budget loses");
        assert_eq!(st.play_ticks, 0, "clock never started (never launched)");
        assert!(
            ticks <= cfg.timeout_ticks + 1,
            "lost at ~budget, got {} vs {}",
            ticks,
            cfg.timeout_ticks
        );
    }

    #[test]
    fn bonus_mode_never_wins_and_escalates() {
        // With BonusMode on (live-only; the headless replay never inserts it), a
        // competent player who would normally WIN the captcha instead keeps getting
        // ever-harder walls: the round never reaches Won and the level climbs past
        // the captcha table. Lives never drain in bonus either.
        let seed = [42u32, 1, 2, 3];
        // baseline: the same seed/player WINS the captcha without bonus.
        let plain = drive(seed, 6000);
        assert_eq!(plain.phase, Phase::Won, "baseline captcha is winnable");

        let mut sim = Sim::new(SimConfig::default(), seed);
        sim.world.insert_resource(BonusMode(true));
        let start_lives = sim.status().lives;
        for _ in 0..6000 {
            let mut bq = sim.world.query::<(&Pos, &Ball)>();
            let (bx, stuck) = bq
                .iter(&sim.world)
                .next()
                .map(|(p, b)| (p.x, b.stuck))
                .unwrap();
            let mut pq = sim.world.query_filtered::<&Pos, With<Paddle>>();
            let px = pq.iter(&sim.world).next().map(|p| p.x).unwrap();
            sim.tick((bx - px).signum(), stuck);
            assert_ne!(sim.status().phase, Phase::Won, "bonus never wins");
        }
        let st = sim.status();
        assert_eq!(st.phase, Phase::Playing, "bonus keeps playing");
        assert_eq!(st.lives, start_lives, "bonus never costs a life");
        assert!(
            sim.world.resource::<Level>().0 + 1 > level_count(&SimConfig::default()),
            "bonus escalated past the captcha levels (level {})",
            sim.world.resource::<Level>().0
        );
    }
}
