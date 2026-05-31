// Trace codec (TEST FIXTURE). The canonical wire format lives in Rust (`codec.rs`),
// shared by the live recorder (live.rs) and the headless replay (headless.rs). This
// TS encoder exists only so the vitest replay tests can build traces to feed the
// real headless wasm; the test feeds these bytes to that Rust decoder, which pins
// this fixture to the canonical format. Mirror of `codec.rs`: a sequence of packed
// 5-byte records, each `[u32 tick LE][u8 code]`, where `code & 3` is the paddle
// direction that becomes current at `tick` (0 none, 1 left, 2 right) and `code & 4`
// is a one-shot launch at that tick. Only input CHANGES are recorded.

export type Dir = -1 | 0 | 1;

export interface InputRecord {
  tick: number;
  dir: Dir;
  launch: boolean;
}

const REC = 5;

export function encodeTrace(records: InputRecord[]): Uint8Array {
  const buf = new Uint8Array(records.length * REC);
  const dv = new DataView(buf.buffer);
  records.forEach((r, i) => {
    dv.setUint32(i * REC, r.tick >>> 0, true);
    let code = r.dir === -1 ? 1 : r.dir === 1 ? 2 : 0;
    if (r.launch) code |= 4;
    dv.setUint8(i * REC + 4, code);
  });
  return buf;
}
