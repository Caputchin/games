// Scoped CSS for Leaf Memory. Injected into the iframe document on first
// render. No external font fetches (CSP blocks them); system font stack.
//
// Brand palette: green-100 background, green-600 card backs, persimmon
// accent-600 match flash. See docs/brand/design.md.
//
// Layout contract: the .lm-root stage is a fixed px footprint sized to
// hold the largest grid (L4: 4 cols x 3 rows of 72px cells). Smaller
// grids center within .lm-board-area. Start / win / loss screens share
// the same stage so the iframe never changes size between states.

const CELL_PX = 72;
const CELL_GAP_PX = 8;
const BOARD_W = 4 * CELL_PX + 3 * CELL_GAP_PX + 16;
const BOARD_H = 3 * CELL_PX + 2 * CELL_GAP_PX + 16;
const HEADER_H = 40;
const ACTIONS_H = 56;
const STAGE_W = BOARD_W + 24;
const STAGE_H = HEADER_H + BOARD_H + ACTIONS_H + 24;

export const STAGE_WIDTH = STAGE_W;
export const STAGE_HEIGHT = STAGE_H;

export const STYLES = `
:host, .lm-root {
  --green-100: #E0F2DA;
  --green-200: #C2E3BB;
  --green-500: #4E9B65;
  --green-600: #3A7D4F;
  --green-700: #2F6640;
  --accent-600: #C2410C;
  --neutral-800: #2B2926;
  --neutral-100: #EDEBE6;
  --neutral-50: #F7F5F2;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--neutral-800);
}

.lm-root {
  width: ${STAGE_W}px;
  height: ${STAGE_H}px;
  display: grid;
  grid-template-rows: ${HEADER_H}px 1fr ${ACTIONS_H}px;
  background: var(--neutral-50);
  box-sizing: border-box;
  padding: 12px;
  gap: 8px;
}

.lm-header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  font-variant-numeric: tabular-nums;
  font-size: 0.9rem;
  font-weight: 600;
  padding: 0 4px;
}

.lm-header .label {
  color: var(--neutral-800);
  opacity: 0.6;
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
}

.lm-actions {
  display: flex;
  align-items: center;
  justify-content: center;
}

.lm-grid {
  display: grid;
  gap: ${CELL_GAP_PX}px;
}

.lm-cell {
  position: relative;
  width: ${CELL_PX}px;
  height: ${CELL_PX}px;
  perspective: 600px;
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
  border-radius: 0.5rem;
  outline: none;
}

.lm-cell:focus-visible .lm-face {
  box-shadow: 0 0 0 3px var(--green-700);
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
  background: var(--green-600);
  color: var(--green-100);
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
  background: var(--green-100);
  color: var(--green-700);
  transform: rotateY(180deg);
  border: 2px solid var(--green-200);
}

.lm-front svg {
  width: 70%;
  height: 70%;
  display: block;
}

.lm-cell[data-flipped="true"] .lm-back { transform: rotateY(180deg); }
.lm-cell[data-flipped="true"] .lm-front { transform: rotateY(0deg); }

.lm-cell[data-matched="true"] .lm-front {
  border-color: var(--accent-600);
  background: var(--green-100);
  animation: lm-match-flash 0.5s ease 1;
}

@keyframes lm-match-flash {
  0% { box-shadow: 0 0 0 0 rgba(194, 65, 12, 0.4); }
  50% { box-shadow: 0 0 0 6px rgba(194, 65, 12, 0); }
  100% { box-shadow: 0 0 0 0 rgba(194, 65, 12, 0); }
}

.lm-cell[disabled] { cursor: default; }

.lm-action {
  appearance: none;
  border: 0;
  font: inherit;
  background: var(--green-600);
  color: var(--green-100);
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.9rem;
}

.lm-action:hover { background: var(--green-700); }
.lm-action:focus-visible { box-shadow: 0 0 0 3px var(--green-700); outline: none; }

.lm-action--secondary {
  background: transparent;
  color: var(--green-700);
  border: 1px solid var(--green-600);
}
.lm-action--secondary:hover {
  background: var(--green-100);
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
  color: var(--green-700);
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
