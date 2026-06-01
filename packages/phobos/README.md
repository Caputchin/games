# Phobos

Clear the demons to prove you're human. A Caputchin first-party game that drops
the visitor into a real, first-person **DOOM** arena: true 3D, the iconic
shotgun, and demons closing in.

> **License:** Phobos is **GPL-2.0-only** (it links the open-source DOOM
> engine). Embedding it through the standard check does not place your own site
> under the GPL. See [Licensing](#licensing).

## How it plays

You spawn in the middle of a demon-infested arena, shotgun in hand. Move, turn,
and fire to clear the wave. It is the genuine DOOM feel: 3D rooms with a raised
platform and varied tech-base walls, charging imps and pinkies, the heads-up
display, and DOOM's classic auto-aim (line a demon up horizontally and the shot
lands, no precise vertical aiming). Kill the target number of demons and the
round is **Verified** - then keep playing as long as you like.

Every round is different. The demons are placed fresh from a one-time secret the
server issues for that attempt, so no two challenges are the same and a layout
you have seen before will not come back.

| Action | Keyboard | Touch |
|---|---|---|
| Move / strafe | `W` `A` `S` `D` or arrow keys | the on-screen pad |
| Turn | `A` / `D` or `Left` / `Right` | the turn buttons |
| Fire | `Space`, `Ctrl`, or click | the fire button, or tap the view |

## Why it's a strong check

The score is never taken on trust. When you finish, the server **re-plays your
actual run** inside a sandboxed copy of the same DOOM sim and accepts only the
result it recomputes. A bot cannot post a fake "I won" - it has to produce an
input that genuinely clears the arena. And because the demons are positioned
from that per-attempt secret, a pre-recorded playthrough fails: the monsters are
somewhere else, so the recorded shots miss.

## Customization

Everything is driven by [`caputchin.json`](caputchin.json) and resolved by the
widget per site:

- **Difficulty** - kills required to pass, DOOM skill (1-5), how many demons
  spawn, fast monsters, respawning monsters, which arena, and an optional time
  limit. The challenge can be as quick or as punishing as the site wants.
- **Locales** - all on-screen text (start screen, controls hint, Verified
  badge) ships in the 11 official languages and is fully overridable.
- **Skins** - light and dark chrome presets the host picks; colors for the
  background, HUD, buttons, and the Verified badge.

## Accessibility and support

- **Keyboard and touch**: full WASD / arrow-key play on desktop, and a large
  on-screen control pad with fire on mobile (multi-touch, so you can turn and
  fire together).
- **Fixed size**: a fixed 16:10 view (native 640x400). It scales down to fit a
  narrower embed but always keeps that aspect ratio and never exceeds its native
  size; it does not reflow, so it is not a responsive layout. Give it room.
- **Sound**: short SFX (shots, demons, doors) with an on-screen mute toggle, so
  audio is optional and off-by-a-tap.
- Phobos is a fast visual shooter, so it is **not** screen-reader solvable -
  sites that need a non-visual challenge should pair it with an accessible
  alternative.

## Add it to your site

Phobos runs as a sandboxed widget behind a Caputchin verification check. Preview
it live and copy the embed snippet, with your locale, skin, and difficulty
presets, from its [marketplace listing](https://caputchin.com/marketplace).

## Licensing

Phobos links the open-source **DOOM engine**, which is GPL-licensed, so the game
is **GPL-2.0-only**.

What this means if you embed Phobos:

- **Your site is unaffected.** Phobos runs in Caputchin's sandboxed iframe, so
  the standard check does not place your site under the GPL.
- **Caputchin carries the obligation.** As the distributor, Caputchin publishes
  the complete corresponding source (the engine included) in this package's
  `engine/` directory.
- **Re-hosting is the exception.** If you download and serve the Phobos bundle
  yourself, you become the distributor and take on the GPL-2.0 obligations
  directly.

The game ships with no warranty, as stated in the GPL. The full license text is
in [`LICENSE`](LICENSE), with engine and game-data attribution in
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

---

DOOM is a trademark of id Software LLC; Phobos is not affiliated with or endorsed
by id Software, ZeniMax, or Microsoft. It is built on the open-source DOOM engine
and free, libre **Freedoom** game data - no id artwork or game files. See
[`TRADEMARK.md`](TRADEMARK.md) and [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).
