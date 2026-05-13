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

Two harnesses, two trade-offs:

| Harness | URL | What it tests | Requires HTTPS? |
|---|---|---|---|
| `examples/direct-mount.html` | `/examples/direct-mount.html` | Game DOM, leaf rendering, timer, replay, `bridge.pass` payload — bridge is mocked, widget iframe path bypassed | No — HTTP works |
| `examples/host.html` | `/examples/host.html` | Full production path: `@caputchin/widget` mounts the sandboxed iframe, postMessage protocol, real `pass` CustomEvent | **Yes** — the published widget rejects non-HTTPS `game-src` as `invalid-config` |

### Boot the harness

```bash
pnpm install
pnpm --filter @caputchin/leaf-memory build   # produces packages/leaf-memory/dist/leaf-memory.js
pnpm dev:serve                                # default: http://localhost:5173
```

For iterative dev with a watch-rebuild on save, in two terminals:

```bash
# Terminal 1:
pnpm --filter @caputchin/leaf-memory dev
# Terminal 2:
pnpm dev:serve
```

### Enable HTTPS for `host.html` (one-time mkcert setup)

`host.html` exercises the real widget — which enforces HTTPS on `game-src`. Plain HTTP fires `invalid-config` and stays inert. To unblock:

```bash
# 1. Install mkcert (one-time, platform-specific):
#    macOS:    brew install mkcert nss
#    Linux:    sudo apt install libnss3-tools && \
#              curl -JLO https://github.com/FiloSottile/mkcert/releases/latest/download/mkcert-v*-linux-amd64 && \
#              chmod +x mkcert-v*-linux-amd64 && sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert
#    Windows:  choco install mkcert  or  scoop install mkcert

# 2. Trust the mkcert local CA (one-time):
mkcert -install

# 3. Generate localhost cert + key for this repo:
mkdir -p examples/.cert
cd examples/.cert
mkcert -cert-file localhost.pem -key-file localhost-key.pem localhost 127.0.0.1
cd ../..

# 4. Restart the dev server — it auto-detects the cert pair:
pnpm dev:serve
# →  https://localhost:5173/examples/host.html
```

The `examples/.cert/` directory is git-ignored — never commit cert material.

To revert to HTTP, just delete or rename `examples/.cert/`.

## Verification

```bash
pnpm verify   # typecheck + test + build across all packages
```

## Distribution

Each game ships through the [Caputchin marketplace](https://caputchin.com/marketplace) via jsDelivr. Customers integrate by adding a `<caputchin-widget game="@caputchin/leaf-memory">` element on their page — see the [widget docs](https://github.com/Caputchin/caputchin-sdk).

## License

MIT — see [LICENSE](LICENSE).
