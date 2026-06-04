//! The deterministic Voidshot simulation. THIS is what the server re-runs over the
//! recorded trace, so it must be reproducible bit-for-bit. Randomness comes only
//! from the seed (`Rng`); time is a fixed tick; physics is rapier3d with the
//! enhanced-determinism feature (cross-platform bit-exact on IEEE-754). The SAME
//! compiled wasm runs live (browser) and replay (isolate), so all floats agree by
//! construction.
//!
//! A top-down arena survival shooter: the player drone (kinematic) is piloted
//! toward the cursor target; enemy drones (dynamic rapier bodies) seek the player
//! and jostle each other; auto-aim destroys the nearest enemy in range on a
//! cooldown. Clear all seeded waves to win; lose if the shield is depleted.

use crate::config::SimConfig;
use crate::rng::Rng;
use rapier3d::na::Vector3;
use rapier3d::prelude::*;

pub const TICK_HZ: i64 = 60;

const ARENA_R: f32 = 10.0;
const RIM_R: f32 = 9.4;
const PLAYER_R: f32 = 0.5;
const ENEMY_R: f32 = 0.45;
const PLAYER_SPEED: f32 = 7.0; // units/sec
const FIRE_COOLDOWN: u32 = 6; // ticks between auto-shots
const FIRE_RANGE: f32 = 13.0;
const CONTACT_R: f32 = PLAYER_R + ENEMY_R + 0.06;
const HIT_INVULN: u32 = 30; // ticks of shield invulnerability after a hit
const KILL_SCORE: i32 = 100;

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
    pub pulse: bool,
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
    tick: u32,
    phase: Phase,
    score: i32,
    shield: i32,
    fire_cd: u32,
    hit_cd: u32,
    spawned_waves: u32,
}

impl Sim {
    pub fn new(seed: [u32; 4], cfg: SimConfig) -> Self {
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
            tick: 0,
            phase: Phase::Playing,
            score: 0,
            shield,
            fire_cd: 0,
            hit_cd: 0,
            spawned_waves: 0,
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

    /// (x, z, kind, alive=true) for each LIVING enemy, for the renderer. Dead
    /// enemies have had their rapier body removed, so we must not index them.
    pub fn enemies(&self) -> Vec<(f32, f32, u8, bool)> {
        self.enemies
            .iter()
            .filter(|e| e.alive)
            .map(|e| {
                let t = self.bodies[e.handle].translation();
                (t.x, t.z, e.kind as u8, true)
            })
            .collect()
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
        self.shoot();
        self.contact();
        self.check_end();

        self.tick += 1;
        self.fire_cd = self.fire_cd.saturating_sub(1);
        self.hit_cd = self.hit_cd.saturating_sub(1);
    }

    fn maybe_spawn_wave(&mut self) {
        if self.spawned_waves >= self.cfg.wave_count || self.living_count() > 0 {
            return;
        }
        let w = self.spawned_waves;
        let count = self.cfg.enemies_per_wave + w;
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
        let mut dx = input.tx - px;
        let mut dz = input.tz - pz;
        let dist = (dx * dx + dz * dz).sqrt();
        let max_step = PLAYER_SPEED / TICK_HZ as f32;
        let (nx, nz) = if dist > max_step && dist > 1e-5 {
            dx /= dist;
            dz /= dist;
            (px + dx * max_step, pz + dz * max_step)
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

    /// Keep everything on the y=0 ground plane and inside the arena.
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

    fn shoot(&mut self) {
        if self.fire_cd > 0 {
            return;
        }
        let (px, pz) = self.player_pos();
        let mut best: Option<usize> = None;
        let mut best_d = FIRE_RANGE * FIRE_RANGE;
        for (i, e) in self.enemies.iter().enumerate() {
            if !e.alive {
                continue;
            }
            let t = self.bodies[e.handle].translation();
            let dx = t.x - px;
            let dz = t.z - pz;
            let d2 = dx * dx + dz * dz;
            if d2 < best_d {
                best_d = d2;
                best = Some(i);
            }
        }
        if let Some(i) = best {
            self.kill_enemy(i);
            self.score += KILL_SCORE;
            self.fire_cd = FIRE_COOLDOWN;
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
        } else if self.spawned_waves >= self.cfg.wave_count && self.living_count() == 0 {
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
