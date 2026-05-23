# Contributing

## Adding a new game

1. Create `packages/<game-id>/` mirroring the `packages/leaf-memory/` layout.
2. Write `packages/<game-id>/caputchin.json` with the [marketplace manifest](https://github.com/Caputchin/caputchin-platform/blob/main/docs/features/marketplace.md) fields.
3. Implement the game against [`@caputchin/game-sdk`](https://www.npmjs.com/package/@caputchin/game-sdk).
4. Add the new package path to the root `caputchin.json` collection's `games` array.
5. Run `pnpm verify` from the repo root. All three steps (typecheck, test, build) must pass.

## Game design constraints (non-negotiable)

- **Bundle is single-file**, IIFE format. No code splitting, no dynamic `import()`, no `Worker(url)`, no external `fetch`. All assets inline as data URLs. See [game-distribution](https://github.com/Caputchin/caputchin-platform/blob/main/docs/features/game-distribution.md#bundle-constraint).
- **`bridge.pass` is success-only.** Call it when the user passes the round. If the user fails or abandons, do not call it; silence is the failure signal. See [ADR-0030](https://github.com/Caputchin/caputchin-platform/blob/main/docs/adr/0030-bridge-pass-not-complete.md).
- **Score is your own scale.** Any number. The platform records it verbatim. Scores compare within a single game; cross-game comparison is not a goal. See [game-sdk docs](https://github.com/Caputchin/caputchin-sdk/blob/main/packages/game-sdk/README.md).
- **Responsive, touch, accessible by default.** First-party games set the bar: `support.responsive`, `support.touch`, `support.accessible` should all be `true`.
- **Honor `prefers-reduced-motion`.** Skip non-essential animations when set.
- **No external font / CDN fetches.** CSP blocks them. Use the system font stack.

## Repo layout

```
caputchin-games/
  caputchin.json              # collection manifest (the Core Pack wrapper)
  packages/
    leaf-memory/
      caputchin.json          # game manifest (@caputchin/game-leaf-memory)
      preview.png             # marketplace thumbnail (600x315)
      src/                    # game source
      tests/                  # unit tests
      dist/                   # built bundle (single self-contained IIFE)
```

## Commits

Conventional Commits, single-line subject only. See the project root [CLAUDE.md](https://github.com/Caputchin/caputchin-platform/blob/main/CLAUDE.md) for the full rule.

## Verification

Run from the repo root, before pushing:

```bash
pnpm verify
```

All three stages must be green before opening a PR.
