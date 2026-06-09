# Changelog

## [0.5.0](https://github.com/Caputchin/games/compare/fruit-slash-v0.4.0...fruit-slash-v0.5.0) (2026-06-09)


### Features

* **fruit-slash:** require a genuine swipe to slice so the U6 path channel reaches the solver ([718eded](https://github.com/Caputchin/games/commit/718eded92a850a1ea7d3bc26a83e628d6191825d))

## [0.4.0](https://github.com/Caputchin/games/compare/fruit-slash-v0.3.2...fruit-slash-v0.4.0) (2026-06-07)


### Features

* **fruit-slash:** end the round on a sliced bomb and raise bomb density to defeat scatter bots ([2f59d29](https://github.com/Caputchin/games/commit/2f59d2971e16917fea38e95fada5ab10725d29a2))
* **games:** add reaction-time gate, view hardening, and minSolveMs floor ([a816c56](https://github.com/Caputchin/games/commit/a816c56c853024848288c92fb5ae2efae4277832))

## [0.3.2](https://github.com/Caputchin/games/compare/fruit-slash-v0.3.1...fruit-slash-v0.3.2) (2026-06-04)


### Bug Fixes

* **games:** scale in-game HUD with the rendered width so it fits narrow embeds ([bd283f5](https://github.com/Caputchin/games/commit/bd283f54d2861e6e626fc117d4abcebced21fcc9))

## [0.3.1](https://github.com/Caputchin/games/compare/fruit-slash-v0.3.0...fruit-slash-v0.3.1) (2026-06-02)


### Bug Fixes

* **games:** ship .caputchin presets (skins/locales/configs) in the published package ([fa71e62](https://github.com/Caputchin/games/commit/fa71e62376b27e5dcc54f6e862f7e9709beea151))

## [0.3.0](https://github.com/Caputchin/games/compare/fruit-slash-v0.2.0...fruit-slash-v0.3.0) (2026-06-01)


### ⚠ BREAKING CHANGES

* **games:** migrate register() calls to the manifest-less signature

### Features

* **fruit-slash:** declare preferred.layout modal in manifest ([e8afaf2](https://github.com/Caputchin/games/commit/e8afaf2edd876b6cdccca93a7f6658396f342def))
* **fruit-slash:** server-validated replay re-author (headless run + live driver) ([aedfe32](https://github.com/Caputchin/games/commit/aedfe32c4d171fb4937d7ae0271eb74a5ea839a9))


### Bug Fixes

* **games:** read split .caputchin presets directly in config + tests for 5 games ([fb375bf](https://github.com/Caputchin/games/commit/fb375bf11e2dcd919ee16d959ac16edbe6b95afd))
* **games:** self-contained replay engines; live honors dashboard config ([8c2176b](https://github.com/Caputchin/games/commit/8c2176b5e37545aace861bad6eae5f158b90a721))


### Code Refactoring

* **games:** migrate register() calls to the manifest-less signature ([a527b11](https://github.com/Caputchin/games/commit/a527b11930315d8de9b958a559e7d3a12a112310))

## [0.2.0](https://github.com/Caputchin/games/compare/fruit-slash-v0.1.0...fruit-slash-v0.2.0) (2026-05-25)


### Features

* add Fruit Slash, a clean-room 2D canvas slicer captcha game ([80b94ec](https://github.com/Caputchin/games/commit/80b94ecfd9948756fab256e8bf9e88d98d776b44))


### Bug Fixes

* **fruit-slash:** adapt play field and start screen to embed size ([986a856](https://github.com/Caputchin/games/commit/986a856569338c83f8c501e2273f5f482b8c8cba))
