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

    // FP-safety of the bot-resistance gates: a player who aims only at real
    // (rendered) enemies must never trip the phantom lock, and must clear the
    // accuracy gate with comfortable margin (proving the 12% default never rejects
    // genuine aimed play).
    assert!(
        !sim.phantom_locked(),
        "aiming only at real enemies must never phantom-lock"
    );
    let (hits, shots) = sim.accuracy_stats();
    assert!(shots > 0, "aimed play fires bolts");
    assert!(
        hits * 1000 >= shots * 250,
        "aimed play accuracy {}/{} should clear the 12% floor with margin",
        hits,
        shots
    );
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
fn powerups_spawn_deterministically() {
    // Powerups spawn rarely on a seeded cadence (~12.5s); use a gentle config (slow
    // weak enemies, big shield) so the ship reliably survives to tick ~750 to see
    // one. Run-to-run identical (no input dependence on the spawn).
    let run = || {
        // [wave_count, enemies_per_wave, enemy_speed_milli, shield_hits, time_limit_ticks]
        let cfg = SimConfig::from_ints(&[2, 3, 1000, 9, 3600]);
        let mut sim = Sim::new([2, 7, 1, 9], cfg, true);
        let mut saw = false;
        for _ in 0..900 {
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
            if !sim.powerups().is_empty() {
                saw = true;
            }
        }
        (saw, sim.status().score)
    };
    let a = run();
    let b = run();
    assert!(a.0, "a powerup should spawn within ~15s");
    assert_eq!(a, b, "seeded powerup spawns must be run-to-run identical");
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
fn leaked_state_aimbot_locks_on_phantom() {
    // The honeypot (rule O2 mitigation). A leaked-state aimbot reads the entity
    // table - which mixes real enemies with render-omitted PHANTOMS - and aims at
    // the nearest entry. When a phantom is nearest it tracks an invisible target,
    // which the phantom-lock detector catches; the round must fail.
    let mut sim = Sim::new([42, 7, 99, 3], SimConfig::default(), false);
    for _ in 0..sim.tick_cap() {
        if sim.status().phase != Phase::Playing {
            break;
        }
        let (px, pz) = sim.player_pos();
        // Candidates = real enemies + leaked phantoms (the bot can't tell them
        // apart without re-deriving the per-session obfuscation).
        let mut best: Option<(f32, f32, f32)> = None;
        for (x, z, _) in sim.enemies() {
            let d = (x - px) * (x - px) + (z - pz) * (z - pz);
            if best.is_none_or(|b| d < b.2) {
                best = Some((x, z, d));
            }
        }
        for (x, z) in sim.phantoms() {
            let d = (x - px) * (x - px) + (z - pz) * (z - pz);
            if best.is_none_or(|b| d < b.2) {
                best = Some((x, z, d));
            }
        }
        let inp = match best {
            Some((x, z, _)) => Input { tx: x, tz: z, fire: true },
            None => Input { tx: px, tz: pz, fire: true },
        };
        sim.step(inp);
        if sim.phantom_locked() {
            break;
        }
    }
    assert!(
        sim.phantom_locked(),
        "a bot tracking the nearest leaked entity must lock onto a phantom"
    );
    assert_eq!(
        sim.status().phase,
        Phase::Lost,
        "a phantom lock must fail the round"
    );
}

#[test]
fn wave_gaps_stay_shorter_than_the_lock_window() {
    // FP-safety invariant behind the honeypot (pins QA finding F2). A human never
    // phantom-locks because a real enemy is in the isolation cone almost every
    // tick: waves respawn the instant the swarm clears, so the longest run of
    // consecutive Playing ticks with NO living real enemy is ~1, far under the
    // 48-tick (PHANTOM_LOCK_TICKS) streak a lock needs. Pin the wave-spawn timing
    // so a regression that delays a respawn cannot silently re-open the worst case.
    let mut sim = Sim::new([9, 8, 7, 6], SimConfig::default(), false);
    let mut empty_run = 0u32;
    let mut max_empty_run = 0u32;
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
        let inp = match near {
            Some((x, z, _)) => Input { tx: x, tz: z, fire: true },
            None => Input { tx: px, tz: pz, fire: true },
        };
        sim.step(inp);
        if sim.status().phase == Phase::Playing {
            if sim.enemies().is_empty() {
                empty_run += 1;
                max_empty_run = max_empty_run.max(empty_run);
            } else {
                empty_run = 0;
            }
        }
    }
    assert!(
        max_empty_run < 5,
        "longest no-real-enemy run was {max_empty_run} ticks; must stay far under the \
         48-tick phantom-lock window so a human can never accumulate a lock"
    );
}

#[test]
fn trace_is_seed_bound() {
    // Rule U3: a solve must bind to its seed. Record an aimed WINNING run on seed A
    // (writing the input trace exactly as LiveSim does), then replay that trace
    // under seed B: the swarm spawns at different seeded rim angles, so the seed-A
    // aim targets miss and the round no longer wins. "Solve once, replay forever"
    // is therefore not possible.
    let seed_a = [9u32, 8, 7, 6];
    let seed_b = [1u32, 2, 3, 4];
    let mut sim = Sim::new(seed_a, SimConfig::default(), false);
    let mut trace: Vec<u8> = Vec::new();
    let mut prev: Option<(i16, i16, u8)> = None;
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
        let (tx, tz) = near.map(|(x, z, _)| (x, z)).unwrap_or((px, pz));
        let (qx, qz) = (codec::quant(tx), codec::quant(tz));
        let cur = (qx, qz, codec::FLAG_FIRE);
        if prev != Some(cur) {
            codec::write_record(&mut trace, sim.status().tick, qx, qz, codec::FLAG_FIRE);
            prev = Some(cur);
        }
        sim.step(Input { tx, tz, fire: true });
    }
    assert_eq!(sim.status().phase, Phase::Won, "the aimed run wins on its own seed");
    assert!(replay(seed_a, &[], &trace).0, "the recorded trace wins on its own seed");
    assert!(
        !replay(seed_b, &[], &trace).0,
        "a trace solved for seed A must NOT win under seed B (rule U3)"
    );
}

#[test]
fn human_proxy_never_phantom_locks() {
    // FP-safety of the honeypot: a human aims at RENDERED enemies, so a real enemy
    // is in the facing cone and the isolation guard suppresses the lock. Proxy: aim
    // at the nearest real enemy with a wandering offset (sloppy human aim) across
    // several seeds; the lock must never latch on any of them.
    for seed in [[1u32, 2, 3, 4], [9, 8, 7, 6], [42, 7, 99, 3], [5, 5, 5, 5], [100, 200, 7, 9]] {
        let mut sim = Sim::new(seed, SimConfig::default(), false);
        for t in 0..sim.tick_cap() {
            if sim.status().phase != Phase::Playing {
                break;
            }
            let (px, pz) = sim.player_pos();
            let near = sim
                .enemies()
                .into_iter()
                .map(|(x, z, _)| (x, z, (x - px) * (x - px) + (z - pz) * (z - pz)))
                .min_by(|a, b| a.2.partial_cmp(&b.2).unwrap());
            // Sloppy aim: nearest real enemy + a deterministic wander (no RNG).
            let w = (t as f32 * 0.3).sin() * 0.6;
            let inp = match near {
                Some((x, z, _)) => Input { tx: x + w, tz: z - w, fire: true },
                None => Input { tx: px, tz: pz, fire: true },
            };
            sim.step(inp);
            assert!(
                !sim.phantom_locked(),
                "human-proxy (seed {seed:?}) must never phantom-lock at tick {t}"
            );
        }
    }
}

#[test]
fn accuracy_gate_is_the_win_discriminator() {
    // Rule U2: the win IS the guarded metric. A blind 360-sweep under a forgiving
    // config (1 wave, 3 slow drones, big shield) does clear the swarm by luck, but
    // only at ~12% accuracy. Flipping ONLY the accuracy floor flips the verdict
    // Won <-> Lost over byte-identical gameplay - proof the discriminator is folded
    // into the `Won` latch, not attached to a side score the verdict ignores.
    let sweep = |floor: i32| {
        // [wave_count, enemies_per_wave, enemy_speed_milli, shield_hits, time_limit_ticks, min_accuracy_milli]
        let cfg = SimConfig::from_ints(&[1, 3, 1000, 9, 5400, floor]);
        let mut sim = Sim::new([42, 7, 99, 3], cfg, false);
        let cap = sim.tick_cap();
        for t in 0..cap {
            if sim.status().phase != Phase::Playing {
                break;
            }
            let a = t as f32 * 0.05;
            sim.step(Input { tx: a.cos() * 6.0, tz: a.sin() * 6.0, fire: true });
        }
        (sim.status().phase, sim.accuracy_stats())
    };
    let (won_phase, won_stats) = sweep(100); // 10% floor
    let (lost_phase, lost_stats) = sweep(200); // 20% floor
    assert_eq!(
        won_stats, lost_stats,
        "the accuracy floor must not touch gameplay - only the verdict"
    );
    let (hits, shots) = won_stats;
    assert!(hits > 0 && shots > 0, "the sweep fired and landed some hits");
    assert_eq!(won_phase, Phase::Won, "the sweep clears the swarm at a 10% floor");
    assert_eq!(
        lost_phase,
        Phase::Lost,
        "the same clear is DENIED at a 20% floor (rule U2: pass is the guarded metric)"
    );
}

#[test]
fn live_state_round_trips_real_and_phantom() {
    // The per-session obfuscation (rule O2 mitigation, "layer 4") must be reversible
    // by the driver: decoding the exposed listing with the seed mask recovers EXACTLY
    // the real enemies (so the renderer is unchanged) and marks every phantom, so
    // none ever render.
    use voidshot::{obfuscated_entities, tag_mask, PHANTOM_CODE};
    let seed = [1u32, 2, 3, 4];
    let mask = tag_mask(seed[0], seed[1], seed[2], seed[3]);
    assert_ne!(mask, 0, "this seed must give a non-trivial mask to exercise the XOR");

    let mut sim = Sim::new(seed, SimConfig::default(), false);
    // Step until phantoms are present alongside real enemies.
    for _ in 0..200 {
        if sim.status().phase != Phase::Playing {
            break;
        }
        sim.step(Input { tx: 0.0, tz: 0.0, fire: false });
        if !sim.phantoms().is_empty() {
            break;
        }
    }
    let reals = sim.enemies();
    let phantoms = sim.phantoms();
    assert!(!phantoms.is_empty(), "a phantom should have spawned by ~3s");

    let entries = obfuscated_entities(&reals, &phantoms, mask);
    assert_eq!(entries.len(), reals.len() + phantoms.len());

    // Decode exactly as the driver does (un-XOR the tag, drop phantom-tagged rows).
    let mut decoded_real = 0usize;
    let mut decoded_phantom = 0usize;
    for [tag, _x, _z] in &entries {
        let decoded = tag ^ mask;
        if decoded == PHANTOM_CODE {
            decoded_phantom += 1;
        } else {
            assert!((0..=2).contains(&decoded), "real tag decodes to a valid kind");
            decoded_real += 1;
        }
    }
    assert_eq!(decoded_real, reals.len(), "every real enemy survives the round-trip");
    assert_eq!(decoded_phantom, phantoms.len(), "every phantom is marked + filterable");
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
