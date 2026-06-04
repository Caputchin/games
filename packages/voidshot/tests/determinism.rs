//! The determinism gates. `live_equals_replay` is THE core invariant: a trace
//! recorded by stepping the live `LiveSim`, replayed through `replay()` (the same
//! code path `cap_run` uses), yields the identical verdict. Because the shipped
//! wasm is the same module both ends, this native test is sufficient evidence the
//! live play and server replay agree; cross-environment determinism is the
//! rapier3d enhanced-determinism guarantee, re-checked by replay-selfcheck.

use voidshot::config::SimConfig;
use voidshot::sim::{Input, Phase, Sim, TICK_HZ};
use voidshot::{codec, replay, LiveSim};

#[test]
fn enemies_snapshot_survives_kills() {
    // Reading the render snapshot must never index a killed enemy's removed body
    // (the live driver calls this every frame). Step well past several kills.
    let mut sim = Sim::new([3, 5, 7, 9], SimConfig::default());
    for _ in 0..600 {
        if sim.status().phase != Phase::Playing {
            break;
        }
        sim.step(Input::default());
        let _ = sim.enemies(); // must not panic on dead handles
        let _ = sim.player_pos();
    }
}

#[test]
fn deterministic_run_to_run() {
    let a = replay([1, 2, 3, 4], &[], &[]);
    let b = replay([1, 2, 3, 4], &[], &[]);
    assert_eq!(a, b, "same seed + trace must replay identically");
    // A distinct seed must also run cleanly (outcome may differ).
    let _ = replay([0xdead_beef, 0, 1, 0xffff_ffff], &[], &[]);
}

#[test]
fn live_equals_replay() {
    let seed = [7, 11, 13, 17];
    let mut ls = LiveSim::new(seed, SimConfig::default());

    // Scripted "live" input: orbit the cursor target around the arena.
    for t in 0..3600u32 {
        if ls.status().phase != Phase::Playing {
            break;
        }
        let a = t as f32 * 0.05;
        let qx = codec::quant(a.cos() * 5.0);
        let qz = codec::quant(a.sin() * 5.0);
        ls.step(qx, qz, false);
    }

    let live = ls.status();
    let trace = ls.trace().to_vec();

    let (passed, score, dur) = replay(seed, &[], &trace);
    assert_eq!(passed, live.phase == Phase::Won, "passed must agree");
    assert_eq!(score, live.score, "score must agree");
    assert_eq!(
        dur,
        (live.tick as i64 * 1000 / TICK_HZ) as i32,
        "duration must agree"
    );
    assert_ne!(
        live.phase,
        Phase::Playing,
        "round should resolve within the cap so the test is meaningful"
    );
}
