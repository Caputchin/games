# Whack-a-Monkey

Tap the monkeys as they peek out of the bushes, leave the other jungle animals
alone. A Caputchin first-party game, written clean-room in framework-free
TypeScript and rendered on a 2D canvas so the play field is opaque to DOM
scrapers.

## How it plays

Animals pop up from a fixed 3x3 grid of holes set into a jungle canopy. Most are
monkeys (the targets); some are decoys (a frog, parrot, snake, or sloth) that you
must leave alone. Each pop-up springs up, stays visible for a short window, then
ducks back down. Tap a monkey while it is up to whack it; tap a decoy, and you are
docked points and lose 2 seconds off the clock.

You pass by whacking the configured **goal** number of monkeys before the timer
runs out. Clear that goal and the round reports success and lights a **Verified**
badge; let the clock hit zero first and the round ends with a **Try again**
screen. Difficulty climbs across three internal levels as you progress: pop-ups
get shorter, spawn faster, and decoys grow more common (up to a fair cap), so the
later monkeys are harder to catch than the first.

Scoring rewards clean, fast aim: each monkey is worth a base score plus a timing
bonus for tapping it quickly after it emerges. A wrong tap on a decoy subtracts
points and time. The header can show the monkeys-whacked goal counter and the
current level (both toggleable). Sound effects (whack / miss / verify) are
synthesized at runtime with no audio files, and an in-game mute button (plus a
host config) turns them off.

| Input | Mouse | Touch |
|---|---|---|
| Whack an animal | click it while it is up | tap it while it is up |
| Start / retry | click the button | tap the button |

## Determinism

The game runs a fixed logical world (800x450) advanced by a fixed logical
timestep, never per real frame: the live driver uses a fixed-step accumulator and
the server replays the exact same ticks, so the live score equals the replayed
score by construction. Which holes pop, when, and whether each is a monkey or a
decoy are all driven by the server seed, so every session differs and a memorized
run does not transfer to a fresh challenge. This is enforced by the sim tests; do
not reintroduce any per-frame coupling.

## The look

The look is a **skin** the site picks (a light-theme jungle and a dark-theme
jungle), so it switches with the rest of the site's theming. Both render the same
canopy gradient, tinted foliage layers for depth, the animal grid, hit-burst
particles, and a decoy-flash overlay; only the palette differs.

## Customization

Everything is driven by [`caputchin.json`](caputchin.json) and resolved by the
widget into the game's runtime context:

- **Skins**: every color is a site-settable preset, the background and canopy
  gradient, the foliage tints, the hit-particle and decoy-flash colors, and the
  button and focus-ring colors. Each animal sprite (monkey and the four decoys)
  can also be overridden with custom art; leave it unset to use the bundled
  sprite. Ships with `light` and `dark` presets.
- **Configurations**: the pass goal, the level-1 pop-up uptime, the level-1 decoy
  chance, the round time limit, sound on/off, and whether the goal/level counters
  show. Ships with `default` (the default), `easy`, `medium`, and `hard` presets.
- **Languages**: the header, screens, and screen-reader copy ship in 11 locales
  (English, Spanish, French, German, Portuguese, Russian, Arabic, Indonesian,
  Chinese, Japanese, Korean), with right-to-left support for Arabic. The widget
  picks the language from the visitor's locale, and a hardcoded English fallback
  covers any unresolved string.

## Accessibility and support

Mouse- and touch-operable, fully responsive (the canvas reflows to any widget
size), with optional sound the site or player can disable and a reduced-motion
mode. A polite live region announces the round state (start, whack, wrong tap,
level up, verified, round over) to screen readers in the visitor's language. The
core challenge is still a real-time tap-and-reflex task, so it is **not**
screen-reader *solvable*; pair it with an accessible alternative challenge where
that matters.

## Add it to your site

Whack-a-Monkey embeds with a single element and runs sandboxed behind a Caputchin
verification check, the same as every game in the pack. Preview it live and copy
its embed snippet from the [Caputchin marketplace](https://caputchin.com/marketplace).

## License

MIT, see [LICENSE](LICENSE). The animal and foliage sprites are from Kenney
(Creative Commons Zero, public domain); see
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
