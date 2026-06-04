//! Voidshot: a Caputchin Lane-2 replay game on rapier3d.
//!
//! ONE clean wasm32-unknown-unknown cdylib (no wasm-bindgen, no imports) exposes
//! TWO C-ABI surfaces over the SAME deterministic `sim`:
//!   - replay (server isolate): `cap_alloc` / `cap_run`, emitted by
//!     `caputchin_replay!`, a one-shot replay over the recorded trace.
//!   - live (browser): `live_new` / `live_step` / `live_state` / `live_trace*` /
//!     `live_free`. The JS OGL driver steps the sim frame-by-frame, reads entity
//!     positions from linear memory to render, and records the input trace.
//! Because it is literally the same wasm both ends, every float agrees by
//! construction. The live exports are the extraction candidate for a future
//! `caputchin_live!` macro in `caputchin-replay-rs`.

pub mod codec;
pub mod config;
pub mod rng;
pub mod sim;

use crate::config::SimConfig;
use crate::sim::{Input, Phase, Sim, Status, TICK_HZ};

/// Decode one trace record's quantized input into the sim `Input`.
fn decode_input(qx: i16, qz: i16, flags: u8) -> Input {
    Input {
        tx: codec::dequant(qx),
        tz: codec::dequant(qz),
        fire: flags & codec::FLAG_FIRE != 0,
    }
}

// ----- Replay (headless, server isolate) -------------------------------------

/// Replay a round to a `(passed, score, duration_ms)` outcome. The headless
/// `cap_run` wraps this; tests call it directly to assert the live == replay
/// invariant. Bounded by the config tick cap so a malformed trace cannot loop
/// unboundedly in the isolate.
pub fn replay(seed: [u32; 4], config: &[i32], trace: &[u8]) -> (bool, i32, i32) {
    let cfg = if config.is_empty() {
        SimConfig::default()
    } else {
        SimConfig::from_ints(config)
    };
    let mut sim = Sim::new(seed, cfg, false); // replay is always the finite captcha
    let cap = sim.tick_cap();
    let n = codec::count(trace);
    let mut idx = 0usize;
    let mut cur = Input::default();

    for tick in 0..cap {
        // Apply every record at or before this tick (robust to a stray early record).
        while idx < n && codec::rec_tick(trace, idx) <= tick {
            let (qx, qz, fl) = codec::rec_input(trace, idx);
            cur = decode_input(qx, qz, fl);
            idx += 1;
        }
        sim.step(cur);
        if sim.status().phase != Phase::Playing {
            break;
        }
    }

    let st = sim.status();
    (
        st.phase == Phase::Won,
        st.score,
        (st.tick as i64 * 1000 / TICK_HZ) as i32,
    )
}

mod headless {
    use caputchin_replay_rs::{caputchin_replay, Verdict};

    fn run(seed: [u32; 4], config: &[i32], trace: &[u8]) -> Verdict {
        let (passed, score, duration_ms) = crate::replay(seed, config, trace);
        Verdict {
            passed,
            score,
            duration_ms,
        }
    }

    caputchin_replay!(run);
}

// ----- Live (browser, driven by the JS OGL loop) -----------------------------

/// Persistent live-play handle: the sim, the growing input trace, and a reusable
/// state buffer the renderer reads each frame.
pub struct LiveSim {
    sim: Sim,
    trace: Vec<u8>,
    prev: Option<(i16, i16, u8)>,
    state_buf: Vec<i32>,
    /// Endless play records no trace (it is never submitted), so the input buffer
    /// can't grow unbounded over a long session.
    endless: bool,
}

/// State buffer header length (ints before the per-enemy triples).
const STATE_HEADER: usize = 12;

impl LiveSim {
    pub fn new(seed: [u32; 4], cfg: SimConfig, endless: bool) -> Self {
        LiveSim {
            sim: Sim::new(seed, cfg, endless),
            trace: Vec::new(),
            prev: None,
            state_buf: Vec::new(),
            endless,
        }
    }

    /// Advance one fixed tick with the current quantized input, recording the
    /// input into the trace on change so the recorded trace replays identically.
    pub fn step(&mut self, qx: i16, qz: i16, fire: bool) {
        let flags = if fire { codec::FLAG_FIRE } else { 0 };
        let cur = (qx, qz, flags);
        // Only the captcha round records a trace (the thing the server replays);
        // endless play submits nothing, so skip recording to bound memory.
        if !self.endless && self.prev != Some(cur) {
            let tick = self.sim.status().tick;
            codec::write_record(&mut self.trace, tick, qx, qz, flags);
            self.prev = Some(cur);
        }
        self.sim.step(decode_input(qx, qz, flags));
    }

    pub fn status(&self) -> Status {
        self.sim.status()
    }

    pub fn trace(&self) -> &[u8] {
        &self.trace
    }
}

/// Create a live session. `seed` is the four per-round words; `cfg_ptr`/`cfg_len`
/// is the i32 config the host wrote via `cap_alloc` (empty -> defaults). `endless`
/// non-zero starts post-verification endless play (no win, no cap, no trace).
///
/// # Safety
/// `cfg_ptr` must be null or point to `cfg_len` valid i32s.
#[no_mangle]
pub unsafe extern "C" fn live_new(
    s0: u32,
    s1: u32,
    s2: u32,
    s3: u32,
    cfg_ptr: *const i32,
    cfg_len: usize,
    endless: i32,
) -> *mut LiveSim {
    let cfg = if cfg_ptr.is_null() || cfg_len == 0 {
        SimConfig::default()
    } else {
        SimConfig::from_ints(unsafe { core::slice::from_raw_parts(cfg_ptr, cfg_len) })
    };
    Box::into_raw(Box::new(LiveSim::new([s0, s1, s2, s3], cfg, endless != 0)))
}

/// Advance one tick (quantized cursor target + fire bit).
///
/// # Safety
/// `ls` must be a live pointer from `live_new` not yet freed.
#[no_mangle]
pub unsafe extern "C" fn live_step(ls: *mut LiveSim, qx: i32, qz: i32, fire: i32) {
    let ls = unsafe { &mut *ls };
    ls.step(clamp_i16(qx), clamp_i16(qz), fire != 0);
}

/// Fill and return a pointer to the render state buffer (i32, little-endian in
/// linear memory). Layout:
///   [0] phase (0 playing, 1 won, 2 lost)  [1] score  [2] shield  [3] tick
///   [4] wave  [5] player_x_milli  [6] player_z_milli
///   [7] facing_x_milli  [8] facing_z_milli  (unit vector * 1000)
///   [9] enemy_count  [10] bolt_count  [11] death_count
///   then enemy_count triples:  kind, x_milli, z_milli
///   then bolt_count quads:     x_milli, z_milli, dirx_milli, dirz_milli
///   then death_count triples:  kind, x_milli, z_milli  (this window's kills, VFX)
/// Valid until the next `live_step`/`live_state` call.
///
/// # Safety
/// `ls` must be a live pointer from `live_new`.
#[no_mangle]
pub unsafe extern "C" fn live_state(ls: *mut LiveSim) -> *const i32 {
    let ls = unsafe { &mut *ls };
    let st = ls.sim.status();
    let (px, pz) = ls.sim.player_pos();
    let (fx, fz) = ls.sim.player_facing();
    let enemies = ls.sim.enemies();
    let bolts = ls.sim.bolts();
    let deaths = ls.sim.drain_deaths();

    let buf = &mut ls.state_buf;
    buf.clear();
    buf.reserve(STATE_HEADER + enemies.len() * 3 + bolts.len() * 4 + deaths.len() * 3);
    buf.push(match st.phase {
        Phase::Playing => 0,
        Phase::Won => 1,
        Phase::Lost => 2,
    });
    buf.push(st.score);
    buf.push(st.shield);
    buf.push(st.tick as i32);
    buf.push(st.wave as i32);
    buf.push(milli(px));
    buf.push(milli(pz));
    buf.push(milli(fx));
    buf.push(milli(fz));
    buf.push(enemies.len() as i32);
    buf.push(bolts.len() as i32);
    buf.push(deaths.len() as i32);
    for (x, z, kind) in enemies {
        buf.push(kind as i32);
        buf.push(milli(x));
        buf.push(milli(z));
    }
    for (x, z, dx, dz) in bolts {
        buf.push(milli(x));
        buf.push(milli(z));
        buf.push(milli(dx));
        buf.push(milli(dz));
    }
    for (x, z, kind) in deaths {
        buf.push(kind as i32);
        buf.push(milli(x));
        buf.push(milli(z));
    }
    buf.as_ptr()
}

/// Pointer to the recorded trace bytes (read once the round ends).
///
/// # Safety
/// `ls` must be a live pointer from `live_new`.
#[no_mangle]
pub unsafe extern "C" fn live_trace(ls: *mut LiveSim) -> *const u8 {
    unsafe { &*ls }.trace.as_ptr()
}

/// Length in bytes of the recorded trace.
///
/// # Safety
/// `ls` must be a live pointer from `live_new`.
#[no_mangle]
pub unsafe extern "C" fn live_trace_len(ls: *mut LiveSim) -> usize {
    unsafe { &*ls }.trace.len()
}

/// Free a live session.
///
/// # Safety
/// `ls` must be a live pointer from `live_new`, freed exactly once.
#[no_mangle]
pub unsafe extern "C" fn live_free(ls: *mut LiveSim) {
    if !ls.is_null() {
        drop(unsafe { Box::from_raw(ls) });
    }
}

fn milli(v: f32) -> i32 {
    (v * 1000.0) as i32
}

fn clamp_i16(v: i32) -> i16 {
    v.clamp(-32000, 32000) as i16
}
