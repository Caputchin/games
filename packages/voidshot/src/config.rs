//! Sim configuration, decoded from the opaque server-sourced i32 array. The SAME
//! array is fed to the live build (JS `configToInts`) and the replay
//! (`run.ts` -> replay-wasm -> cap_run), so live play and server replay run
//! identical parameters -> identical verdict. Order is the wire contract with
//! `config.ts::configToInts`.

#[derive(Clone, Copy)]
pub struct SimConfig {
    /// Number of seeded waves to clear to win.
    pub wave_count: u32,
    /// Base enemies per wave (wave `w` spawns `enemies_per_wave + w`).
    pub enemies_per_wave: u32,
    /// Enemy seek speed in units/sec * 1000 (milliunits).
    pub enemy_speed_milli: i32,
    /// Player shield hit points.
    pub shield_hits: i32,
    /// Hard tick cap; also bounds the replay loop -> bounds isolate cost.
    pub time_limit_ticks: u32,
    /// Minimum bolt accuracy (bolt-kills / bolts-fired) required for a win, in
    /// thousandths (e.g. 120 = 0.12). The aim-skill discriminator folded into the
    /// `Won` latch (rule U2): a win is only credited if the player actually aimed,
    /// taxing the blind 360-sprayer. A *gate-affecting* param, so it rides the
    /// server-signed config (rule F3), never the trace. Conservative by design -
    /// far below a genuine aimer (who lands 40-70%) so it never false-rejects a
    /// human; it is not a wall against an aimbot (perfect accuracy passes it - that
    /// is rule U6's job, not this one).
    pub min_accuracy_milli: i32,
}

impl Default for SimConfig {
    fn default() -> Self {
        SimConfig {
            wave_count: 2,
            enemies_per_wave: 5,
            enemy_speed_milli: 3500,
            shield_hits: 3,
            time_limit_ticks: 60 * 60, // 60s hard cap; a real round is ~10-15s
            min_accuracy_milli: 120,   // 12% - well below any genuine aimer
        }
    }
}

impl SimConfig {
    /// Decode the flat i32 array. Missing trailing entries keep the default.
    /// Order: [wave_count, enemies_per_wave, enemy_speed_milli, shield_hits,
    /// time_limit_ticks, min_accuracy_milli].
    pub fn from_ints(ints: &[i32]) -> Self {
        let d = SimConfig::default();
        let get = |i: usize, fallback: i32| -> i32 { ints.get(i).copied().unwrap_or(fallback) };
        SimConfig {
            wave_count: get(0, d.wave_count as i32).clamp(1, 6) as u32,
            enemies_per_wave: get(1, d.enemies_per_wave as i32).clamp(1, 40) as u32,
            enemy_speed_milli: get(2, d.enemy_speed_milli).clamp(500, 12_000),
            shield_hits: get(3, d.shield_hits).clamp(1, 9),
            time_limit_ticks: get(4, d.time_limit_ticks as i32).clamp(60, 60 * 120) as u32,
            min_accuracy_milli: get(5, d.min_accuracy_milli).clamp(0, 600),
        }
    }
}
