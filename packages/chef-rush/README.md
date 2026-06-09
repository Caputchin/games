# Chef Rush

A fast kitchen on a deadline. Dishes pop up at your stations, each with an arrow.
Slash the dish the way its arrow points before it spoils, and never touch a dish
marked with an X. Clear enough orders and you have proven you are human.

Chef Rush is a Caputchin first-party captcha game, built on the
[Excalibur.js](https://excaliburjs.com) engine. Like every Caputchin game it runs
sandboxed in the verification widget and ships zero tracking.

## How it plays

- Dishes appear one at a time at four kitchen stations, faster as the round goes on.
- A good dish shows a direction arrow. Press on its station and flick in the
  arrow's direction to cook and serve it.
- A spoiled dish shows an X. Leave it alone. Flicking a spoiled dish ends the round.
- A good dish you ignore eventually spoils and costs a life.
- Serve the target number of dishes before you run out of lives or time, and the
  check passes.

### Controls

| Action | Mouse | Touch |
|---|---|---|
| Serve a dish | press on the station, flick toward the arrow | tap the station, swipe toward the arrow |
| Skip a spoiled dish (X) | do nothing | do nothing |

Chef Rush is a pointer game: it is played entirely with a mouse or a finger.
There are no keyboard controls (see Accessibility below).

## Customization

Site owners can tune the round from the dashboard:

- **Dishes to verify** how many correct serves pass the check.
- **Lives** how many mistakes are allowed.
- **Dish pace** and **Time per dish** how busy and how tight the kitchen is.
- **Spoiled chance** how many decoy dishes appear.
- **Round length** the overall time budget.
- **Sound effects** on or off.

It also ships color skins (a dark kitchen and a light diner) and full text in
every Caputchin-supported language.

## Accessibility and support

- **Responsive:** the kitchen fills any container and adapts to portrait or
  landscape, with no fixed canvas.
- **Touch:** every action is a first-class touch gesture, sized for fingers.
- **Keyboard:** not supported. Serving is a directional flick that has no faithful
  keyboard equivalent, so Chef Rush is pointer-only by design. Sites that need a
  keyboard-only challenge can pick a different game from the pack.
- **Screen reader:** the play itself is visual and gestural and is not screen-reader
  solvable, but game state (served, spoiled, verified) is announced in a live
  region for context.
- **Audio:** optional. Every sound has a visual equivalent, so the game is fully
  playable muted.

## Add it to your site

Browse Chef Rush, preview it live, and copy its embed snippet from the
[Caputchin marketplace](https://caputchin.com/marketplace). It drops in as a
single sandboxed element behind your verification check.
