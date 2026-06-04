# Monkey Maze

Clear the maze of dots while the chasers hunt you. Grab a power dot and, for a
few seconds, the hunt flips: the chasers flee and you can catch them. Reach the
goal score and you have proven you are human.

Monkey Maze is a Caputchin first-party game. It runs on the melonJS engine, both in
your browser and on the server that verifies the round, so the result you see is
the result the platform trusts.

## How it plays

Steer the runner through the maze, eating dots for points. Four chasers patrol
the maze and switch between scattering to their corners and hunting you. A power
dot turns them vulnerable for a short window, where eating one is worth a big
bonus. The round is won the moment your score reaches the goal.

| Action | Keyboard | Touch |
|---|---|---|
| Move up | Up arrow or W | Up on the on-screen pad |
| Move down | Down arrow or S | Down on the on-screen pad |
| Move left | Left arrow or A | Left on the on-screen pad |
| Move right | Right arrow or D | Right on the on-screen pad |
| Start / play again | Any arrow key | Tap the maze or a pad button |

## Customization

A site embedding Monkey Maze can tune it without touching code:

- **Goal score** and **number of chasers**, via the game's configuration presets
  (for example a quick, low-goal round or a tougher challenge).
- **Colors**, via skin presets (Midnight, Daybreak, Grove, or a custom palette).
- **Language**, via locale presets covering the official Caputchin languages.

## Accessibility and support

- **Responsive**: the maze fills its container on any screen, portrait or
  landscape, with no fixed pixel stage.
- **Touch**: fully playable by touch with an on-screen direction pad sized for
  fingers. No keyboard or mouse is required to finish a round.
- **Keyboard**: every action is reachable with the arrow keys or WASD.
- **Screen reader**: the play area is labelled, and score, dots remaining, and
  state changes (start, power dot, verified, caught, cleared) are announced.
- **Audio**: optional. The game is fully playable muted; every cue has a visual
  equivalent.

## Add it to your site

Monkey Maze embeds like every Caputchin game: a single sandboxed widget that runs
the verification check for you. Browse the pack, preview it live, and copy its
embed snippet from the [Caputchin marketplace](https://caputchin.com/marketplace).
