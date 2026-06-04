//! Trace wire format. Per-tick player input = quantized cursor target (x,z in
//! milliunits, i16) + a flags byte (bit0 = pulse). Records are delta-compressed:
//! one 9-byte record only when the input changes. The headless replay decodes the
//! exact records the live build wrote, so both step the sim over identical input.
//! Pinned by the round-trip test in `tests/` and the TS fixture `trace.ts`.

/// Bytes per record: u32 tick + i16 tx + i16 tz + u8 flags.
pub const REC: usize = 9;

pub const FLAG_PULSE: u8 = 1;

/// Quantize a world-unit coordinate to milliunits (i16), clamped to the i16 band.
pub fn quant(v: f32) -> i16 {
    let q = (v * 1000.0).round();
    if q > 32000.0 {
        32000
    } else if q < -32000.0 {
        -32000
    } else {
        q as i16
    }
}

/// Inverse of [`quant`].
pub fn dequant(q: i16) -> f32 {
    q as f32 / 1000.0
}

pub fn write_record(out: &mut Vec<u8>, tick: u32, tx: i16, tz: i16, flags: u8) {
    out.extend_from_slice(&tick.to_le_bytes());
    out.extend_from_slice(&tx.to_le_bytes());
    out.extend_from_slice(&tz.to_le_bytes());
    out.push(flags);
}

pub fn count(trace: &[u8]) -> usize {
    trace.len() / REC
}

pub fn rec_tick(trace: &[u8], i: usize) -> u32 {
    let b = i * REC;
    u32::from_le_bytes([trace[b], trace[b + 1], trace[b + 2], trace[b + 3]])
}

pub fn rec_input(trace: &[u8], i: usize) -> (i16, i16, u8) {
    let b = i * REC;
    (
        i16::from_le_bytes([trace[b + 4], trace[b + 5]]),
        i16::from_le_bytes([trace[b + 6], trace[b + 7]]),
        trace[b + 8],
    )
}
