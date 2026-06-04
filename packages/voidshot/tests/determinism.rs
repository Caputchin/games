//! The determinism gates. `live_equals_replay` is THE core invariant: a trace
//! recorded by stepping the live `LiveSim`, replayed through `replay()` (the same
//! code path `cap_run` uses), yields the identical verdict. Because the shipped
//! wasm is the same module both ends, this native test is sufficient evidence the
//! live play and server replay agree; cross-environment determinism is the
//! rapier3d enhanced-determinism guarantee, re-checked by replay-selfcheck.
//!
//! `empty_trace_loses` and `passive_input_loses` are the anti-auto-win gates: the
//! captcha is only meaningful if a winning trace requires real play, so doing
//! nothing must resolve to a loss.

use voidshot::config::SimConfig;
use voidshot::sim::{Input, Phase, Sim, TICK_HZ};
use voidshot::{codec, replay, LiveSim};

#[test]
fn enemies_snapshot_survives_kills() {
    // Reading the render snapshot must never index a killed enemy's removed body
    // (the live driver calls this every frame). Fire while stepping so bolts kill
    // and split enemies, then confirm the snapshots stay sound.
    let mut sim = Sim::new([3, 5, 7, 9], SimConfig::default(), false);
    for t in 0..900 {
        if sim.status().phase != Phase::Playing {
            break;
        }
        let a = t as f32 * 0.07;
        sim.step(Input {
            tx: a.cos() * 6.0,
            tz: a.sin() * 6.0,
            fire: true,
        });
        let _ = sim.enemies(); // must not panic on dead handles
        let _ = sim.bolts();
        let _ = sim.asteroids();
        let _ = sim.player_pos();
        let _ = sim.player_facing();
        let _ = sim.drain_deaths();
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
fn empty_trace_loses() {
    // The captcha invariant: an empty trace (a bot that submits nothing) is no
    // play at all and must NOT pass. The swarm converges on the idle ship.
    let (passed, _score, _dur) = replay([1, 2, 3, 4], &[], &[]);
    assert!(!passed, "an empty trace must never pass the captcha");
}

#[test]
fn passive_input_loses() {
    // Sitting at center, never firing, never steering: the shield depletes (and
    // the time cap would force a loss anyway). Auto-win must be impossible.
    let mut sim = Sim::new([2, 4, 6, 8], SimConfig::default(), false);
    for _ in 0..sim.tick_cap() {
        if sim.status().phase != Phase::Playing {
            break;
        }
        sim.step(Input::default());
    }
    assert_eq!(
        sim.status().phase,
        Phase::Lost,
        "passive play must resolve to a loss"
    );
}

#[test]
fn aimed_fire_destroys_drones_and_wins() {
    // The flip side of the anti-auto-win gate: real aiming MUST work. A script that
    // flies at the nearest drone while firing destroys the swarm and clears the
    // waves - proof the bolts hit and the captcha is solvable by genuine play.
    let mut sim = Sim::new([9, 8, 7, 6], SimConfig::default(), false);
    let mut first_kill_tick: Option<u32> = None;
    for _ in 0..sim.tick_cap() {
        if sim.status().phase != Phase::Playing {
            break;
        }
        let (px, pz) = sim.player_pos();
        let near = sim
            .enemies()
            .into_iter()
            .map(|(x, z, _)| (x, z, (x - px) * (x - px) + (z - pz) * (z - pz)))
            .min_by(|a, b| a.2.partial_cmp(&b.2).unwrap());
        let before = sim.status().score;
        let inp = match near {
            Some((x, z, _)) => Input { tx: x, tz: z, fire: true },
            None => Input { tx: px, tz: pz, fire: true },
        };
        sim.step(inp);
        if first_kill_tick.is_none() && sim.status().score > before {
            first_kill_tick = Some(sim.status().tick);
        }
    }
    assert!(first_kill_tick.is_some(), "aimed fire must destroy drones (bolts hit)");
    assert_eq!(
        sim.status().phase,
        Phase::Won,
        "focused aiming should clear the waves and win"
    );
    assert!(sim.status().score > 0, "kills must score");
}

#[test]
fn asteroids_drop_and_are_deterministic() {
    // Asteroids spawn on a seeded cadence (no input), so they are bit-identical
    // run-to-run; run in endless mode + aim so the ship survives long enough to
    // see at least one drop.
    let run = || {
        let mut sim = Sim::new([4, 4, 4, 4], SimConfig::default(), true);
        let mut saw = false;
        for _ in 0..480 {
            if sim.status().phase != Phase::Playing {
                break;
            }
            let (px, pz) = sim.player_pos();
            let near = sim
                .enemies()
                .into_iter()
                .map(|(x, z, _)| (x, z, (x - px) * (x - px) + (z - pz) * (z - pz)))
                .min_by(|a, b| a.2.partial_cmp(&b.2).unwrap());
            let inp = match near {
                Some((x, z, _)) => Input { tx: x, tz: z, fire: true },
                None => Input { tx: px, tz: pz, fire: true },
            };
            sim.step(inp);
            if !sim.asteroids().is_empty() {
                saw = true;
            }
        }
        (saw, sim.status().score)
    };
    let a = run();
    let b = run();
    assert!(a.0, "an asteroid should drop within ~8s");
    assert_eq!(a, b, "seeded asteroid spawns must be run-to-run identical");
}

#[test]
fn endless_never_wins() {
    // Endless (post-verification) play never reports Won - it ends only by shield
    // depletion (the time-cap loss is gated out in `step`; see the `!self.endless`
    // guard). Run well past the finite cap with aimed play and confirm no win.
    let cfg = SimConfig::default();
    let cap = cfg.time_limit_ticks;
    let mut sim = Sim::new([1, 1, 1, 1], cfg, true);
    let mut ticks = 0u32;
    while ticks < cap + 900 {
        if sim.status().phase != Phase::Playing {
            break;
        }
        let (px, pz) = sim.player_pos();
        let near = sim
            .enemies()
            .into_iter()
            .map(|(x, z, _)| (x, z, (x - px) * (x - px) + (z - pz) * (z - pz)))
            .min_by(|a, b| a.2.partial_cmp(&b.2).unwrap());
        let inp = match near {
            Some((x, z, _)) => Input { tx: x, tz: z, fire: true },
            None => Input { tx: px, tz: pz, fire: true },
        };
        sim.step(inp);
        ticks += 1;
    }
    assert_ne!(sim.status().phase, Phase::Won, "endless mode must never win");
}

#[test]
fn live_equals_replay() {
    let seed = [7, 11, 13, 17];
    let mut ls = LiveSim::new(seed, SimConfig::default(), false);

    // Scripted "live" play: sweep the cursor target around the arena while firing,
    // so the recorded trace exercises bolts, kills, splits, and contacts.
    for t in 0..3600u32 {
        if ls.status().phase != Phase::Playing {
            break;
        }
        let a = t as f32 * 0.05;
        let qx = codec::quant(a.cos() * 6.0);
        let qz = codec::quant(a.sin() * 6.0);
        ls.step(qx, qz, true);
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
