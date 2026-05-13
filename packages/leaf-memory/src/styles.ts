// Scoped CSS for Leaf Memory. Injected into the iframe document on first
// render. No external font fetches (CSP blocks them) — system font stack.
//
// Brand palette: green-100 background, green-600 card backs, persimmon
// accent-600 match flash. See docs/brand/design.md.

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
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--neutral-50);
  min-height: 100%;
  box-sizing: border-box;
}

.lm-status {
  display: flex;
  gap: 1.5rem;
  font-variant-numeric: tabular-nums;
  font-size: 1rem;
  font-weight: 600;
}

.lm-status .label {
  color: var(--neutral-800);
  opacity: 0.6;
  font-weight: 500;
  margin-right: 0.25rem;
}

.lm-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-auto-rows: 1fr;
  gap: 0.5rem;
  width: min(100%, 22rem);
  aspect-ratio: 3 / 4;
}

@media (min-aspect-ratio: 1/1) {
  .lm-grid {
    grid-template-columns: repeat(4, 1fr);
    width: min(100%, 28rem);
    aspect-ratio: 4 / 3;
  }
}

.lm-cell {
  position: relative;
  perspective: 600px;
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
  border-radius: 0.5rem;
  outline: none;
  aspect-ratio: 1;
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
  padding: 0.6rem 1.2rem;
  border-radius: 0.5rem;
  cursor: pointer;
  font-weight: 600;
}

.lm-action:hover { background: var(--green-700); }
.lm-action:focus-visible { box-shadow: 0 0 0 3px var(--green-700); outline: none; }

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
