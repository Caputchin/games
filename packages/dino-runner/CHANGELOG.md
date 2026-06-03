# Changelog

## [0.4.2](https://github.com/Caputchin/games/compare/dino-runner-v0.4.1...dino-runner-v0.4.2) (2026-06-03)


### Bug Fixes

* **dino-runner:** responsive start/game-over overlay so it fits a short embed ([0bb517e](https://github.com/Caputchin/games/commit/0bb517e091e4f7e9b65d14ee8cac38bbcd76c448))
* **dino-runner:** restore start/over description at all sizes, tap-to-jump mobile, block long-press selection ([2c0842e](https://github.com/Caputchin/games/commit/2c0842ecfbd7d120fba2c4ea6d30dd30b1d7cf2e))
* **games:** scale in-game HUD with the rendered width so it fits narrow embeds ([bd283f5](https://github.com/Caputchin/games/commit/bd283f54d2861e6e626fc117d4abcebced21fcc9))

## [0.4.1](https://github.com/Caputchin/games/compare/dino-runner-v0.4.0...dino-runner-v0.4.1) (2026-06-02)


### Bug Fixes

* **games:** ship .caputchin presets (skins/locales/configs) in the published package ([fa71e62](https://github.com/Caputchin/games/commit/fa71e62376b27e5dcc54f6e862f7e9709beea151))

## [0.4.0](https://github.com/Caputchin/games/compare/dino-runner-v0.3.0...dino-runner-v0.4.0) (2026-06-01)


### ⚠ BREAKING CHANGES

* **games:** migrate register() calls to the manifest-less signature

### Features

* **dino-runner:** server-validated replay re-author (headless run + live driver) ([6cf6358](https://github.com/Caputchin/games/commit/6cf635844a48c0b973adfaa728918790431862d8))
* **games:** set preferred.layout inline for leaf-memory and dino-runner ([48d7370](https://github.com/Caputchin/games/commit/48d73707c5e2365adeb9a17b2dc5a67e40c22def))


### Bug Fixes

* **games:** read split .caputchin presets directly in config + tests for 5 games ([fb375bf](https://github.com/Caputchin/games/commit/fb375bf11e2dcd919ee16d959ac16edbe6b95afd))
* **games:** self-contained replay engines; live honors dashboard config ([8c2176b](https://github.com/Caputchin/games/commit/8c2176b5e37545aace861bad6eae5f158b90a721))
* **games:** widen skin helper param types for ResolvedSkin scalar values ([b847870](https://github.com/Caputchin/games/commit/b8478700e027a534163e2d6ce27c497455e507b9))


### Code Refactoring

* **games:** migrate register() calls to the manifest-less signature ([a527b11](https://github.com/Caputchin/games/commit/a527b11930315d8de9b958a559e7d3a12a112310))

## [0.3.0](https://github.com/Caputchin/games/compare/dino-runner-v0.2.0...dino-runner-v0.3.0) (2026-05-25)


### Features

* **dino-runner:** report pass at threshold then resend final score (mirror fruit-slash) ([a0f3200](https://github.com/Caputchin/games/commit/a0f32008fabf8a8cd604029d851e67d85e2a6fa6))

## [0.2.0](https://github.com/Caputchin/games/compare/dino-runner-v0.1.0...dino-runner-v0.2.0) (2026-05-24)


### Features

* **dino-runner:** add an in-game sound toggle, enlarge the moon, and stretch the overlay full-width ([5a8555c](https://github.com/Caputchin/games/commit/5a8555c4697f649e3952676fda87265a067e9b57))
* **dino-runner:** add Dino Runner game to the Core Pack ([fe4156a](https://github.com/Caputchin/games/commit/fe4156aee8e1c7de0f28b2b1532fe1f1ea9eac0d))
* **dino-runner:** use the exact Chrome sprites (BSD-3) and original jump physics ([d28412b](https://github.com/Caputchin/games/commit/d28412bf186b6f27280a9a74d950e785332b9d26))
* **dino-runner:** use the original game sounds and split light/dark into separate skins ([eda3297](https://github.com/Caputchin/games/commit/eda3297937950a892c77d41b6a9ac843f8b02dd6))


### Bug Fixes

* **dino-runner:** scrim the start overlay for legibility and fix the clipped dark-skin moon ([e22a91e](https://github.com/Caputchin/games/commit/e22a91e5b8e1d92cc1a616dfbfe2fe6dda9e9ad5))
* **dino-runner:** space obstacles a full jump apart and redraw the dino sprites ([c85c749](https://github.com/Caputchin/games/commit/c85c749e19ea2600451083410695e727c0c3065f))
