# Third-party notices

Voidshot bundles the third-party code and 3D models listed below. The arena,
effects, and HUD are drawn procedurally and all audio is synthesized; the player
gunship and enemy drone meshes are bundled CC-BY models, credited below.

## Rust crates (compiled into voidshot.wasm)

- rapier3d, parry3d (Dimforge and contributors); licensed Apache-2.0; https://rapier.rs
- nalgebra, simba (Dimforge and contributors); licensed Apache-2.0; https://nalgebra.org
- caputchin-replay-rs (Caputchin); licensed Apache-2.0

## JavaScript (bundled into dist/voidshot.js)

- OGL (Nathan Gordon "oframe" and contributors); released into the public domain
  under the Unlicense; https://unlicense.org
- @caputchin/game-sdk, @caputchin/replay-contract, @caputchin/replay-wasm
  (Caputchin); licensed Apache-2.0

## 3D models (bundled into dist/voidshot.js)

Both models are by Aaron Clifford, licensed Creative Commons Attribution 3.0
(CC-BY 3.0; https://creativecommons.org/licenses/by/3.0/), via Poly Pizza
(https://poly.pizza). They are inlined as binary glTF (src/assets/*.glb).

- "Hover Fighter: Beetle" (the player gunship); https://poly.pizza/m/9teac58P9uv
- "Stinger Drone" (the enemy drones); https://poly.pizza/m/6CUQX98vha4
