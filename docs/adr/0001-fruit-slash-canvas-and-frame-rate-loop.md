# ADR-0001: Fruit Slash — canvas rendering and a frame-rate-independent loop

- Status: Accepted
- Date: 2026-05-25

## Context

Fruit Slash is the first first-party game that renders gameplay on a `<canvas>`.
The existing games render with DOM/SVG: `dino-runner` positions inline-SVG
sprites via CSS transforms, `leaf-memory` is a DOM card grid. Fruit Slash
continuously composites many moving targets, a fading swipe trail, and slice
particles, and it deliberately wants the play field to be opaque to DOM
scrapers (a captcha property).

It is also a clean-room original. An evaluated open-source reference
(BlockNinja) turned out to be a near-verbatim copy of the GPL-3.0 "Menja" demo;
GPL copyleft is incompatible with our MIT games + Apache SDK + a commercial
embedded captcha, so no code from it was used. Fruit Slash was written from the
SDK contract and the dino-runner conventions only.

A prior in-house slicer attempt was abandoned because its loop coupled physics
to the frame rate (it stepped per animation frame). On a 240Hz display it ran
~4x too fast: fruit flew off before they could be tracked or sliced. Many
iterations were lost to this before the cause was found.

## Decision

1. **Render gameplay on a 2D canvas; keep chrome in the DOM.** Fruit, bombs,
   the blade trail, and slice particles are drawn on a single canvas sized to
   the container and scaled through a world→device transform. The HUD, start /
   game-over overlays, and the aria-live announcer stay real DOM so screen
   readers and focus management work. The canvas itself is decorative
   (`role="application"` on the root, `aria-label` describing the goal); nothing
   about the next fruit is written to the DOM/accessibility tree.

2. **The game loop is frame-rate independent, and this is mandatory.** Fruit
   Slash runs its own `requestAnimationFrame` loop that advances the simulation
   by real elapsed time (`dt` seconds), clamped to `MAX_DT` after a stall, and
   renders every frame at the native refresh rate. All physics are expressed
   per second; there is deliberately no per-frame ("MS_PER_FRAME") constant and
   no fixed-step accumulator. The projectile integrator uses the exact
   closed-form update for constant acceleration (`y += vy·dt + ½·g·dt²`), which
   composes identically across step sizes. `tests/frame-rate.test.ts` asserts
   the same launch produces an identical trajectory at 60/144/240Hz; it is a
   permanent regression guard against reintroducing frame coupling.

## Consequences

- The same arc plays at the same real-world speed on any refresh rate, and is
  smooth on high-refresh displays (rendered every frame, no judder).
- Targets are contained by construction: launches are derived from on-screen
  entry/exit points with the apex capped below the top border, so a fruit can
  only enter and exit through the bottom (proven in `tests/launch.test.ts`).
- Canvas opacity raises the bar against naive DOM-scraping solvers; it is
  hardening, not the anti-bot model (that remains Caputchin's behavioral +
  proof-of-work layer). The accessibility tree must never carry the solution.
- Future canvas games should reuse this loop shape. If a game ever needs a
  fixed timestep (e.g. deterministic physics), it must still decouple the
  *render* rate and keep the `frame-rate` guard equivalent.
