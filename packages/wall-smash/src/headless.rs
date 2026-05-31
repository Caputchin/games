//! Headless replay entry (default build, `bevy_ecs` only). Exposes a tiny C-ABI
//! the JS `run` artifact marshals into: write the trace + config into linear
//! memory via `ws_alloc`, call `ws_run`, read the 3-int verdict back.
//!
//! No wasm-bindgen, no Emscripten: the spike showed this compiles to a ~249 KB,
//! zero-import wasm the replay isolate loads precompiled.

use crate::codec;
use crate::sim::{Phase, Sim, SimConfig, TICK_HZ};
use core::slice;

/// Allocate `len` bytes in wasm linear memory and hand the pointer to JS, which
/// fills it (trace bytes / config ints). Leaked: a replay runs exactly once.
#[unsafe(no_mangle)]
pub extern "C" fn ws_alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(len.max(1));
    let ptr = buf.as_mut_ptr();
    core::mem::forget(buf);
    ptr
}

/// Config is passed as a flat i32 array (host-resolved from the opaque, server
/// sourced config). Decoding lives in `SimConfig::from_ints` so the live build
/// resolves identically.
fn read_config(ptr: *const i32, len: usize) -> SimConfig {
    if ptr.is_null() || len == 0 {
        return SimConfig::default();
    }
    SimConfig::from_ints(unsafe { slice::from_raw_parts(ptr, len) })
}

/// Replay a recorded round. Trace = packed 5-byte records `[u32 tick LE][u8 code]`,
/// where `code & 3` is the paddle direction (0 none, 1 left, 2 right) that becomes
/// current at `tick`, and `code & 4` is a one-shot launch at that tick.
///
/// Returns a pointer to `[passed, score, durationMs]` (3 i32) in linear memory.
#[unsafe(no_mangle)]
pub extern "C" fn ws_run(
    s0: u32,
    s1: u32,
    s2: u32,
    s3: u32,
    trace_ptr: *const u8,
    trace_len: usize,
    cfg_ptr: *const i32,
    cfg_len: usize,
) -> *const i32 {
    let cfg = read_config(cfg_ptr, cfg_len);
    let trace: &[u8] = if trace_ptr.is_null() || trace_len == 0 {
        &[]
    } else {
        unsafe { slice::from_raw_parts(trace_ptr, trace_len) }
    };

    let mut sim = Sim::new(cfg, [s0, s1, s2, s3]);
    let mut cur_dir = 0i32;
    let mut idx = 0usize;
    let rec = trace.len() / codec::REC;

    for tick in 0..cfg.timeout_ticks {
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
    let verdict = Box::new([
        i32::from(st.phase == Phase::Won),
        st.score as i32,
        (st.tick as i64 * 1000 / TICK_HZ as i64) as i32,
    ]);
    Box::into_raw(verdict) as *const i32
}
