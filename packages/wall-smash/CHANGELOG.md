# Changelog

## [0.2.2](https://github.com/Caputchin/games/compare/wall-smash-v0.2.1...wall-smash-v0.2.2) (2026-06-04)


### Bug Fixes

* **wall-smash:** keep steering the paddle when the mouse drags outside the iframe ([b421ea9](https://github.com/Caputchin/games/commit/b421ea95204ea340369a390cd50cd3cf6023f34a))
* **wall-smash:** pass the captcha after 1 wall by default (num_levels 2 to 1) ([378e17f](https://github.com/Caputchin/games/commit/378e17fef8687c83e00583cd61d07276411b97e9))

## [0.2.1](https://github.com/Caputchin/games/compare/wall-smash-v0.2.0...wall-smash-v0.2.1) (2026-06-01)


### Bug Fixes

* gzip-compress the inlined live wasm in phobos and wall-smash to shrink the bundle entry ([6fd372d](https://github.com/Caputchin/games/commit/6fd372d2d5d3b61208031b46c974ac082b23714b))

## [0.2.0](https://github.com/Caputchin/games/compare/wall-smash-v0.1.0...wall-smash-v0.2.0) (2026-06-01)


### Features

* **games:** add wall-smash, a Bevy Breakout captcha with flat 2D and PBR 3D skins ([6afbf38](https://github.com/Caputchin/games/commit/6afbf38ab1a173e4b33560b897bf283241b0ee7b))
* **games:** register wall-smash in the pack, skin-driven 2D/3D look, iframe-fill fix ([f79beec](https://github.com/Caputchin/games/commit/f79beeca1141fe98caaf0c6fa5d4af35ede1b7ae))
* **games:** wall-smash touch drag-to-position paddle steering ([8db6730](https://github.com/Caputchin/games/commit/8db6730fe5ef138e5503a22e470f3a474afebb51))
* **wall-smash:** Bevy in-game UI (HUD, screens, restart, a11y, 11 locales) + seeded wall layout ([3fe76f6](https://github.com/Caputchin/games/commit/3fe76f623738d0415d69917b546ccd1ca0915dd7))
* **wall-smash:** center HUD timer, localize seconds unit, bake its glyphs ([3d0b620](https://github.com/Caputchin/games/commit/3d0b62014e1bdeb3e84011c5ad2dc4afab9fd066))
* **wall-smash:** grab/grabbing cursor on the game canvas ([236f2ea](https://github.com/Caputchin/games/commit/236f2ea7fd2fe07659d1782b20623e20b70c63ef))
* **wall-smash:** launch-gated timer, bonus levels, sound toggle, mouse play, localized Bevy font ([e20aeca](https://github.com/Caputchin/games/commit/e20aecaabf33933a2d7db78ce97bfccc13491c14))
* **wall-smash:** make both skins theme-agnostic (_theme "any") ([21404f9](https://github.com/Caputchin/games/commit/21404f9c14d76ca790dc2ba359811ca866961295))
* **wall-smash:** mid-screen level toast, bold infinity lives, no fail cue in bonus ([c6b12c2](https://github.com/Caputchin/games/commit/c6b12c248acb8d67a4dbd4822041932e48d5e9ac))


### Bug Fixes

* **games:** wall-smash 3D camera fills the smaller viewport dimension (corner-fit framing) ([9242ed8](https://github.com/Caputchin/games/commit/9242ed89a301019ea68e754530ab2b0548f1690a))
* **wall-smash:** play the miss/fail sound when a ball drops in bonus play ([269865d](https://github.com/Caputchin/games/commit/269865d769ad6618bf796ccf243b57bf6c816195))
