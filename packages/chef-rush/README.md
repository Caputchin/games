# Chef Rush

A fast kitchen on a deadline. An order ticket shows the ingredients a dish needs.
Each ingredient appears at its own station, the right ones mixed in with wrong ones
and rotten ones. Cook what the order needs with the matching gesture, skip the rest,
and serve enough orders to prove you are human.

Chef Rush is a Caputchin first-party captcha game, built on the
[Excalibur.js](https://excaliburjs.com) engine. Like every Caputchin game it runs
sandboxed in the verification widget and ships zero tracking.

## How it plays

- The order ticket at the top shows the ingredients the current dish needs.
- Ingredients appear at three stations, faster as the round goes on. Each station
  is worked with its own gesture:
  - **Cutting board** chop a vegetable with a downward slash.
  - **Pot** stir grains or pasta with a circular motion.
  - **Pan** flip meat with an upward flick.
- Perform a station's gesture on an ingredient the order needs to cook it.
- Leave the **wrong** ingredients (not on the order) and the **rotten** ones (mould
  and flies) alone. Cooking a wrong or rotten ingredient costs a life.
- A needed ingredient you let spoil at its station also costs a life.
- Cook everything an order needs to serve it, then a new order comes up. Serve the
  target number of orders before you run out of lives or time, and the check passes.

### Controls

| Station | Gesture | Mouse / Touch |
|---|---|---|
| Cutting board | Chop | slash down across the ingredient |
| Pot | Stir | drag in a circle |
| Pan | Flip | flick up |
| Skip a wrong / rotten ingredient | none | do nothing |

Chef Rush is a pointer game: it is played entirely with a mouse or a finger.
There are no keyboard controls (see Accessibility below).

## Customization

Site owners can tune the round from the dashboard:

- **Orders to verify** how many orders a visitor must complete to pass.
- **Lives** how many mistakes are allowed.
- **Recipe size** how many ingredients each order needs.
- **Dish pace** and **Time per ingredient** how busy and how tight the stations are.
- **Spoiled chance** how many wrong or rotten ingredients appear.
- **Round length** the overall time budget.
- **Sound effects** on or off.

It also ships color skins and full text in every Caputchin-supported language.

## Accessibility and support

- **Responsive:** the kitchen fills any container and adapts to portrait or
  landscape, with no fixed canvas.
- **Touch:** every action is a first-class touch gesture, sized for fingers.
- **Keyboard:** not supported. Cooking is a free gesture (chop, stir, flip) with no
  faithful keyboard equivalent, so Chef Rush is pointer-only by design. Sites that
  need a keyboard-only challenge can pick a different game from the pack.
- **Screen reader:** the play itself is visual and gestural and is not screen-reader
  solvable, but game state (order served, wrong ingredient, verified) is announced
  in a live region for context.
- **Audio:** optional. Every sound has a visual equivalent, so the game is fully
  playable muted.

## Add it to your site

Browse Chef Rush, preview it live, and copy its embed snippet from the
[Caputchin marketplace](https://caputchin.com/marketplace). It drops in as a
single sandboxed element behind your verification check.
