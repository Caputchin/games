# Changelog

## [0.4.1](https://github.com/Caputchin/games/compare/leaf-memory-v0.4.0...leaf-memory-v0.4.1) (2026-06-02)


### Bug Fixes

* **games:** ship .caputchin presets (skins/locales/configs) in the published package ([fa71e62](https://github.com/Caputchin/games/commit/fa71e62376b27e5dcc54f6e862f7e9709beea151))

## [0.4.0](https://github.com/Caputchin/games/compare/leaf-memory-v0.3.0...leaf-memory-v0.4.0) (2026-06-01)


### ⚠ BREAKING CHANGES

* **games:** migrate register() calls to the manifest-less signature

### Features

* **games:** set preferred.layout inline for leaf-memory and dino-runner ([48d7370](https://github.com/Caputchin/games/commit/48d73707c5e2365adeb9a17b2dc5a67e40c22def))
* **leaf-memory:** server-validated replay re-author (headless run + live driver) ([f438786](https://github.com/Caputchin/games/commit/f43878652607a8240bdf918a8464c1d4fa485182))
* **leaf-memory:** wire engine.wasm into the headless run artifact (P13 slice 6) ([4f09897](https://github.com/Caputchin/games/commit/4f0989749c0e76ed7098e1fd497e59964a50aa55))


### Bug Fixes

* **games:** read split .caputchin presets directly in config + tests for 5 games ([fb375bf](https://github.com/Caputchin/games/commit/fb375bf11e2dcd919ee16d959ac16edbe6b95afd))
* **games:** self-contained replay engines; live honors dashboard config ([8c2176b](https://github.com/Caputchin/games/commit/8c2176b5e37545aace861bad6eae5f158b90a721))
* **games:** widen skin helper param types for ResolvedSkin scalar values ([b847870](https://github.com/Caputchin/games/commit/b8478700e027a534163e2d6ce27c497455e507b9))


### Code Refactoring

* **games:** migrate register() calls to the manifest-less signature ([a527b11](https://github.com/Caputchin/games/commit/a527b11930315d8de9b958a559e7d3a12a112310))

## [0.3.0](https://github.com/Caputchin/games/compare/leaf-memory-v0.2.0...leaf-memory-v0.3.0) (2026-05-24)


### Features

* **leaf-memory:** localize to the 11 official languages ([78692f9](https://github.com/Caputchin/games/commit/78692f97e77e75400e40e0560e4ffd19964349ef))
* **leaf-memory:** publish resolved lang attribute and per-locale CJK font stack ([f9366a3](https://github.com/Caputchin/games/commit/f9366a3548cc0a1ed3bfcbeee116248741a1b264))

## [0.2.0](https://github.com/Caputchin/games/compare/leaf-memory-v0.1.0...leaf-memory-v0.2.0) (2026-05-23)


### ⚠ BREAKING CHANGES

* **games:** reshape leaf-memory manifest (run artifact split, config injection)

### Features

* **games:** publish-ready marketplace assets (README rewrites, preview thumbnails, manifest cleanup) ([28e5b9b](https://github.com/Caputchin/games/commit/28e5b9b749d0dcf8294ccce58ed865933198bbaa))
* **games:** reshape leaf-memory manifest (run artifact split, config injection) ([868721c](https://github.com/Caputchin/games/commit/868721c42c8af6f25154778c93e5ad3cc9b7ff93))
* **leaf-memory:** customer configurations (start level, per-level timing, header toggles, flip-back delay) ([0ee6f20](https://github.com/Caputchin/games/commit/0ee6f20fd8193441ef787405f96b5921df1fa280))
* **leaf-memory:** declare marketplace categories (Memory, Puzzle) ([667f5f8](https://github.com/Caputchin/games/commit/667f5f8ea5423ab2c477e30296c7b3b41f363ebb))
* **leaf-memory:** document all 32 string keys via languages.schema ([77d9cb2](https://github.com/Caputchin/games/commit/77d9cb25f3a6f8ec522c9fe8696079afabaabdfc))
* **leaf-memory:** halve round time + peek budgets across all four levels ([eebcbe8](https://github.com/Caputchin/games/commit/eebcbe80d4dd7e4336c846e2d658d39752978ef4))
* **leaf-memory:** localize all UI strings via languages presets (en + ar) ([ace808b](https://github.com/Caputchin/games/commit/ace808bd6fdd382e085e7736ec1cfb56806e4611))
* **leaf-memory:** make game responsive to iframe size with ResizeObserver-driven cell sizing ([5bdc9b5](https://github.com/Caputchin/games/commit/5bdc9b5d302ae4f1554df8032dd734de2647a769))
* **leaf-memory:** skins-driven palette + leaf SVG assets with sanitized inline rendering ([ca644d7](https://github.com/Caputchin/games/commit/ca644d7ff99752f9e2702c1d9ef4053e566f3612))
* **leaf-memory:** source preferred footprint from caputchin.json, drop code-injected dims ([b965bd0](https://github.com/Caputchin/games/commit/b965bd0ab7bd18975d3956ed2b943aa92282bfe0))
* **leaf-memory:** start/win/loss screens, 4-level ladder, fixed-size iframe footprint ([7e4de4d](https://github.com/Caputchin/games/commit/7e4de4d33bf2317e8633cff4e5e03e67a259a342))
* scaffold caputchin-games monorepo with @caputchin/leaf-memory game ([0c49eef](https://github.com/Caputchin/games/commit/0c49eef5a7a8e71458acf2ddc67f11ba6588fa46))
