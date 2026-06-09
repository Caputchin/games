# Chef Rush

A fast kitchen on a deadline. An order ticket shows the ingredients a dish needs.
Ingredients land on your cutting board, the right ones mixed in with wrong ones and
rotten ones. Chop what the order needs, skip the rest, and serve enough orders to
prove you are human.

Chef Rush is a Caputchin first-party captcha game, built on the
[Excalibur.js](https://excaliburjs.com) engine. Like every Caputchin game it runs
sandboxed in the verification widget and ships zero tracking.

## How it plays

- The order ticket at the top shows the ingredients the current dish needs.
- Ingredients appear on the cutting board, faster as the round goes on.
- **Chop** an ingredient by swiping across it. Chop the ones the order needs to
  prep them.
- Leave the **wrong** ingredients (not on the order) and the **rotten** ones (mould
  and flies) alone. Chopping a wrong or rotten ingredient costs a life.
- A needed ingredient you let slip off the board also costs a life.
- Chop everything an order needs to serve it, then a new order comes up. Serve the
  target number of orders before you run out of lives or time, and the check passes.

### Controls

| Action | Mouse | Touch |
|---|---|---|
| Chop an ingredient | swipe across it | swipe across it |
| Skip a wrong / rotten ingredient | do nothing | do nothing |

Chef Rush is a pointer game: it is played entirely with a mouse or a finger.
There are no keyboard controls (see Accessibility below).

## Customization

Site owners can tune the round from the dashboard:

- **Orders to verify** how many orders a visitor must complete to pass.
- **Lives** how many mistakes are allowed.
- **Recipe size** how many ingredients each order needs.
- **Dish pace** and **Time per ingredient** how busy and how tight the board is.
- **Spoiled chance** how many wrong or rotten ingredients appear.
- **Round length** the overall time budget.
- **Sound effects** on or off.

It also ships color skins and full text in every Caputchin-supported language.

## Accessibility and support

- **Responsive:** the kitchen fills any container and adapts to portrait or
  landscape, with no fixed canvas.
- **Touch:** every action is a first-class touch gesture, sized for fingers.
- **Keyboard:** not supported. Chopping is a free swipe with no faithful keyboard
  equivalent, so Chef Rush is pointer-only by design. Sites that need a
  keyboard-only challenge can pick a different game from the pack.
- **Screen reader:** the play itself is visual and gestural and is not screen-reader
  solvable, but game state (order served, wrong ingredient, verified) is announced
  in a live region for context.
- **Audio:** optional. Every sound has a visual equivalent, so the game is fully
  playable muted.

## Add it to your site

Browse Chef Rush, preview it live, and copy its embed snippet from the
[Caputchin marketplace](https://caputchin.com/marketplace). It drops in as a
single sandboxed element behind your verification check.
