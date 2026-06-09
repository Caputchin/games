# Caputchin Core Pack

The official first-party game pack for the [Caputchin](https://caputchin.com) marketplace. Built playful, accessible, and surveillance-free: every game is responsive, touch-ready, keyboard friendly, screen-reader friendly where the gameplay allows, and ships zero tracking.

## Games in this pack

| Game | What it is |
|---|---|
| [Leaf Memory](packages/leaf-memory/) | Match pairs of tropical leaves before the timer runs out. |
| [Dino Runner](packages/dino-runner/) | Jump the cactus, duck the birds, and run as far as you can. |
| [Fruit Slash](packages/fruit-slash/) | Swipe to slice the flying fruit, avoid the bombs. |
| [Whack-a-Monkey](packages/whack-a-monkey/) | Tap the monkeys as they peek out, leave the jungle animals alone. |
| [Phobos](packages/phobos/) | Clear the demons to prove you're human. A real DOOM-engine captcha. |
| [Wall Smash](packages/wall-smash/) | Bounce the ball off your paddle to smash every brick before time runs out. |
| [Monkey Maze](packages/monkey-maze/) | Chomp every banana through the jungle maze while the critters hunt you. Grab a power-coconut to turn the tables. |
| [Paddle Rally](packages/paddle-rally/) | Table-tennis captcha: out-rally a CPU paddle, or keep the ball alive solo. Built on Phaser. |
| [Blockfall](packages/blockfall/) | Stack the falling blocks and clear lines to prove you're human. |
| [Voidshot](packages/voidshot/) | Pilot your drone through a neon swarm and clear every wave before your shield burns out. Built on rapier3d + OGL. |
| [Chef Rush](packages/chef-rush/) | Read the order and chop the ingredients it needs as they hit the board, skipping the wrong and rotten ones. Built on Excalibur.js. |

More games land here over time. Each one is browsable and embeddable on its own from the [Caputchin marketplace](https://caputchin.com/marketplace).

## Using these games

Every game embeds with a single element and runs sandboxed behind a Caputchin verification check. Browse the pack, preview each game live, and copy its embed snippet from the [marketplace](https://caputchin.com/marketplace).

## Contributing

Building a game for this pack? [CONTRIBUTING.md](CONTRIBUTING.md) covers the repo layout, build, and the non-negotiable design constraints.

## License

This is a multi-license monorepo. **Each game ships its own [`LICENSE`](LICENSE)
file, which is authoritative for that package.** Most games are MIT; Phobos is
GPL-2.0-only because it links the open-source GPL DOOM engine.

| Game | License |
|---|---|
| [Leaf Memory](packages/leaf-memory/) | MIT |
| [Dino Runner](packages/dino-runner/) | MIT |
| [Fruit Slash](packages/fruit-slash/) | MIT |
| [Whack-a-Monkey](packages/whack-a-monkey/) | MIT |
| [Phobos](packages/phobos/) | GPL-2.0-only |
| [Wall Smash](packages/wall-smash/) | MIT |
| [Monkey Maze](packages/monkey-maze/) | MIT |
| [Paddle Rally](packages/paddle-rally/) | MIT |
| [Blockfall](packages/blockfall/) | MIT |
| [Voidshot](packages/voidshot/) | MIT AND Apache-2.0 AND Unlicense |

The repository-level [`LICENSE`](LICENSE) (MIT) covers the repo tooling and the
MIT games, and records the per-package map in full. Bundled third-party assets
within a game are documented in that game's `THIRD-PARTY-NOTICES.md`.
