# caputchin-games

First-party games for the [Caputchin](https://caputchin.com) marketplace. Published as the **Caputchin Games — Core Pack** collection.

This repo carries the GitHub topic `caputchin-game`, which is how the [marketplace indexer](https://github.com/Caputchin/caputchin-platform) discovers it.

## Packs

| Pack | Package | Status |
|---|---|---|
| Core | `@caputchin/games-core` (collection manifest) | v0.1.0 |

## Games

| Game | Package | Manifest |
|---|---|---|
| Leaf Memory | `@caputchin/leaf-memory` | [`packages/leaf-memory/caputchin.json`](packages/leaf-memory/caputchin.json) |

## Repo layout

```
caputchin-games/
  caputchin.json              # collection manifest (@caputchin/games-core)
  packages/
    leaf-memory/
      caputchin.json          # sub-manifest (@caputchin/leaf-memory)
      src/                    # game source
      tests/                  # unit tests
      dist/                   # built bundle (single self-contained IIFE)
  examples/
    host.html                 # local-dev harness
    serve.mjs                 # static server for the harness
```

## Local development

The local-dev harness loads `@caputchin/widget` from jsDelivr and the local leaf-memory bundle from disk.

```bash
pnpm install
# Build all games once:
pnpm build
# Serve the harness on http://localhost:5173:
pnpm dev:serve
# Open http://localhost:5173/examples/host.html
```

To iterate on a single game with hot rebuild:

```bash
# Terminal 1:
pnpm --filter @caputchin/leaf-memory dev
# Terminal 2:
pnpm dev:serve
# Reload the browser to pick up the new bundle.
```

## Verification

```bash
pnpm verify   # typecheck + test + build across all packages
```

## Distribution

Each game ships through the [Caputchin marketplace](https://caputchin.com/marketplace) via jsDelivr. Customers integrate by adding a `<caputchin-widget game="@caputchin/leaf-memory">` element on their page — see the [widget docs](https://github.com/Caputchin/caputchin-sdk).

## License

MIT — see [LICENSE](LICENSE).
