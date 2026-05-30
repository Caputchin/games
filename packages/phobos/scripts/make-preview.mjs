// Dev tool: composite the 600x315 marketplace preview from a real engine frame
// (the hero graphic) + the "PHOBOS" wordmark + tagline, drawn with a 5x7 pixel
// font (no font/canvas deps). Run after building the node engine probe:
//   node scripts/make-preview.mjs <pl-node.js> preview.png
import zlib from 'node:zlib';
import { writeFileSync } from 'node:fs';

const W = 600, H = 315;
const PL = (await import(process.argv[2])).default;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- render a settled DOOM frame (seeded arena, demons present) ----
const M = await PL();
M.ccall('phobos_start', null, ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
  [0xC0FFEE01, 0xDEADBEEF, 0x12345678, 0x9ABCDEF0, 1, 6, 4, 0, 1]);
for (let i = 0; i < 55; i++) { M.ccall('phobos_frame', null, [], []); await sleep(22); }
const fw = M.ccall('phobos_width', 'number', [], []);
const fh = M.ccall('phobos_height', 'number', [], []);
const fp = M.ccall('phobos_fb', 'number', [], []);
const frame = M.HEAPU8.subarray(fp, fp + fw * fh * 4); // ARGB bytes B,G,R,A

// ---- canvas ----
const px = Buffer.alloc(W * H * 4);
const set = (x, y, r, g, b) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const o = (y * W + x) * 4; px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255;
};
const BG = [18, 14, 13];
for (let i = 0; i < W * H; i++) { px[i * 4] = BG[0]; px[i * 4 + 1] = BG[1]; px[i * 4 + 2] = BG[2]; px[i * 4 + 3] = 255; }

// Hero: scale the 3D view (top ~78% of the frame, above the status bar) to 600
// wide and place it across the top ~215px, fading into the dark band.
const heroH = 215, viewH = Math.floor(fh * 0.78);
for (let y = 0; y < heroH; y++) {
  const sy = Math.floor((y / heroH) * viewH);
  const fade = y > 150 ? Math.max(0, 1 - (y - 150) / (heroH - 150)) : 1;
  for (let x = 0; x < W; x++) {
    const sx = Math.floor((x / W) * fw);
    const s = (sy * fw + sx) * 4;
    const r = frame[s + 2], g = frame[s + 1], b = frame[s];
    set(x, y, (r * fade + BG[0] * (1 - fade)) | 0, (g * fade + BG[1] * (1 - fade)) | 0, (b * fade + BG[2] * (1 - fade)) | 0);
  }
}

// ---- 5x7 pixel font (uppercase + space) ----
const F = {
  A:[0x0E,0x11,0x11,0x1F,0x11,0x11,0x11],B:[0x1E,0x11,0x1E,0x11,0x11,0x11,0x1E],
  C:[0x0E,0x11,0x10,0x10,0x10,0x11,0x0E],D:[0x1C,0x12,0x11,0x11,0x11,0x12,0x1C],
  E:[0x1F,0x10,0x1E,0x10,0x10,0x10,0x1F],F:[0x1F,0x10,0x1E,0x10,0x10,0x10,0x10],
  G:[0x0E,0x11,0x10,0x17,0x11,0x11,0x0F],H:[0x11,0x11,0x1F,0x11,0x11,0x11,0x11],
  I:[0x1F,0x04,0x04,0x04,0x04,0x04,0x1F],J:[0x07,0x02,0x02,0x02,0x12,0x12,0x0C],
  K:[0x11,0x12,0x14,0x18,0x14,0x12,0x11],L:[0x10,0x10,0x10,0x10,0x10,0x10,0x1F],
  M:[0x11,0x1B,0x15,0x15,0x11,0x11,0x11],N:[0x11,0x19,0x15,0x13,0x11,0x11,0x11],
  O:[0x0E,0x11,0x11,0x11,0x11,0x11,0x0E],P:[0x1E,0x11,0x11,0x1E,0x10,0x10,0x10],
  Q:[0x0E,0x11,0x11,0x11,0x15,0x12,0x0D],R:[0x1E,0x11,0x11,0x1E,0x14,0x12,0x11],
  S:[0x0F,0x10,0x10,0x0E,0x01,0x01,0x1E],T:[0x1F,0x04,0x04,0x04,0x04,0x04,0x04],
  U:[0x11,0x11,0x11,0x11,0x11,0x11,0x0E],V:[0x11,0x11,0x11,0x11,0x11,0x0A,0x04],
  W:[0x11,0x11,0x11,0x15,0x15,0x1B,0x11],X:[0x11,0x11,0x0A,0x04,0x0A,0x11,0x11],
  Y:[0x11,0x11,0x0A,0x04,0x04,0x04,0x04],Z:[0x1F,0x01,0x02,0x04,0x08,0x10,0x1F],
  ' ':[0,0,0,0,0,0,0],
};
const textW = (s, sc) => s.length * 6 * sc - sc;
function draw(s, cx, y, sc, col) {
  let x = cx;
  for (const ch of s) {
    const g = F[ch] || F[' '];
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++)
      if (g[r] & (1 << (4 - c))) for (let dy = 0; dy < sc; dy++) for (let dx = 0; dx < sc; dx++)
        set(x + c * sc + dx, y + r * sc + dy, col[0], col[1], col[2]);
    x += 6 * sc;
  }
}
// drop-shadow + title + tagline
const title = 'PHOBOS', ts = 7, tw = textW(title, ts), tx = ((W - tw) / 2) | 0;
draw(title, tx + 2, 230, ts, [0, 0, 0]);
draw(title, tx, 228, ts, [196, 42, 38]);
const tag = 'CLEAR THE DEMONS TO VERIFY', gs = 2, gw = textW(tag, gs);
draw(tag, ((W - gw) / 2) | 0, 288, gs, [156, 150, 145]);

// ---- PNG encode (filter 0 rows + crc) ----
const T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = T[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (ty, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(ty), d]); const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(td)); return Buffer.concat([l, td, cc]); };
const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) { raw[y * (1 + W * 4)] = 0; px.copy(raw, y * (1 + W * 4) + 1, y * W * 4, (y + 1) * W * 4); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
writeFileSync(process.argv[3], Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`POSTER ${W}x${H} written`);
