# Wall Smash

Bounce the ball off your paddle to smash every brick before time runs out. A
Caputchin first-party game, and a Breakout/Arkanoid take built on the
[Bevy](https://bevyengine.org) engine (Rust compiled to WebAssembly), with two
distinct looks: a flat top-down retro board and a real 3D arcade arena.

## How it plays

The ball starts stuck to your paddle at the bottom of the arena. Launch it, then
keep it in play by sliding the paddle under it, and clear the whole brick wall.
Where the ball strikes the paddle sets its rebound angle, so you aim by position.
Clear one wall and the next (a different pattern) drops in; clear the configured
number of walls before the timer runs out and you pass.

The launch angle is seeded by the server, so the very first bounce differs every
session: a memorized winning run does not transfer to a fresh challenge. The
board is tuned to be solved in seconds, not minutes.

| Input | Keyboard | Touch |
|---|---|---|
| Move paddle | hold `Left`/`Right` or `A`/`D` | touch and slide (the paddle tracks your finger) |
| Launch ball | `Space` / `Up` | tap the board |

## The two looks

The look is a **skin** the site picks (the `retro` light-theme skin or the
`modern` dark-theme skin), so it switches with the rest of the site's theming:

- **Retro** (the light-theme skin) is a flat, top-down board (the classic arcade
  read): blue grid field, colored brick rows, a cylinder paddle, a glowing ball.
  It runs on every device, including machines with software-only WebGL.
- **Modern** (the dark-theme skin) is a real 3D arena viewed from a top corner,
  with lit blocks, bloom, and contact shadows. It needs a hardware GPU; on a
  software-only renderer the game automatically serves the smooth retro look
  instead. Either look plays identically and replays the same on the server.

## Customization

Everything is driven by [`caputchin.json`](caputchin.json) and resolved by the
widget into the game's runtime context:

- **Skins**: every color is a site-settable preset. `background` and `accent`
  (the glow and break-particle color) always apply; `ball` and `paddle` recolor
  those pieces; an optional `brick` color recolors the whole wall to one shaded
  hue, and leaving it unset keeps the default multi-color arcade wall. Ships with
  `retro` and `modern` color presets.
- **Configurations**: paddle width, ball speed, number of walls to clear, lives,
  the solve time limit, and sound on/off. Ships with `default`, `casual`, and
  `hardcore` presets. (The 2D/3D look is a skin, not a configuration; see above.)

There is no on-screen text to translate: the game is played entirely on the
board, so it needs no locale pack and reads the same in every language.

## Accessibility and support

Keyboard- and touch-operable, fully responsive (it reflows to any widget size
and reframes the 3D camera live), with optional sound the site can disable. The
core challenge is a real-time aim-and-reflex task, so it is **not** screen-reader
solvable; pair it with an accessible alternative challenge where that matters.

## Add it to your site

Wall Smash embeds with a single element and runs sandboxed behind a Caputchin
verification check, the same as every game in the pack. Preview it live and copy
its embed snippet from the [Caputchin marketplace](https://caputchin.com/marketplace).

## License

MIT, see [LICENSE](LICENSE). Built on the Bevy engine (MIT/Apache-2.0); all
in-game art is generated procedurally at runtime. See
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
