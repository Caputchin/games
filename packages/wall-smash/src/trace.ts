// Trace codec. The trace is the opaque blob the client records and the server's
// `run` replays. Format mirrors the headless decoder in headless.rs: a sequence
// of packed 5-byte records, each `[u32 tick LE][u8 code]`, where `code & 3` is the
// paddle direction that becomes current at `tick` (0 none, 1 left, 2 right) and
// `code & 4` is a one-shot launch at that tick. Only input CHANGES are recorded.

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

export function decodeTrace(blob: Uint8Array): InputRecord[] {
  const dv = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const out: InputRecord[] = [];
  const n = Math.floor(blob.byteLength / REC);
  for (let i = 0; i < n; i += 1) {
    const tick = dv.getUint32(i * REC, true);
    const code = dv.getUint8(i * REC + 4);
    const dir: Dir = (code & 3) === 1 ? -1 : (code & 3) === 2 ? 1 : 0;
    out.push({ tick, dir, launch: (code & 4) !== 0 });
  }
  return out;
}
