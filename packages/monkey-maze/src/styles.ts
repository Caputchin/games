// Scoped styles for the Monkey Maze shell. The melonJS canvas sits in .mm-board and
// flexes to fill; the HUD, overlay, and touch d-pad are DOM so they stay
// accessible and crisp at any scale. Fully responsive: the layout reflows on both
// axes, no fixed pixel stage.

export const STYLES = `
html, body {
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  /* Dark backstop: the widget iframe can be taller than the game content (it
     sits at the manifest preferred footprint). Without this the uncovered
     strip showed the iframe's white default below the board. */
  background: var(--mm-bg, #0b1026);
}
.mm-root {
  position: relative;
  display: flex;
  flex-direction: column;
  /* Fill the container. The widget's iframe srcdoc gives html/body/the mount div
     no height, so the game forces the chain definite: html+body get height:100%
     here and runMonkeyMaze sets container.style.height='100%'. With a definite
     chain, height:100% fills the iframe footprint, and the square board fits +
     centres in whatever space remains. */
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--mm-bg, #0b1026);
  color: var(--mm-fg, #f4f6ff);
  font-family: system-ui, sans-serif;
  -webkit-user-select: none;
  user-select: none;
  touch-action: none;
}
.mm-hud {
  flex: 0 0 auto;
  display: flex;
  gap: 0.75em;
  align-items: center;
  padding: 0.4em 0.7em;
  font-size: clamp(11px, 3.2vw, 15px);
  font-variant-numeric: tabular-nums;
  flex-wrap: wrap;
}
.mm-hud-goal { opacity: 0.75; }
.mm-badge {
  margin-inline-start: auto;
  color: #9bff8a;
  font-weight: 600;
}
.mm-badge[data-shown="false"] { visibility: hidden; }
.mm-mute {
  margin-inline-start: 0.4em;
  border: 0;
  background: transparent;
  color: var(--mm-fg, #fff);
  font-size: 1.15em;
  line-height: 1;
  padding: 0 0.15em;
  cursor: pointer;
  opacity: 0.8;
}
.mm-mute:hover { opacity: 1; }
.mm-mute:focus-visible {
  outline: 3px solid var(--mm-focus, #5bd1ff);
  outline-offset: 2px;
  border-radius: 4px;
}
.mm-board {
  position: relative;
  /* Fill ALL the space below the HUD, whatever its shape. The square canvas is
     then centred inside via object-fit, so it fits both axes (no crop in a wide
     iframe, no top-stuck in a tall one) and scales down when the space is small. */
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mm-board > * {
  width: 100% !important;
  height: 100% !important;
}
.mm-board canvas {
  display: block;
  width: 100% !important;
  height: 100% !important;
  /* Square backing letterboxed into the board area: largest centred square that
     fits both width and height, scaling up and down. */
  object-fit: contain;
}
.mm-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(6, 9, 24, 0.72);
  z-index: 3;
}
.mm-overlay[data-shown="false"] { display: none; }
.mm-card {
  display: flex;
  flex-direction: column;
  gap: 0.8em;
  align-items: center;
  padding: 1.2em 1.5em;
  border-radius: 12px;
  background: rgba(11, 16, 38, 0.95);
  text-align: center;
  max-width: 80%;
}
.mm-card-text { font-size: clamp(14px, 4vw, 18px); }
.mm-btn {
  font: inherit;
  font-weight: 600;
  padding: 0.55em 1.2em;
  border: 0;
  border-radius: 999px;
  background: var(--mm-btn-bg, #ffe34d);
  color: var(--mm-btn-text, #1a1a1a);
  cursor: pointer;
}
.mm-btn:focus-visible {
  outline: 3px solid var(--mm-focus, #5bd1ff);
  outline-offset: 2px;
}
`;
