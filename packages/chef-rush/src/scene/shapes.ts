// Excalibur shape-graphic builders. The kitchen is drawn from Rectangle / Circle /
// Polygon / Line / Text (no gradients or sprites for the furniture), so a theme
// restyles it by colour. Helpers here compose the few shapes that are not a single
// primitive (rounded card, heart, gesture glyph, badge). All run live only (the
// headless replay never renders), so Math.* here is fine.

import * as ex from 'excalibur';

/** A rounded-rectangle Polygon (Excalibur's Rectangle has square corners). Centred on
 *  the graphic origin. */
export function roundedRect(
  w: number,
  h: number,
  r: number,
  opts: { color?: ex.Color; strokeColor?: ex.Color; lineWidth?: number } = {},
): ex.Polygon {
  const hw = w / 2;
  const hh = h / 2;
  const rr = Math.min(r, hw, hh);
  const seg = 4;
  const corners: Array<[number, number, number, number]> = [
    [hw - rr, -hh + rr, -Math.PI / 2, 0], // top-right
    [hw - rr, hh - rr, 0, Math.PI / 2], // bottom-right
    [-hw + rr, hh - rr, Math.PI / 2, Math.PI], // bottom-left
    [-hw + rr, -hh + rr, Math.PI, Math.PI * 1.5], // top-left
  ];
  const points: ex.Vector[] = [];
  for (const [cx, cy, a0, a1] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (a1 - a0) * (i / seg);
      points.push(ex.vec(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr));
    }
  }
  return new ex.Polygon({ points, color: opts.color, strokeColor: opts.strokeColor, lineWidth: opts.lineWidth });
}

/** A filled heart Polygon centred on the origin, roughly size x size. */
export function heart(size: number, color: ex.Color): ex.Polygon {
  const s = size;
  const pts: Array<[number, number]> = [
    [0, 0.95],
    [-0.6, 0.25],
    [-0.95, -0.2],
    [-0.78, -0.62],
    [-0.4, -0.7],
    [0, -0.38],
    [0.4, -0.7],
    [0.78, -0.62],
    [0.95, -0.2],
    [0.6, 0.25],
  ];
  return new ex.Polygon({ points: pts.map(([x, y]) => ex.vec(x * s, y * s)), color });
}

/** The motion glyph for a gesture, as a single bold Text cue: 0 chop (down), 1 stir
 *  (loop), 2 flip (up). `r` is the rough radius; the glyph renders at ~1.8x that. */
const GLYPH = ['↓', '↻', '↑']; // down arrow, clockwise loop, up arrow
export function gestureGlyph(kind: number, r: number, color: ex.Color): ex.Text {
  return new ex.Text({ text: GLYPH[kind] ?? '?', font: font(r * 1.8, color) });
}

/** A system-ui Font at a size / colour. ALWAYS left/top-aligned: Excalibur draws the
 *  text at the raster's origin, so centre/middle alignment pushes half the glyph run
 *  outside the bitmap and clips it. Centre text instead via the Actor's anchor
 *  (0.5 = centred, (0, 0.5) = left-aligned at the actor x). */
export function font(size: number, color: ex.Color, bold = true): ex.Font {
  return new ex.Font({
    family: 'system-ui, sans-serif',
    size,
    unit: ex.FontUnit.Px,
    color,
    bold,
    textAlign: ex.TextAlign.Left,
    baseAlign: ex.BaseAlign.Top,
  });
}
