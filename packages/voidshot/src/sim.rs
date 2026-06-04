//! The deterministic Voidshot simulation. THIS is what the server re-runs over the
//! recorded trace, so it must be reproducible bit-for-bit. Randomness comes only
//! from the seed (`Rng`); time is a fixed tick; physics is rapier3d with the
//! enhanced-determinism feature (cross-platform bit-exact on IEEE-754). The SAME
//! compiled wasm runs live (browser) and replay (isolate), so all floats agree by
//! construction.
//!
//! A 3D arena survival shooter with NO auto-aim. The player drone (kinematic) is
//! flown toward the cursor target and FACES the direction it is steering; it auto-
//! fires a stream of bolts straight forward (the facing direction). Enemy drones
//! (dynamic rapier bodies) home in and jostle each other; a bolt that intersects a
//! drone destroys it; a drone that touches the player costs a shield point.
//!
//! Skill, not auto-win: clearing the waves requires actively sweeping the nose
//! across the swarm while dodging, under a hard time cap. Passive input (the ship
//! sitting at center) lets the swarm converge and depletes the shield -> a loss.
//! A winning trace can only come from real play, which is the point of the captcha.

use crate::config::SimConfig;
use crate::rng::Rng;
use rapier3d::na::Vector3;
use rapier3d::prelude::*;

pub const TICK_HZ: i64 = 60;

const ARENA_R: f32 = 10.0;
const RIM_R: f32 = 9.4;
const PLAYER_R: f32 = 0.45;
const ENEMY_R: f32 = 0.5;
const PLAYER_SPEED: f32 = 8.5; // units/sec; faster than enemies so dodging works
const FIRE_COOLDOWN: u32 = 7; // ticks between bolts
const BOLT_SPEED: f32 = 24.0; // units/sec
const BOLT_RANGE: f32 = 15.0; // max travel before the bolt expires
const BOLT_R: f32 = 0.5; // bolt radius, added to ENEMY_R for the hit test
const CONTACT_R: f32 = PLAYER_R + ENEMY_R + 0.05;
const HIT_INVULN: u32 = 36; // ticks of shield invulnerability after a hit
const KILL_SCORE: i32 = 100;
const FACE_LERP: f32 = 0.3; // facing smoothing toward the steer direction, per tick
const FACE_DEADZONE: f32 = 0.05; // below this steer distance the facing is held
const SPLIT_CHILDREN: u32 = 2;
const SPLIT_SPREAD: f32 = 0.9; // child spawn offset from the dead splitter
const ENDLESS_CAP_PER_WAVE: u32 = 16; // cap concurrent drones in endless mode

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Phase {
    Playing,
    Won,
    Lost,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Chaser = 0,
    Weaver = 1,
    Splitter = 2,
}

#[derive(Clone, Copy, Default)]
pub struct Input {
    pub tx: f32,
    pub tz: f32,
    /// Fire the forward bolt stream this tick.
    pub fire: bool,
}

#[derive(Clone, Copy)]
pub struct Status {
    pub phase: Phase,
    pub score: i32,
    pub shield: i32,
    pub tick: u32,
    pub wave: u32,
}

struct Enemy {
    handle: RigidBodyHandle,
    kind: Kind,
    alive: bool,
    weave_phase: f32,
}

/// A player bolt: a forward-travelling point with a normalized direction and the
/// distance it has covered (for range expiry). Lightweight on purpose - the rapier
/// physics models the drone swarm; bolts are deterministic point/sphere tests.
#[derive(Clone, Copy)]
struct Bolt {
    x: f32,
    z: f32,
    dx: f32,
    dz: f32,
    dist: f32,
}

pub struct Sim {
    cfg: SimConfig,
    rng: Rng,
    bodies: RigidBodySet,
    colliders: ColliderSet,
    pipeline: PhysicsPipeline,
    islands: IslandManager,
    broad: DefaultBroadPhase,
    narrow: NarrowPhase,
    impulse_joints: ImpulseJointSet,
    multibody_joints: MultibodyJointSet,
    ccd: CCDSolver,
    ip: IntegrationParameters,
    gravity: Vector3<f32>,
    player: RigidBodyHandle,
    enemies: Vec<Enemy>,
    bolts: Vec<Bolt>,
    /// Death positions this draw window (x, z, kind), drained by the renderer for
    /// explosion VFX. Bounded by total kills per round (render-only).
    deaths: Vec<(f32, f32, u8)>,
    /// Player facing (unit vector); the bolt stream fires along this.
    fx: f32,
    fz: f32,
    tick: u32,
    phase: Phase,
    score: i32,
    shield: i32,
    fire_cd: u32,
    hit_cd: u32,
    spawned_waves: u32,
    /// Endless (post-verification) play: keep spawning escalating waves with no
    /// win and no time cap; ends only when the shield is depleted. Never used by
    /// the replay path (the captcha is always finite), so it has no verdict role.
    endless: bool,
}

impl Sim {
    pub fn new(seed: [u32; 4], cfg: SimConfig, endless: bool) -> Self {
        let mut bodies = RigidBodySet::new();
        let mut colliders = ColliderSet::new();

        // Player: kinematic, position-controlled toward the cursor each tick.
        let player = bodies.insert(
            RigidBodyBuilder::kinematic_position_based()
                .translation(Vector3::new(0.0, 0.0, 0.0))
                .build(),
        );
        colliders.insert_with_parent(
            ColliderBuilder::ball(PLAYER_R).build(),
            player,
            &mut bodies,
        );

        let shield = cfg.shield_hits;
        Sim {
            cfg,
            rng: Rng::new(seed),
            bodies,
            colliders,
            pipeline: PhysicsPipeline::new(),
            islands: IslandManager::new(),
            broad: DefaultBroadPhase::new(),
            narrow: NarrowPhase::new(),
            impulse_joints: ImpulseJointSet::new(),
            multibody_joints: MultibodyJointSet::new(),
            ccd: CCDSolver::new(),
            ip: IntegrationParameters::default(),
            gravity: Vector3::new(0.0, 0.0, 0.0),
            player,
            enemies: Vec::new(),
            bolts: Vec::new(),
            deaths: Vec::new(),
            fx: 0.0,
            fz: -1.0, // initial nose points "north" (away from the camera)
            tick: 0,
            phase: Phase::Playing,
            score: 0,
            shield,
            fire_cd: 0,
            hit_cd: 0,
            spawned_waves: 0,
            endless,
        }
    }

    pub fn tick_cap(&self) -> u32 {
        self.cfg.time_limit_ticks
    }

    pub fn status(&self) -> Status {
        Status {
            phase: self.phase,
            score: self.score,
            shield: self.shield,
            tick: self.tick,
            wave: self.spawned_waves,
        }
    }

    pub fn player_pos(&self) -> (f32, f32) {
        let t = self.bodies[self.player].translation();
        (t.x, t.z)
    }

    /// Player facing unit vector (the bolt stream direction).
    pub fn player_facing(&self) -> (f32, f32) {
        (self.fx, self.fz)
    }

    /// (x, z, kind) for each LIVING enemy, for the renderer. Dead enemies have had
    /// their rapier body removed, so we must not index them.
    pub fn enemies(&self) -> Vec<(f32, f32, u8)> {
        self.enemies
            .iter()
            .filter(|e| e.alive)
            .map(|e| {
                let t = self.bodies[e.handle].translation();
                (t.x, t.z, e.kind as u8)
            })
            .collect()
    }

    /// (x, z, dx, dz) for each live bolt, for the renderer.
    pub fn bolts(&self) -> Vec<(f32, f32, f32, f32)> {
        self.bolts.iter().map(|b| (b.x, b.z, b.dx, b.dz)).collect()
    }

    /// Take and clear this window's death events (render-only explosion VFX).
    pub fn drain_deaths(&mut self) -> Vec<(f32, f32, u8)> {
        core::mem::take(&mut self.deaths)
    }

    fn living_count(&self) -> u32 {
        self.enemies.iter().filter(|e| e.alive).count() as u32
    }

    pub fn step(&mut self, input: Input) {
        if self.phase != Phase::Playing {
            return;
        }

        self.maybe_spawn_wave();
        self.move_player(input);
        self.enemy_ai();
        self.physics_step();
        self.clamp_to_plane();
        self.fire(input);
        self.step_bolts();
        self.contact();
        self.check_end();

        self.tick += 1;
        self.fire_cd = self.fire_cd.saturating_sub(1);
        self.hit_cd = self.hit_cd.saturating_sub(1);

        // Hard time cap: not clearing the waves in the budget is a loss. This makes
        // passive play (no real steering) a loss and bounds the live loop the same
        // way the config cap bounds the replay loop. Endless play has no cap - it
        // runs until the shield is gone (and never reaches the replay path).
        if !self.endless && self.phase == Phase::Playing && self.tick >= self.cfg.time_limit_ticks {
            self.phase = Phase::Lost;
        }
    }

    fn maybe_spawn_wave(&mut self) {
        if self.living_count() > 0 {
            return;
        }
        if !self.endless && self.spawned_waves >= self.cfg.wave_count {
            return;
        }
        let w = self.spawned_waves;
        let count = if self.endless {
            (self.cfg.enemies_per_wave + w).min(ENDLESS_CAP_PER_WAVE)
        } else {
            self.cfg.enemies_per_wave + w
        };
        for i in 0..count {
            let angle = self.rng.range(0.0, std::f32::consts::TAU);
            let r = RIM_R - self.rng.range(0.0, 0.6);
            let x = r * angle.cos();
            let z = r * angle.sin();
            let kind = match (i + w) % 3 {
                1 => Kind::Weaver,
                2 if w > 0 => Kind::Splitter,
                _ => Kind::Chaser,
            };
            self.spawn_enemy(x, z, kind);
        }
        self.spawned_waves += 1;
    }

    fn spawn_enemy(&mut self, x: f32, z: f32, kind: Kind) {
        let h = self.bodies.insert(
            RigidBodyBuilder::dynamic()
                .translation(Vector3::new(x, 0.0, z))
                .lock_rotations()
                .linear_damping(0.5)
                .build(),
        );
        self.colliders.insert_with_parent(
            ColliderBuilder::ball(ENEMY_R).build(),
            h,
            &mut self.bodies,
        );
        let weave_phase = self.rng.range(0.0, std::f32::consts::TAU);
        self.enemies.push(Enemy {
            handle: h,
            kind,
            alive: true,
            weave_phase,
        });
    }

    fn move_player(&mut self, input: Input) {
        let (px, pz) = self.player_pos();
        let dx = input.tx - px;
        let dz = input.tz - pz;
        let dist = (dx * dx + dz * dz).sqrt();

        // Facing eases toward the steer direction (held inside the deadzone). The
        // bolt stream fires along this, so aiming IS steering.
        if dist > FACE_DEADZONE {
            let tx = dx / dist;
            let tz = dz / dist;
            self.fx += (tx - self.fx) * FACE_LERP;
            self.fz += (tz - self.fz) * FACE_LERP;
            let fl = (self.fx * self.fx + self.fz * self.fz).sqrt();
            if fl > 1e-5 {
                self.fx /= fl;
                self.fz /= fl;
            }
        }

        let max_step = PLAYER_SPEED / TICK_HZ as f32;
        let (nx, nz) = if dist > max_step && dist > 1e-5 {
            (px + dx / dist * max_step, pz + dz / dist * max_step)
        } else {
            (input.tx, input.tz)
        };
        let (cx, cz) = clamp_to_arena(nx, nz, ARENA_R - PLAYER_R);
        self.bodies[self.player].set_next_kinematic_translation(Vector3::new(cx, 0.0, cz));
    }

    fn enemy_ai(&mut self) {
        let (px, pz) = self.player_pos();
        let speed = self.cfg.enemy_speed_milli as f32 / 1000.0;
        let t = self.tick as f32 / TICK_HZ as f32;
        for e in self.enemies.iter() {
            if !e.alive {
                continue;
            }
            let body = &mut self.bodies[e.handle];
            let pos = body.translation();
            let mut dx = px - pos.x;
            let mut dz = pz - pos.z;
            let d = (dx * dx + dz * dz).sqrt();
            if d > 1e-5 {
                dx /= d;
                dz /= d;
            }
            let (mut vx, mut vz) = (dx * speed, dz * speed);
            if e.kind == Kind::Weaver {
                // Add a perpendicular sine weave; deterministic (same wasm both ends).
                let wob = (t * 4.0 + e.weave_phase).sin() * speed * 0.6;
                vx += -dz * wob;
                vz += dx * wob;
            }
            body.set_linvel(Vector3::new(vx, 0.0, vz), true);
        }
    }

    fn physics_step(&mut self) {
        self.pipeline.step(
            &self.gravity,
            &self.ip,
            &mut self.islands,
            &mut self.broad,
            &mut self.narrow,
            &mut self.bodies,
            &mut self.colliders,
            &mut self.impulse_joints,
            &mut self.multibody_joints,
            &mut self.ccd,
            None,
            &(),
            &(),
        );
    }

    /// Keep every enemy on the y=0 ground plane and inside the arena.
    fn clamp_to_plane(&mut self) {
        let handles: Vec<RigidBodyHandle> =
            self.enemies.iter().filter(|e| e.alive).map(|e| e.handle).collect();
        for h in handles {
            let body = &mut self.bodies[h];
            let t = *body.translation();
            let (cx, cz) = clamp_to_arena(t.x, t.z, ARENA_R - ENEMY_R);
            body.set_translation(Vector3::new(cx, 0.0, cz), true);
            let v = *body.linvel();
            body.set_linvel(Vector3::new(v.x, 0.0, v.z), true);
        }
    }

    /// Emit a forward bolt along the facing direction on the fire cooldown.
    fn fire(&mut self, input: Input) {
        if !input.fire || self.fire_cd > 0 {
            return;
        }
        let fl = (self.fx * self.fx + self.fz * self.fz).sqrt();
        if fl < 1e-5 {
            return;
        }
        let (dx, dz) = (self.fx / fl, self.fz / fl);
        let (px, pz) = self.player_pos();
        self.bolts.push(Bolt {
            x: px + dx * PLAYER_R,
            z: pz + dz * PLAYER_R,
            dx,
            dz,
            dist: 0.0,
        });
        self.fire_cd = FIRE_COOLDOWN;
    }

    /// Advance bolts, resolve bolt->drone hits, and expire spent bolts. Iteration
    /// order is fixed (Vec order, swap_remove), so it is bit-identical both ends.
    fn step_bolts(&mut self) {
        let step = BOLT_SPEED / TICK_HZ as f32;
        let hit_r2 = (ENEMY_R + BOLT_R) * (ENEMY_R + BOLT_R);
        let mut i = 0;
        while i < self.bolts.len() {
            let b = &mut self.bolts[i];
            b.x += b.dx * step;
            b.z += b.dz * step;
            b.dist += step;
            let (bx, bz, bdist) = (b.x, b.z, b.dist);

            let mut hit: Option<usize> = None;
            for (ei, e) in self.enemies.iter().enumerate() {
                if !e.alive {
                    continue;
                }
                let t = self.bodies[e.handle].translation();
                let dx = t.x - bx;
                let dz = t.z - bz;
                if dx * dx + dz * dz < hit_r2 {
                    hit = Some(ei);
                    break;
                }
            }

            if let Some(ei) = hit {
                self.bolts.swap_remove(i);
                self.destroy_enemy(ei);
                continue; // a not-yet-stepped bolt is now at index i
            }
            if bdist > BOLT_RANGE
                || bx * bx + bz * bz > (ARENA_R + 1.0) * (ARENA_R + 1.0)
            {
                self.bolts.swap_remove(i);
                continue;
            }
            i += 1;
        }
    }

    /// Destroy an enemy hit by a bolt: score it, record the death for VFX, and (for
    /// a splitter) spawn its chaser children at fixed offsets.
    fn destroy_enemy(&mut self, ei: usize) {
        if !self.enemies[ei].alive {
            return;
        }
        let kind = self.enemies[ei].kind;
        let t = *self.bodies[self.enemies[ei].handle].translation();
        self.kill_enemy(ei);
        self.score += KILL_SCORE;
        self.deaths.push((t.x, t.z, kind as u8));
        if kind == Kind::Splitter {
            for k in 0..SPLIT_CHILDREN {
                let ang = std::f32::consts::PI * 2.0 * (k as f32) / (SPLIT_CHILDREN as f32);
                let ox = t.x + ang.cos() * SPLIT_SPREAD;
                let oz = t.z + ang.sin() * SPLIT_SPREAD;
                let (cx, cz) = clamp_to_arena(ox, oz, ARENA_R - ENEMY_R);
                self.spawn_enemy(cx, cz, Kind::Chaser);
            }
        }
    }

    fn kill_enemy(&mut self, i: usize) {
        if !self.enemies[i].alive {
            return;
        }
        self.enemies[i].alive = false;
        let h = self.enemies[i].handle;
        self.bodies.remove(
            h,
            &mut self.islands,
            &mut self.colliders,
            &mut self.impulse_joints,
            &mut self.multibody_joints,
            true,
        );
    }

    fn contact(&mut self) {
        if self.hit_cd > 0 {
            return;
        }
        let (px, pz) = self.player_pos();
        let c2 = CONTACT_R * CONTACT_R;
        let mut hit = false;
        for e in self.enemies.iter() {
            if !e.alive {
                continue;
            }
            let t = self.bodies[e.handle].translation();
            let dx = t.x - px;
            let dz = t.z - pz;
            if dx * dx + dz * dz < c2 {
                hit = true;
                break;
            }
        }
        if hit {
            self.shield -= 1;
            self.hit_cd = HIT_INVULN;
        }
    }

    fn check_end(&mut self) {
        if self.shield <= 0 {
            self.phase = Phase::Lost;
        } else if !self.endless && self.spawned_waves >= self.cfg.wave_count && self.living_count() == 0 {
            self.phase = Phase::Won;
        }
    }
}

fn clamp_to_arena(x: f32, z: f32, max_r: f32) -> (f32, f32) {
    let d = (x * x + z * z).sqrt();
    if d > max_r && d > 1e-5 {
        (x / d * max_r, z / d * max_r)
    } else {
        (x, z)
    }
}
