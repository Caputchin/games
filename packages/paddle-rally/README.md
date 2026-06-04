# Paddle Rally

Rally the ball to prove you're human. Paddle Rally is a Pong-style Caputchin captcha built on the Phaser engine, one of the first-party Core Pack games. It ships two modes, chosen by the site owner:

- **Rival** (default): classic Pong against a CPU paddle, first to the target points. A deliberate flick of your paddle puts spin on the ball to out-skill the rival; a held key cannot.
- **Solo:** no rival. The right side is a wall; keep the ball alive and survive a target number of returns. The ball runs faster here, since there's no rival to outrun, so it's a pure reflex test.

## How it plays

**Rival:** keep the ball in play and slip it past your rival's paddle to score. First to the target (three points by default) wins and clears the check; a sharp flick angles the ball where the rival isn't. After a win you can keep rallying in a relaxed endless mode that isn't scored.

**Solo:** the ball bounces off the right wall back to you; keep returning it. Survive the target number of returns (five by default) and you clear the check; miss once and you retry. The ball ranges the full court and speeds up, so it rewards tracking.

| Action | Keyboard | Touch / pointer |
|---|---|---|
| Move your paddle up | Up arrow or W | drag up |
| Move your paddle down | Down arrow or S | drag down |
| Keep playing after a round | Space | tap |

Your paddle is on the left.

## Customization

Site owners can tune Paddle Rally from the marketplace, no code required:

- **Gameplay** (configurations): mode (rival or solo), points to win / returns to survive, paddle speed, difficulty, and sound. Presets: `default` (rival), `hardcore` (rival), `solo`, `solo-fast`.
- **Languages** (locales): ships the full official language set (English plus ten more). Pick one, or let it follow the visitor's browser.
- **Look** (skins): court, paddle, and ball colors, in dark and light themes. Presets: `default`, `night`, `sandlot`.

## Accessibility and support

- **Keyboard:** fully playable with the arrow keys (or W and S) and space.
- **Touch:** fully playable by dragging anywhere on a phone or tablet.
- **Responsive:** fills any container size and aspect ratio, portrait or landscape, with no letterboxing.
- **Screen reader:** the score and each serve are announced through a live region, and the play area carries a descriptive label. The announcer follows the active language and reading direction.
- **Audio:** optional. Short procedural blips mark the serve, paddle hits, and wall bounces; turn them off with the sound setting. Every cue is also shown on screen, so Paddle Rally is fully playable muted.

## Security model

Paddle Rally is a *skill* check: it filters non-playing input, not all automation. Be clear-eyed about what that means. Both modes share the same posture.

- **What it stops, by construction:** a paddle that sits still or holds one direction never wins. In rival mode it imparts no flick, so its shots stay soft and the rival always returns them; in solo mode the ball ranges the full court, so a still paddle is always left behind. Non-playing input loses, in either mode.
- **What it does not claim:** Paddle Rally is not a Turing test. A program that genuinely tracks and returns the ball plays the way a person does and can pass, as it could for any skill-based challenge. A random/erratic bot can also luck through at a small, bounded rate (a few percent at the easiest settings, lower at the defaults). It is a probabilistic filter, not a proof.
- **Where it fits:** the game is one signal. Caputchin combines it with behavioral and server-side checks; it is never the sole line of defense.
- **Why a win can't be forged:** the verdict is recomputed by deterministic server-side replay of your recorded inputs, so the result cannot be faked in the browser.

## Add it to your site

Paddle Rally embeds like any Caputchin game: a single element, sandboxed behind a Caputchin verification check, with zero tracking. Browse the pack, preview Paddle Rally live, and copy its embed snippet from the [Caputchin marketplace](https://caputchin.com/marketplace).
