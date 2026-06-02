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
}

.dr-stage {
  position: absolute;
  inset: 0;
  /* Query container so the HUD font + spacing track the rendered width (cqw).
     The world is scaled by --dr-scale but the HUD lives in the unscaled stage,
     so a fixed px HUD reads oversized on a narrow embed; cqw scales it down. */
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
  top: clamp(3px, 1cqw, 6px);
  right: clamp(6px, 1.6cqw, 10px);
  display: flex;
  gap: clamp(7px, 2cqw, 12px);
  font-variant-numeric: tabular-nums;
  font-size: clamp(10px, 2.2cqw, 13px);
  font-weight: 600;
  letter-spacing: 1px;
  color: var(--dr-fg);
}

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
   inherits the foreground color via currentColor. */
.dr-sound {
  position: absolute;
  top: 5px;
  left: 8px;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--dr-fg);
  cursor: pointer;
  line-height: 0;
}
.dr-sound svg { display: block; width: 100%; height: 100%; }
.dr-sound:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--dr-focus-ring); border-radius: 3px; }

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

.dr-overlay-icon {
  width: 48px;
  height: 48px;
  color: var(--dr-fg);
}
.dr-overlay-icon svg { display: block; width: 100%; height: 100%; }

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
   height. Dino renders as a short, wide strip, so the start / game-over copy
   would overflow (and clip the title) at a small embed. As the height shrinks,
   progressively drop to the essentials: hide the flavor body + controls hint,
   shrink the title and button. The score line (.dr-line--score) is always kept
   so the game-over screen never loses the player's result. */
.dr-root[data-size="md"] .dr-overlay { gap: 6px; padding: 8px 10px; }
.dr-root[data-size="md"] .dr-title { font-size: 18px; }
.dr-root[data-size="md"] .dr-line:not(.dr-line--score) { display: none; }
.dr-root[data-size="md"] .dr-hint { display: none; }

.dr-root[data-size="xs"] .dr-overlay { gap: 4px; padding: 6px 8px; }
.dr-root[data-size="xs"] .dr-title { font-size: 15px; letter-spacing: 1px; }
.dr-root[data-size="xs"] .dr-line:not(.dr-line--score) { display: none; }
.dr-root[data-size="xs"] .dr-hint { display: none; }
.dr-root[data-size="xs"] .dr-button { padding: 6px 14px; font-size: 12px; }
.dr-root[data-size="xs"] .dr-button-icon { width: 16px; height: 16px; }

.dr-button-icon { width: 18px; height: 18px; }
.dr-button-icon svg { display: block; width: 100%; height: 100%; }

/* Touch controls live in the (unscaled) stage so the tap targets stay a
   comfortable finger size regardless of world scale. Only shown on coarse
   pointers; keyboard / mouse users never see them. */
.dr-touch {
  position: absolute;
  bottom: 10px;
  left: 0;
  right: 0;
  display: none;
  justify-content: space-between;
  padding: 0 12px;
  pointer-events: none;
}

@media (hover: none) and (pointer: coarse) {
  .dr-touch[data-active="true"] { display: flex; }
}

.dr-touch-button {
  appearance: none;
  pointer-events: auto;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 2px solid var(--dr-button-secondary-border);
  background: transparent;
  color: var(--dr-button-secondary-text);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;
  user-select: none;
}
.dr-touch-button:active { background: var(--dr-button-secondary-hover-bg); }

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
