//! Headless replay entry (default build, `bevy_ecs` only). The Caputchin replay
//! C-ABI (`cap_alloc` / `cap_run`) is emitted by `caputchin_replay!`; we only
//! supply the deterministic `run`. No wasm-bindgen, no Emscripten: this compiles
//! to a small, zero-import wasm the replay isolate loads precompiled.

use crate::codec;
use crate::sim::{Phase, Sim, SimConfig, TICK_HZ, replay_tick_cap};
use caputchin_replay_rs::{Verdict, caputchin_replay};

/// Replay a recorded round. `config` is the flat i32 array (host-resolved from the
/// opaque server config; decoded via `SimConfig::from_ints` so the live build
/// resolves identically). `trace` = packed 5-byte records `[u32 tick LE][u8 code]`,
/// where `code & 3` is the paddle direction (0 none, 1 left, 2 right) current at
/// `tick`, and `code & 4` is a one-shot launch at that tick.
fn run(seed: [u32; 4], config: &[i32], trace: &[u8]) -> Verdict {
    let cfg = if config.is_empty() {
        SimConfig::default()
    } else {
        SimConfig::from_ints(config)
    };

    let mut sim = Sim::new(cfg, seed);
    let mut cur_dir = 0i32;
    let mut idx = 0usize;
    let rec = trace.len() / codec::REC;

    for tick in 0..replay_tick_cap(&cfg) {
        let mut launch = false;
        // Apply every input record stamped for this tick (shared codec: the live
        // recorder writes with the same module, so encode + decode cannot diverge).
        while idx < rec && codec::record_tick(trace, idx) == tick {
            let (dir, launch_now) = codec::record_input(trace, idx);
            cur_dir = dir;
            if launch_now {
                launch = true;
            }
            idx += 1;
        }
        sim.tick(cur_dir, launch);
        if sim.status().phase != Phase::Playing {
            break;
        }
    }

    let st = sim.status();
    Verdict {
        passed: st.phase == Phase::Won,
        score: st.score as i32,
        duration_ms: (st.tick as i64 * 1000 / TICK_HZ as i64) as i32,
    }
}

caputchin_replay!(run);
