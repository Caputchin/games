# @caputchin/leaf-memory

Match pairs of tropical leaves before the timer runs out.

A first-party game for the [Caputchin](https://caputchin.com) marketplace.

## How it plays

- Default grid: **3×4 = 6 pairs (12 cards)**.
- Time budget: **`difficulty × 30` seconds**, where `difficulty = pairs / 2`. For the default 3×4 grid that is **90 seconds**.
- Initial 1.5 s peek to memorize positions, then cards cover and the timer starts.
- Click / tap to flip; matching pairs stay revealed; mismatches flip back after 600 ms.
- Clear the board within the time budget to **pass**. Timing out shows a replay prompt — no pass signal is sent.

## Scoring

Internal scoring is `score = difficulty × (maxTime − elapsedSec)`:

| Scenario | Score |
|---|---|
| 3×4 grid passed instantly (0 s elapsed) | 270 |
| 3×4 grid passed at the buzzer (90 s elapsed) | 0 |
| 3×4 grid timed out (> 90 s) | no pass signal sent |

Score is a free-form number on this game's own scale, per [ADR-0030](https://github.com/Caputchin/caputchin-platform/blob/main/docs/adr/0030-bridge-pass-not-complete.md). Scoreboards compare within Leaf Memory only.

## Accessibility

- `role="grid"` with `role="gridcell"` cells; `aria-pressed` reflects flip state.
- `aria-live="polite"` region announces "match", "no match", "round passed", "out of time".
- Keyboard navigation: `Tab` / arrow keys move focus; `Space` / `Enter` flip the focused card.
- Honors `prefers-reduced-motion` — skips flip and timer pulse animations when set.

## Distribution

Loaded by `<caputchin-widget game="@caputchin/leaf-memory">` or `<caputchin-widget game-src="…/dist/leaf-memory.js">`. See the [`caputchin.json` manifest](caputchin.json) and [game-distribution](https://github.com/Caputchin/caputchin-platform/blob/main/docs/game-distribution.md) for the two paths.

## Building

```bash
pnpm install
pnpm build       # produces dist/leaf-memory.js (single self-contained IIFE)
pnpm typecheck
pnpm test
```
