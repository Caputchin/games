// Scoped CSS for Leaf Memory. Injected into the iframe document on first
// render. No external font fetches (CSP blocks them); system font stack.
// CJK locales extend the stack via the `--lm-cjk` custom property, which
// game.ts sets from the resolved locale (see fonts.ts); non-CJK locales
// keep the bare `sans-serif` default below.
//
// Every visual surface (text + colors + borders) binds to a `--lm-*` CSS
// custom property that game.ts writes onto the root element from the
// resolved skin palette. The defaults below mirror the bundled `light`
// preset so the game still renders if `ctx.skin` is null. See
// `caputchin.json` `skins.presets` for the source values.
//
// Layout contract: the stage fills its container (the iframe viewport),
// flexing for available width/height. Cell size is driven by the
// `--lm-cell-size` custom property and computed at runtime from the
// board-area dimensions in game.ts (`applyCellSize`). The min-size floor
// below guarantees the L4 grid (4x3) is always playable: if the iframe is
// smaller than that floor, the SDK's auto-measure observer grows the
// iframe up to the content's scroll size.

const CELL_GAP_PX = 8;
const CELL_MIN_PX = 36;
const CELL_DEFAULT_PX = 72;
const CELL_MAX_PX = 96;

// Initial / preferred footprint advertised in the manifest. Picked so the
// L4 grid renders at the default cell size with comfortable padding. Once
// mounted, the game adapts to whatever the iframe actually receives.
const MAX_COLS = 4;
const MAX_ROWS = 3;
const ROOT_PAD = 12;
const ROOT_GAP = 8;
const PREF_BOARD_W = MAX_COLS * CELL_DEFAULT_PX + (MAX_COLS - 1) * CELL_GAP_PX;
const PREF_BOARD_H = MAX_ROWS * CELL_DEFAULT_PX + (MAX_ROWS - 1) * CELL_GAP_PX;
const PREF_HEADER_H = 40;
const PREF_ACTIONS_H = 56;
const PREF_STAGE_W = PREF_BOARD_W + ROOT_PAD * 2;
const PREF_STAGE_H = PREF_HEADER_H + PREF_BOARD_H + PREF_ACTIONS_H + ROOT_PAD * 2 + ROOT_GAP * 2;

const MIN_STAGE_W = MAX_COLS * CELL_MIN_PX + (MAX_COLS - 1) * CELL_GAP_PX + ROOT_PAD * 2;
const MIN_STAGE_H = MAX_ROWS * CELL_MIN_PX + (MAX_ROWS - 1) * CELL_GAP_PX
  + PREF_HEADER_H + PREF_ACTIONS_H + ROOT_PAD * 2 + ROOT_GAP * 2;

export const STAGE_WIDTH = PREF_STAGE_W;
export const STAGE_HEIGHT = PREF_STAGE_H;
export const CELL_GAP = CELL_GAP_PX;
export const CELL_MIN = CELL_MIN_PX;
export const CELL_MAX = CELL_MAX_PX;
export const STAGE_ROOT_PADDING = ROOT_PAD;
export const STAGE_ROOT_GAP = ROOT_GAP;

export const STYLES = `
/* Establish a full-viewport height chain so .lm-root's height:100% resolves
   against the iframe size instead of collapsing to content height. The
   srcdoc gives us margin:0/padding:0 on html+body but no height, and
   #cpt-root is a plain <div>; without these rules percentage heights
   inside the game fall back to auto. */
html, body, #cpt-root {
  width: 100%;
  height: 100%;
}

:host, .lm-root {
  /* Defaults mirror the bundled light skin preset. game.ts overwrites
     each one via style.setProperty when ctx.skin resolves. */
  --lm-bg: #F7F5F2;
  --lm-text: #2B2926;
  --lm-label: #5C5751;
  --lm-title: #2F6640;
  --lm-card-back-bg: #3A7D4F;
  --lm-card-back-text: #E0F2DA;
  --lm-card-front-bg: #E0F2DA;
  --lm-card-front-text: #2F6640;
  --lm-card-border: #C2E3BB;
  --lm-card-match-accent: #C2410C;
  --lm-button-bg: #3A7D4F;
  --lm-button-text: #E0F2DA;
  --lm-button-hover: #2F6640;
  --lm-button-secondary-text: #2F6640;
  --lm-button-secondary-border: #3A7D4F;
  --lm-button-secondary-hover-bg: #E0F2DA;
  --lm-focus-ring: #2F6640;
  --lm-cell-size: ${CELL_DEFAULT_PX}px;
  --lm-cell-gap: ${CELL_GAP_PX}px;
  /* CJK locales override --lm-cjk with native CJK UI fonts (game.ts via
     fonts.ts). Non-CJK locales keep this sans-serif default, so the base
     stack is unchanged. The var carries its own sans-serif tail, so
     font-family stays valid whether or not game.ts overrides it. */
  --lm-cjk: sans-serif;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, var(--lm-cjk);
  color: var(--lm-text);
}

.lm-root {
  width: 100%;
  height: 100%;
  min-width: ${MIN_STAGE_W}px;
  min-height: ${MIN_STAGE_H}px;
  display: grid;
  grid-template-rows: auto 1fr auto;
  background: var(--lm-bg);
  box-sizing: border-box;
  padding: ${ROOT_PAD}px;
  gap: ${ROOT_GAP}px;
}

.lm-header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  font-variant-numeric: tabular-nums;
  font-size: 0.9rem;
  font-weight: 600;
  padding: 0 4px;
  min-height: 32px;
}

.lm-header .label {
  color: var(--lm-label);
  font-weight: 500;
  margin-inline-end: 0.25rem;
}

.lm-best { text-align: start; }
.lm-level { text-align: center; }
.lm-time { text-align: end; }
.lm-time[data-hidden="true"] { visibility: hidden; }
.lm-level[data-hidden="true"] { visibility: hidden; }

.lm-board-area {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
}

.lm-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
}

.lm-grid {
  display: grid;
  gap: var(--lm-cell-gap);
}

.lm-cell {
  position: relative;
  width: var(--lm-cell-size);
  height: var(--lm-cell-size);
  perspective: 600px;
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
  border-radius: 0.5rem;
  outline: none;
}

.lm-cell:focus-visible .lm-face {
  box-shadow: 0 0 0 3px var(--lm-focus-ring);
}

.lm-face {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  backface-visibility: hidden;
  transition: transform 0.35s ease;
}

.lm-back {
  background: var(--lm-card-back-bg);
  color: var(--lm-card-back-text);
  font-size: 1.5rem;
}

.lm-back::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 0.5rem;
  background-image: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.08), transparent 60%);
}

.lm-front {
  background: var(--lm-card-front-bg);
  color: var(--lm-card-front-text);
  transform: rotateY(180deg);
  border: 2px solid var(--lm-card-border);
}

.lm-front svg {
  width: 70%;
  height: 70%;
  display: block;
}

.lm-cell[data-flipped="true"] .lm-back { transform: rotateY(180deg); }
.lm-cell[data-flipped="true"] .lm-front { transform: rotateY(0deg); }

.lm-cell[data-matched="true"] .lm-front {
  border-color: var(--lm-card-match-accent);
  background: var(--lm-card-front-bg);
  animation: lm-match-flash 0.5s ease 1;
}

@keyframes lm-match-flash {
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--lm-card-match-accent) 40%, transparent); }
  50% { box-shadow: 0 0 0 6px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}

.lm-cell[disabled] { cursor: default; }

.lm-action {
  appearance: none;
  border: 0;
  font: inherit;
  background: var(--lm-button-bg);
  color: var(--lm-button-text);
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.9rem;
}

.lm-action:hover { background: var(--lm-button-hover); }
.lm-action:focus-visible { box-shadow: 0 0 0 3px var(--lm-focus-ring); outline: none; }

.lm-action--secondary {
  background: transparent;
  color: var(--lm-button-secondary-text);
  border: 1px solid var(--lm-button-secondary-border);
}
.lm-action--secondary:hover {
  background: var(--lm-button-secondary-hover-bg);
}

.lm-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 0.75rem;
  padding: 1rem;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

.lm-screen-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--lm-title);
}

.lm-screen-body {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.4;
  max-width: 22ch;
}

.lm-screen-buttons {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: center;
}

.lm-announce {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  clip: rect(0 0 0 0);
  overflow: hidden;
}

@media (prefers-reduced-motion: reduce) {
  .lm-face, .lm-cell[data-matched="true"] .lm-front {
    transition: none;
    animation: none;
  }
}
`;
