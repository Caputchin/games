// Scoped CSS for Dino Runner, injected into the iframe document on first
// render. No external font fetches (CSP blocks them); system font stack, with
// CJK locales extending it via the `--dr-cjk` custom property game.ts sets
// from the resolved locale (see fonts.ts).
//
// Rendering model: the game lives in a fixed 600x150 logical world
// (constants.ts). `.dr-world` is exactly that many px and is centered +
// uniformly scaled to fit the iframe via `--dr-scale` (computed in game.ts
// from the live stage rect). Every entity is positioned in raw world units,
// so physics never has to know the pixel size. This is what makes the game
// responsive without re-tuning anything.
//
// Color model: every sprite + the ground + the HUD text paint with
// `currentColor`, and `.dr-world`'s color is `--dr-fg`. The whole palette is
// the chosen skin (light or dark) and stays fixed for the session - there is
// no in-game day/night inversion; light and dark are separate skin presets the
// host selects (see caputchin.json skins.presets). The dark skin also gets a
// night sky (moon + stars) via `data-theme="dark"` on the root. Defaults below
// mirror the bundled `light` preset so the game still renders if `ctx.skin` is
// null.

import { WORLD_WIDTH, WORLD_HEIGHT, GROUND_LINE_HEIGHT } from './constants.js';

// Preferred / advertised footprint equals the logical world; the manifest's
// `preferred` block must match these (guarded by preferred-footprint.test.ts).
export const STAGE_WIDTH = WORLD_WIDTH;
export const STAGE_HEIGHT = WORLD_HEIGHT;

/** Overlay chrome bucket for a stage height, written to `.dr-root[data-size]`.
 *  Each bucket's start / game-over copy must fit its smallest height. The
 *  preferred 150px height is `md`, also on a phone (a full-width embed there
 *  is ~341x150). `sm` keeps the controls hint down to 130px; `xs` is a
 *  shorter strip (a pinned height, or the 600x150 frame scaled down to a 375
 *  viewport: 359x90): it moves the hint beside the button and tightens the rest. */
export type OverlaySize = 'lg' | 'md' | 'sm' | 'xs';

export function overlaySize(height: number): OverlaySize {
  if (height >= 220) return 'lg';
  if (height >= 150) return 'md';
  if (height >= 130) return 'sm';
  return 'xs';
}

export const STYLES = `
html, body, #cpt-root {
  width: 100%;
  height: 100%;
}

:host, .dr-root {
  /* Defaults mirror the bundled light skin preset. game.ts overwrites each
     one via style.setProperty when ctx.skin resolves. */
  --dr-bg: #F7F7F7;
  --dr-fg: #535353;
  --dr-button-bg: #535353;
  --dr-button-text: #F7F7F7;
  --dr-button-hover: #333333;
  --dr-button-secondary-text: #535353;
  --dr-button-secondary-border: #535353;
  --dr-button-secondary-hover-bg: #E2E2E2;
  --dr-focus-ring: #535353;
  --dr-scale: 1;
  /* CJK locales override this with native fonts (game.ts via fonts.ts);
     non-CJK locales keep the sans-serif tail so font-family stays valid. */
  --dr-cjk: sans-serif;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, var(--dr-cjk);
}

.dr-root {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--dr-bg);
  /* A held tap (e.g. holding jump) must not trigger native text selection or
     the long-press copy callout on touch, which steals the gesture mid-run.
     Inherits to all children (HUD, overlay copy). touch-action also drops the
     double-tap-zoom / 300ms delay on the play surface. */
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  touch-action: manipulation;
}

.dr-stage {
  position: absolute;
  inset: 0;
  /* Query container: the HUD's cqw font + spacing resolve against the stage's
     rendered width. The HUD is a child of .dr-world (game.ts), so --dr-scale
     scales it too; the clamp() bounds keep it legible on a narrow embed. The
     sound toggle and the overlay host sit here in the unscaled stage. */
  container-type: inline-size;
}

.dr-world {
  position: absolute;
  left: 50%;
  top: 50%;
  width: ${WORLD_WIDTH}px;
  height: ${WORLD_HEIGHT}px;
  transform: translate(-50%, -50%) scale(var(--dr-scale));
  transform-origin: center center;
  color: var(--dr-fg);
}

/* Generic positioned entity: game.ts/horizon.ts set width/height + a
   translate transform in world units. */
.dr-entity {
  position: absolute;
  left: 0;
  top: 0;
  will-change: transform;
}

.dr-entity svg {
  display: block;
  width: 100%;
  height: 100%;
}

.dr-ground-tile {
  position: absolute;
  left: 0;
  top: ${WORLD_HEIGHT - GROUND_LINE_HEIGHT}px;
  width: ${WORLD_WIDTH}px;
  height: ${GROUND_LINE_HEIGHT}px;
  will-change: transform;
}

.dr-cloud { opacity: 0.85; }

.dr-hud {
  position: absolute;
  /* Anchored to the corner; the old top/right offsets are now padding, so
     the text sits where it did and the backing reaches the world's edges
     (no gap for a sprite to show through beside the digits). */
  top: 0;
  right: 0;
  padding: clamp(3px, 1cqw, 6px) clamp(6px, 1.6cqw, 10px) 1px 4px;
  display: flex;
  gap: clamp(7px, 2cqw, 12px);
  font-variant-numeric: tabular-nums;
  font-size: clamp(10px, 2.2cqw, 13px);
  font-weight: 600;
  letter-spacing: 1px;
  color: var(--dr-fg);
  /* Skin-colored backing: clouds, stars and the moon drift through the HUD
     band and would otherwise sit on the score text. The feathered shadow
     fades sprites out at the inner edges instead of cutting them. */
  border-bottom-left-radius: 4px;
  background: var(--dr-bg);
  box-shadow: 0 0 4px 3px var(--dr-bg);
}

/* Nothing to show (score + best off, not verified yet): no backing, or the
   empty box would cut a hole in passing clouds. */
.dr-hud[data-hidden="true"] { display: none; }

.dr-hud .label {
  opacity: 0.6;
  margin-inline-end: clamp(2px, 0.6cqw, 4px);
  font-weight: 500;
}

.dr-hud-best[data-hidden="true"],
.dr-hud-score[data-hidden="true"] { display: none; }

/* "Verified" badge: shown in the HUD once the run clears the pass threshold. */
.dr-badge { font-weight: 700; letter-spacing: 1px; }
.dr-badge[data-hidden="true"] { display: none; }

/* In-game sound toggle, top-left (mirrors the HUD top-right). Icon-only,
   inherits the foreground color via currentColor. Same skin-colored,
   feathered backing as .dr-hud: stars, clouds and the moon drift through
   this corner and would otherwise sit on the icon. */
.dr-sound {
  position: absolute;
  top: 5px;
  left: 8px;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: var(--dr-bg);
  box-shadow: 0 0 4px 3px var(--dr-bg);
  color: var(--dr-fg);
  cursor: pointer;
  line-height: 0;
}
.dr-sound svg { display: block; width: 100%; height: 100%; }
/* Hover tints only the backing tile (the skin's button_secondary_hover_bg);
   the feather stays --dr-bg so the tile still blends into the sky. Gated on
   a hover-capable pointer so a tap on a phone does not leave it stuck tinted. */
@media (hover: hover) {
  .dr-sound:hover { background: var(--dr-button-secondary-hover-bg); }
}
.dr-sound:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--dr-focus-ring), 0 0 4px 3px var(--dr-bg); }

.dr-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
  padding: 10px;
  box-sizing: border-box;
  color: var(--dr-fg);
  /* The start / game-over screen sits over the live scene; a skin-colored
     scrim keeps its text legible (otherwise the ground line + sprites bleed
     through behind the copy, e.g. the controls hint reading like it's struck
     through by the ground). Solid fallback first for browsers without
     color-mix; the scrim leaves the scene faintly visible behind. */
  background: var(--dr-bg);
  background: color-mix(in srgb, var(--dr-bg) 90%, transparent);
}

.dr-overlay[data-hidden="true"] { display: none; }

.dr-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
}

.dr-line {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  max-width: 42ch;
}

.dr-line--score {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  letter-spacing: 1px;
}

.dr-hint {
  margin: 2px 0 0;
  font-size: 11px;
  opacity: 0.6;
}

.dr-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 4px;
}

.dr-button {
  appearance: none;
  border: 0;
  font: inherit;
  background: var(--dr-button-bg);
  color: var(--dr-button-text);
  padding: 8px 18px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.dr-button:hover { background: var(--dr-button-hover); }
.dr-button:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--dr-focus-ring); }

/* Responsive overlay chrome: game.ts sets data-size on .dr-root from the stage
   height (overlaySize above). Dino renders as a short, wide strip, so the
   start / game-over copy would overflow (and clip the title) at a small embed.
   As the height shrinks, SHRINK the copy (title, body, button, gaps) rather
   than dropping it, so the description stays visible at every size. At the
   smallest (xs) the start screen turns into a grid that puts the controls
   hint beside the Start button instead of under it: on touch it is the only
   "tap to jump" cue, so it is never hidden. The body line loses its 42ch cap
   below md so the longest locales (fr, de) wrap to two lines instead of
   three. The score line (.dr-line--score) is always kept so the game-over
   screen never loses the player's result. */
.dr-root[data-size="md"] .dr-overlay { gap: 6px; padding: 8px 10px; }
.dr-root[data-size="md"] .dr-title { font-size: 18px; }

.dr-root[data-size="sm"] .dr-overlay { gap: 4px; padding: 6px 8px; }
.dr-root[data-size="sm"] .dr-title { font-size: 15px; letter-spacing: 1px; }
.dr-root[data-size="sm"] .dr-line { font-size: 11px; line-height: 1.3; max-width: none; }
.dr-root[data-size="sm"] .dr-hint { font-size: 10px; }
.dr-root[data-size="sm"] .dr-button { padding: 6px 14px; font-size: 12px; }
.dr-root[data-size="sm"] .dr-button-icon { width: 16px; height: 16px; }

.dr-root[data-size="xs"] .dr-overlay { gap: 3px; padding: 4px 8px; }
.dr-root[data-size="xs"] .dr-title { font-size: 14px; line-height: 1.15; letter-spacing: 1px; }
.dr-root[data-size="xs"] .dr-line { font-size: 11px; line-height: 1.25; max-width: none; }
/* xs start screen: title and body span the row; Start and the hint sit side by
   side in the two middle columns, centered as a pair by the flexible outer ones. */
.dr-root[data-size="xs"] .dr-overlay--start {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto minmax(0, 1fr);
  align-content: center;
  align-items: center;
  column-gap: 8px;
}
.dr-root[data-size="xs"] .dr-overlay--start .dr-title,
.dr-root[data-size="xs"] .dr-overlay--start .dr-line {
  grid-column: 1 / -1;
  justify-self: center;
}
.dr-root[data-size="xs"] .dr-overlay--start .dr-buttons { grid-column: 2; }
.dr-root[data-size="xs"] .dr-overlay--start .dr-hint { grid-column: 3; }
.dr-root[data-size="xs"] .dr-hint { margin: 0; font-size: 10px; text-align: start; }
.dr-root[data-size="xs"] .dr-buttons { margin-top: 0; }
.dr-root[data-size="xs"] .dr-button { padding: 4px 12px; font-size: 12px; }
.dr-root[data-size="xs"] .dr-button-icon { width: 14px; height: 14px; }

.dr-button-icon { width: 18px; height: 18px; }
.dr-button-icon svg { display: block; width: 100%; height: 100%; }

.dr-announce {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  clip: rect(0 0 0 0);
  overflow: hidden;
}
`;
