# Changelog

## [0.2.3](https://github.com/Caputchin/games/compare/phobos-v0.2.2...phobos-v0.2.3) (2026-06-04)


### Bug Fixes

* **phobos:** level 1 spawns exactly the verify count of monsters (default wave_count to pass_kills) ([c39b74d](https://github.com/Caputchin/games/commit/c39b74dcacf2c19d3de31576c4e66667f29ec013))

## [0.2.2](https://github.com/Caputchin/games/compare/phobos-v0.2.1...phobos-v0.2.2) (2026-06-02)


### Bug Fixes

* **games:** ship .caputchin presets (skins/locales/configs) in the published package ([fa71e62](https://github.com/Caputchin/games/commit/fa71e62376b27e5dcc54f6e862f7e9709beea151))

## [0.2.1](https://github.com/Caputchin/games/compare/phobos-v0.2.0...phobos-v0.2.1) (2026-06-01)


### Bug Fixes

* gzip-compress the inlined live wasm in phobos and wall-smash to shrink the bundle entry ([6fd372d](https://github.com/Caputchin/games/commit/6fd372d2d5d3b61208031b46c974ac082b23714b))

## [0.2.0](https://github.com/Caputchin/games/compare/phobos-v0.1.0...phobos-v0.2.0) (2026-06-01)


### ⚠ BREAKING CHANGES

* **games:** migrate register() calls to the manifest-less signature

### Features

* add Phobos, a real DOOM-engine captcha game ([98f9020](https://github.com/Caputchin/games/commit/98f902003775c06b6e917543f34bad437f8355d6))
* **games:** set preferred.layout modal for whack-a-monkey and phobos ([8d758ac](https://github.com/Caputchin/games/commit/8d758ac188958839cc92d910f69af4276bb35a8e))
* **phobos:** add README, branded 600x315 preview poster, and auto engine prebuild ([2b2b222](https://github.com/Caputchin/games/commit/2b2b22273726f8b48cc739bfbbc5013746d08652))
* **phobos:** campaign progression with level-clear, next-level, death and loading states ([a7a8059](https://github.com/Caputchin/games/commit/a7a8059ff28fdc6d4b45301bae0662e075f624ed))
* **phobos:** four distinct campaign arenas off one asset palette, bonus levels cycle ([074b55c](https://github.com/Caputchin/games/commit/074b55cc3aea449ae98d19a6729593900778dc45))
* **phobos:** joystick + single fire button touch controls (move any direction incl back) ([a44a74e](https://github.com/Caputchin/games/commit/a44a74e61a0380e3d645b1eb70dafe3eb1835389))
* **phobos:** live SFX sound + mute, loading on every start, 1s clear hold, Slay/Next-level labels ([2872799](https://github.com/Caputchin/games/commit/28727991f2aa5a638f10d2d059ad9ca81e0aa10b))
* **phobos:** rework E1M2 into terraced terrain (multiple holes + tall steps) ([c0a934b](https://github.com/Caputchin/games/commit/c0a934b658dbe5db4bce09588e313f31826cfe4d))
* **phobos:** seeded spawn-point markers + two corridor mazes for bonus levels ([313e6d4](https://github.com/Caputchin/games/commit/313e6d46004c195ddb5d33d7f00bd0d65d2b8378))


### Bug Fixes

* **games:** read split .caputchin presets directly in config + tests for 5 games ([fb375bf](https://github.com/Caputchin/games/commit/fb375bf11e2dcd919ee16d959ac16edbe6b95afd))
* **games:** widen skin helper param types for ResolvedSkin scalar values ([b847870](https://github.com/Caputchin/games/commit/b8478700e027a534163e2d6ce27c497455e507b9))
* **phobos:** distinct end-screen for dying after verifying (no more win copy on a loss) ([68dec9a](https://github.com/Caputchin/games/commit/68dec9a56d0c6d829e0746e3a8ddd4eca41a139a))
* **phobos:** dying after verifying offers Replay only, not Next level ([ef51aeb](https://github.com/Caputchin/games/commit/ef51aeb56364f6cc62a2621cb90d862052f11ba2))
* **phobos:** reveal the game on Enter and silence engine console output ([afd2e0d](https://github.com/Caputchin/games/commit/afd2e0dd69594d1c837ef5c335d951bc28be3904))
* **phobos:** shallow climbable holes (-24) + texture inner feature walls (fixes HOM in pits) ([efb690c](https://github.com/Caputchin/games/commit/efb690c31473825ca4f2c152158680d84b24bb8f))
* **phobos:** simple holes arena for E1M2, spawn markers avoid all feature boxes ([66f45de](https://github.com/Caputchin/games/commit/66f45de997df8cea374aeb63172b249b773fbe90))


### Performance Improvements

* **phobos:** trim WAD to spawnable sprites so one shared WAD fits the replay artifact cap ([c2fe805](https://github.com/Caputchin/games/commit/c2fe805e6793e777f96cf1cc738c953d6fc4ca25))


### Code Refactoring

* **games:** migrate register() calls to the manifest-less signature ([a527b11](https://github.com/Caputchin/games/commit/a527b11930315d8de9b958a559e7d3a12a112310))
