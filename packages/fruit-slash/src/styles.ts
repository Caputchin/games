// Scoped CSS for Fruit Slash, injected into the iframe document on first
// render. No external font fetches (CSP blocks them); system font stack.
//
// Rendering model: gameplay paints onto a single <canvas> that fills the
// stage. The canvas backing store is sized to the container (x dpr) and the
// scene is drawn through a world->device transform (game.ts), so 1 device
// pixel is crisp and the world (constants.WORLD_*) scales to fit. HUD +
// overlays are DOM layered on top: the canvas is opaque to DOM scrapers (a
// slice captcha's point), so only chrome (score, buttons) lives in the DOM and
// stays screen-reader accessible.
//
// Color model: the palette is the chosen skin applied as --fs-* custom
// properties by game.ts. Defaults below mirror the bundled `light` preset so
// the chrome still renders if ctx.skin is null.

export const STYLES = `
html, body, #cpt-root {
  width: 100%;
  height: 100%;
  margin: 0;
}

.fs-root {
  --fs-bg: #FBF7EF;
  --fs-fg: #3A3A38;
  --fs-button-bg: #3A3A38;
  --fs-button-text: #FBF7EF;
  --fs-button-hover: #222220;
  --fs-focus-ring: #3A3A38;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--fs-bg);
  color: var(--fs-fg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-tap-highlight-color: transparent;
  overflow: hidden;
}

.fs-stage {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  /* Query container so the HUD font + spacing track the rendered width (cqw),
     not a fixed px, so the top row never overflows on a narrow embed. */
  container-type: inline-size;
}

.fs-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
  cursor: crosshair;
}

.fs-hud {
  position: absolute;
  inset: 0 0 auto 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: clamp(6px, 1.6cqw, 12px) clamp(8px, 2cqw, 16px);
  font-size: clamp(11px, 2cqw, 16px);
  font-weight: 600;
  letter-spacing: 0.02em;
  pointer-events: none;
  color: var(--fs-fg);
}
.fs-hud .label {
  opacity: 0.7;
  margin-inline-end: clamp(3px, 0.8cqw, 6px);
  font-weight: 500;
}
.fs-hud-lives {
  display: inline-flex;
  gap: clamp(4px, 0.8cqw, 6px);
  align-items: center;
}
.fs-pip {
  width: clamp(9px, 1.6cqw, 13px);
  height: clamp(9px, 1.6cqw, 13px);
  border-radius: 50%;
  background: currentColor;
}
.fs-pip[data-spent="true"] { opacity: 0.22; }
.fs-badge {
  font-weight: 700;
  font-size: clamp(10px, 1.75cqw, 14px);
  letter-spacing: 0.03em;
  color: var(--fs-fg);
  opacity: 0.92;
}
[data-hidden="true"] { visibility: hidden; }

/* The overlay host stays UNpositioned so .fs-overlay (inset:0) resolves
   against the positioned stage and fills the iframe even when the embed's
   aspect ratio differs from the world's. */
.fs-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  text-align: center;
  padding: 20px;
  box-sizing: border-box;
  background: color-mix(in srgb, var(--fs-bg) 80%, transparent);
  backdrop-filter: blur(2px);
  overflow: auto;
}
.fs-title { margin: 0; font-size: 28px; font-weight: 700; }
.fs-line { margin: 0; font-size: 15px; max-width: 36ch; line-height: 1.45; opacity: 0.92; }
.fs-hint { margin: 4px 0 0; font-size: 13px; opacity: 0.65; }
.fs-buttons { display: flex; gap: 10px; margin-top: 8px; }

.fs-button {
  appearance: none;
  border: 0;
  border-radius: 9px;
  padding: 12px 26px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  background: var(--fs-button-bg);
  color: var(--fs-button-text);
}
.fs-button:hover { background: var(--fs-button-hover); }
.fs-button:focus-visible,
.fs-canvas:focus-visible {
  outline: 3px solid var(--fs-focus-ring);
  outline-offset: 2px;
}

.fs-sound {
  position: absolute;
  right: 12px;
  bottom: 12px;
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
  color: var(--fs-fg);
  background: color-mix(in srgb, var(--fs-bg) 70%, transparent);
}
.fs-sound svg { width: 22px; height: 22px; display: block; }
.fs-sound:hover { background: color-mix(in srgb, var(--fs-bg) 92%, transparent); }
.fs-sound:focus-visible {
  outline: 3px solid var(--fs-focus-ring);
  outline-offset: 2px;
}

.fs-announce {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

/* Responsive overlay chrome: as the available height shrinks (game.ts sets
   data-size on .fs-root from the stage height), progressively simplify the
   start / end screens so they never overflow a short embed. */
.fs-root[data-size="md"] .fs-overlay { gap: 8px; padding: 14px; }
.fs-root[data-size="md"] .fs-title { font-size: 22px; }
.fs-root[data-size="md"] .fs-overlay .fs-line { display: none; }

.fs-root[data-size="xs"] .fs-overlay { gap: 6px; padding: 8px; }
.fs-root[data-size="xs"] .fs-title { font-size: 17px; }
.fs-root[data-size="xs"] .fs-overlay .fs-line,
.fs-root[data-size="xs"] .fs-overlay .fs-hint { display: none; }
.fs-root[data-size="xs"] .fs-button { padding: 7px 15px; font-size: 14px; }
`;
