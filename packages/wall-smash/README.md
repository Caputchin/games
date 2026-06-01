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
number of walls before the timer runs out and you pass. The countdown only starts
once you launch the first ball, so there is no rush while you read the board.

A heads-up display along the top shows your remaining lives, the time left, the
current wall, and your score, plus a button to mute the sound. On-screen prompts
(built with the engine's own UI, not a web overlay) walk you through the round: a
launch hint, a "Level N" toast between walls, a verified screen when you pass, and
a round-over screen with a retry button if you run out of lives or time.

The launch angle and the starting wall layout are both seeded by the server, so
the first bounce and the brick pattern differ every session: a memorized winning
run does not transfer to a fresh challenge. The board is tuned to be solved in
seconds, not minutes.

| Input | Keyboard | Mouse | Touch |
|---|---|---|---|
| Move paddle | hold `Left`/`Right` or `A`/`D` | hold the left button and slide (paddle tracks the cursor) | touch and slide (paddle tracks your finger) |
| Launch ball | `Space` / `Up` | click the board | tap the board |

### Keep playing

Once you have passed, the verified screen offers a **Keep playing** button that
drops you into endless bonus walls: untimed, no lives lost, each one a little
harder than the last. It is purely for fun and never affects the verification
(that was already submitted on the pass), so play as long as you like.

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
  the solve time limit, and sound on/off (a player can also mute from the in-game
  button). Ships with `default`, `casual`, and `hardcore` presets. (The 2D/3D look
  is a skin, not a configuration; see above.)
- **Languages**: the HUD and on-screen prompts ship in 11 locales (English,
  Spanish, French, German, Portuguese, Russian, Arabic, Indonesian, Chinese,
  Japanese, Korean), rendered by the engine from a compact embedded multi-script
  font, with right-to-left support for Arabic. The widget picks the language from
  the visitor's locale.

## Accessibility and support

Keyboard-, mouse-, and touch-operable, fully responsive (it reflows to any widget
size and reframes the 3D camera live), with optional sound the site or player can
disable. A hidden live region announces the game state (launch, level, life lost,
verified, round over) to screen readers in the visitor's language, so the round is
followable without sight. The core challenge is still a real-time aim-and-reflex
task, so it is **not** screen-reader *solvable*; pair it with an accessible
alternative challenge where that matters.

## Add it to your site

Wall Smash embeds with a single element and runs sandboxed behind a Caputchin
verification check, the same as every game in the pack. Preview it live and copy
its embed snippet from the [Caputchin marketplace](https://caputchin.com/marketplace).

## License

MIT, see [LICENSE](LICENSE). Built on the Bevy engine (MIT/Apache-2.0); all
in-game art is generated procedurally at runtime, and the only bundled asset is a
subset of the Noto Sans fonts (SIL Open Font License 1.1) for the on-screen text.
See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
