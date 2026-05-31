//! Trace wire format, shared by the live recorder (`live.rs`) and the headless
//! replay (`headless.rs`). Both ends call THESE functions, so the encoder and
//! decoder cannot drift apart (there is no second hand-rolled copy of the layout
//! to fall out of sync). The TS test fixture (`trace.ts`) mirrors this format and is
//! pinned to it by the vitest replay test (it feeds TS-encoded bytes to this very
//! decoder); the round-trip + byte-layout tests below pin the format itself.
//!
//! A trace is a sequence of packed records, each `[u32 tick LE][u8 code]`, where
//! `code & 3` is the paddle direction that becomes current at `tick` (0 none,
//! 1 left, 2 right) and `code & 4` is a one-shot launch at that tick. Only input
//! CHANGES are recorded; the decoder holds the last dir until the next record.

/// Bytes per input record.
pub const REC: usize = 5;

/// Pack a paddle direction (sign of `dir`) + one-shot launch into the code byte.
pub fn encode_code(dir: i32, launch: bool) -> u8 {
    let d: u8 = if dir < 0 {
        1
    } else if dir > 0 {
        2
    } else {
        0
    };
    d | if launch { 4 } else { 0 }
}

/// Inverse of [`encode_code`]: code byte -> (dir in {-1,0,1}, launch).
pub fn decode_code(code: u8) -> (i32, bool) {
    let dir = match code & 3 {
        1 => -1,
        2 => 1,
        _ => 0,
    };
    (dir, code & 4 != 0)
}

/// Append one record (tick + packed input) to a trace buffer. Used by the live
/// recorder.
pub fn write_record(out: &mut Vec<u8>, tick: u32, dir: i32, launch: bool) {
    out.extend_from_slice(&tick.to_le_bytes());
    out.push(encode_code(dir, launch));
}

/// Tick of record `i` in a packed trace. Caller guarantees `i < trace.len()/REC`.
pub fn record_tick(trace: &[u8], i: usize) -> u32 {
    let b = i * REC;
    u32::from_le_bytes([trace[b], trace[b + 1], trace[b + 2], trace[b + 3]])
}

/// (dir, launch) of record `i`. Caller guarantees `i < trace.len()/REC`.
pub fn record_input(trace: &[u8], i: usize) -> (i32, bool) {
    decode_code(trace[i * REC + 4])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn code_round_trips() {
        // Encode then decode is identity for every input the recorder can emit.
        for dir in [-5, -1, 0, 1, 9] {
            for launch in [false, true] {
                let (d, l) = decode_code(encode_code(dir, launch));
                assert_eq!((d, l), (dir.signum(), launch));
            }
        }
    }

    #[test]
    fn record_round_trips() {
        // write_record -> record_tick/record_input is identity, the exact path the
        // live recorder + headless replay take.
        let mut buf = Vec::new();
        write_record(&mut buf, 0, -1, true);
        write_record(&mut buf, 1234, 1, false);
        assert_eq!(buf.len(), 2 * REC);
        assert_eq!(record_tick(&buf, 0), 0);
        assert_eq!(record_input(&buf, 0), (-1, true));
        assert_eq!(record_tick(&buf, 1), 1234);
        assert_eq!(record_input(&buf, 1), (1, false));
    }

    #[test]
    fn wire_format_is_pinned() {
        // Pins the byte layout the TS fixture (trace.ts) + any external tooling
        // depend on. A deliberate format change must update this and both ends.
        assert_eq!(REC, 5);
        assert_eq!(encode_code(-1, false), 1);
        assert_eq!(encode_code(1, false), 2);
        assert_eq!(encode_code(0, true), 4);
        assert_eq!(encode_code(1, true), 6);
        let mut buf = Vec::new();
        write_record(&mut buf, 0x0403_0201, -1, true);
        assert_eq!(buf, [0x01, 0x02, 0x03, 0x04, 1 | 4]);
    }
}
