# Blockfall

A falling-blocks puzzle that doubles as a captcha. Slide and rotate the seven
tetromino shapes, pack them into clean rows, and clear lines. Clear enough lines
and you are verified as human, then you can keep playing for the score.

Blockfall is a Caputchin first-party game, built on the [KAPLAY](https://kaplayjs.com)
engine to show the platform can host an arbitrary deterministic engine.

## How it plays

Pieces fall into the well one at a time. Move and rotate the falling piece to
complete a full horizontal row, which clears and drops everything above it.
Clearing the configured number of lines (two by default) satisfies the captcha.
The round ends if the stack reaches the top.

| Action | Keyboard | Touch |
|---|---|---|
| Move left / right | Left / Right arrow (or A / D) | Left / right buttons |
| Soft drop | Down arrow (or S) | Soft-drop button (hold) |
| Hard drop | Space | Hard-drop button |
| Rotate clockwise | Up arrow (or X / W) | Rotate button |
| Rotate counter-clockwise | Z | (rotate clockwise repeatedly) |

Hold left or right to slide continuously. Hold soft drop to fall faster. Hard
drop slams the piece to the bottom and locks it.

## Customization

A site owner can tune Blockfall from the dashboard:

- **Lines to verify**, board **width** and **height**, fall speed, and lock
  delay (see the configuration presets: casual, marathon, wide).
- **Skins** restyle the well, text, and the seven block colors (dark, mono, and
  a light daylight theme ship by default).
- **Locales**: the full official language set ships, English by default, with
  the right script and direction handled automatically.

## Accessibility and support

- **Responsive**: the board and controls reflow to any container size and aspect
  ratio, portrait or landscape, with no fixed canvas.
- **Touch**: fully playable on a phone through the on-screen controls, sized for
  fingers; nothing needs a keyboard or mouse.
- **Keyboard**: every action is reachable from the keyboard.
- **Screen reader**: line clears, the verified moment, and game over are spoken
  through a live region. The falling-block play itself is visual and real-time,
  so the board state is not fully solvable by a screen reader alone; this is
  declared honestly in the support flags.
- **Audio**: the game is fully playable with no sound; audio is never the only
  channel for any cue.

## Add it to your site

Blockfall runs inside the Caputchin sandboxed widget. Pick it for your site key
in the dashboard, or embed it through the marketplace. The player's inputs are
re-simulated on the server to verify the round, so the verification is
tamper-resistant without sending us any personal data.
