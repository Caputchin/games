# Third-party notices

Fruit Slash bundles **no third-party code or assets**. All game logic, the
drawn fruit and bomb shapes, the physics constants, and all copy are original
first-party work under this repository's MIT license.

The game's projectile motion, slice geometry, and frame-rate-independent game
loop were designed clean-room from the Caputchin game SDK contract and the
`dino-runner` package conventions only. No GPL-licensed or other third-party
game source was consulted or copied while writing this package.

Optional fruit / bomb art (`art_good` / `art_hazard` skin image keys) is
supplied by the embedding customer at runtime; any such image is the customer's
own asset and is neither bundled nor redistributed here. With no art keys set
the game draws its built-in shapes.
