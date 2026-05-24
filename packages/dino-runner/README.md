# Dino Runner

Jump the cactus, duck the birds, and run as far as you can. A Caputchin
first-party game, recreated from the Chrome offline dino in clean, framework-
free TypeScript and rendered with inline SVG so every pixel is skinnable.

## How it plays

The runner sprints over a scrolling desert. Obstacles arrive from the right:
ground cacti (which clump up to three wide as the run speeds up) and, once the
run is fast enough, flying birds. Jump the ground obstacles, duck the low
fliers, and survive. Speed ramps up the whole time, and the palette inverts to
a night phase at intervals.

The game is endless, so success is evaluated at crash time: the first run that
reaches the configured **pass score** reports success (`bridge.pass`), and so
does every later run that beats it. Best score is tracked in memory for the
session (the sandboxed iframe has no storage).

| Input | Keyboard | Touch |
|---|---|---|
| Jump | `Space` / `Up` / `W` | tap the field, or the jump button |
| Duck | hold `Down` / `S` | hold the duck button |
| Restart | `Space` / `Up` on the game-over screen | the Restart button |

## Customization

Everything is driven by [`caputchin.json`](caputchin.json) and resolved by the
widget into the game's runtime context:

- **Locales** — all on-screen text (including the game-over title the original
  hard-coded) ships in the 11 official languages and is fully overridable.
- **Skins** — day + night colors, button colors, and all 16 sprites. Sprites
  are `currentColor` SVGs decoded and inlined at runtime, so a customer skin
  can recolor them or swap the art wholesale (e.g. a different runner) without
  touching code.
- **Configurations** — speed, acceleration, gravity, jump strength, obstacle
  spacing, the pass score, the day/night cycle, and whether birds spawn. Ships
  with `default`, `casual`, `hardcore`, and `calm` presets.

## Accessibility

Keyboard- and touch-operable, screen-reader labelled, with live-region
announcements for run start / game over / new best. Honors
`prefers-reduced-motion` by freezing decorative parallax (clouds, moon, stars,
the day/night cross-fade) while keeping the core run intact. Note the core
challenge is a visual reflex task by nature.

## Build

```bash
pnpm --filter @caputchin/game-dino-runner build
```

Produces a single self-contained IIFE at `dist/dino-runner.js` with every
sprite inlined as a data URI, per the Caputchin game bundle constraint.

## License

MIT, see [LICENSE](../../LICENSE).
