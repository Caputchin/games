// Scoped CSS for Whack-a-Monkey, injected into the iframe document on first
// render. No external font fetches (CSP blocks them); system font stack.
//
// Rendering model: gameplay paints onto a single <canvas> that fills the stage.
// The holes, mounds, and moles are all drawn on the canvas through a
// world->device transform (game.ts), so the canvas is opaque to DOM scrapers (a
// captcha's point). Only chrome (score, level, buttons) lives in the DOM and
// stays screen-reader accessible.
//
// Color model: the palette is the chosen skin applied as --wm-* custom
// properties by game.ts. Defaults below mirror the bundled `light` preset so
// the chrome still renders if ctx.skin is null.

export const STYLES = `
html, body, #cpt-root {
  width: 100%;
  height: 100%;
  margin: 0;
}

.wm-root {
  --wm-bg: #357A2E;
  --wm-fg: #F2F7EC;
  --wm-button-bg: #1E471B;
  --wm-button-text: #F2F7EC;
  --wm-button-hover: #143312;
  --wm-focus-ring: #F2F7EC;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--wm-bg);
  color: var(--wm-fg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-tap-highlight-color: transparent;
  overflow: hidden;
}

.wm-stage {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  /* Query container so the HUD font + spacing track the rendered width (cqw),
     not a fixed px, so the top row never overflows on a narrow embed. */
  container-type: inline-size;
}

.wm-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
  cursor: pointer;
}

.wm-hud {
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
  color: var(--wm-fg);
}
.wm-hud .label {
  opacity: 0.7;
  margin-inline-end: clamp(3px, 0.8cqw, 6px);
  font-weight: 500;
}
.wm-hud-left { display: inline-flex; gap: clamp(6px, 2.2cqw, 18px); align-items: center; }
.wm-hud-right { display: inline-flex; gap: clamp(5px, 1.5cqw, 12px); align-items: center; }
.wm-hud-time[data-low="true"] { color: #FFD23F; }
.wm-badge {
  font-weight: 700;
  font-size: clamp(10px, 1.75cqw, 14px);
  letter-spacing: 0.03em;
  color: var(--wm-fg);
  opacity: 0.92;
}
[data-hidden="true"] { visibility: hidden; }

.wm-overlay {
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
  background: color-mix(in srgb, var(--wm-bg) 80%, transparent);
  backdrop-filter: blur(2px);
  overflow: auto;
}
.wm-title { margin: 0; font-size: 28px; font-weight: 700; }
.wm-line { margin: 0; font-size: 15px; max-width: 38ch; line-height: 1.45; opacity: 0.92; }
.wm-hint { margin: 4px 0 0; font-size: 13px; opacity: 0.65; }
.wm-buttons { display: flex; gap: 10px; margin-top: 8px; }

.wm-button {
  appearance: none;
  border: 0;
  border-radius: 9px;
  padding: 12px 26px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  background: var(--wm-button-bg);
  color: var(--wm-button-text);
}
.wm-button:hover { background: var(--wm-button-hover); }
.wm-button:focus-visible,
.wm-canvas:focus-visible {
  outline: 3px solid var(--wm-focus-ring);
  outline-offset: 2px;
}

.wm-sound {
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
  color: var(--wm-fg);
  background: color-mix(in srgb, var(--wm-bg) 70%, transparent);
}
.wm-sound svg { width: 22px; height: 22px; display: block; }
.wm-sound:hover { background: color-mix(in srgb, var(--wm-bg) 92%, transparent); }
.wm-sound:focus-visible {
  outline: 3px solid var(--wm-focus-ring);
  outline-offset: 2px;
}

.wm-announce {
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
   data-size on .wm-root from the stage height), progressively simplify the
   start / end screens so they never overflow a short embed. */
.wm-root[data-size="md"] .wm-overlay { gap: 8px; padding: 14px; }
.wm-root[data-size="md"] .wm-title { font-size: 22px; }
.wm-root[data-size="md"] .wm-overlay .wm-line { display: none; }

.wm-root[data-size="xs"] .wm-overlay { gap: 6px; padding: 8px; }
.wm-root[data-size="xs"] .wm-title { font-size: 17px; }
.wm-root[data-size="xs"] .wm-overlay .wm-line,
.wm-root[data-size="xs"] .wm-overlay .wm-hint { display: none; }
.wm-root[data-size="xs"] .wm-button { padding: 7px 15px; font-size: 14px; }
`;
