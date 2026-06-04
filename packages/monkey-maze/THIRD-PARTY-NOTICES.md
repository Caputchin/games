# Third-party notices

## melonJS (bundled engine)

Monkey Maze runs on the [melonJS](https://melonjs.org) HTML5 game engine, which is
bundled into the game's distributed artifacts (`dist/monkey-maze.js` and
`dist/run.js`). melonJS is distributed under the MIT License:

> Copyright (C) 2011 - 2024, Olivier Biot, Jason Oster, Aaron McLeod
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

See <https://github.com/melonjs/melonJS/blob/master/LICENSE> for the full text.

## Character sprites

- **Source:** Kenney Animal Pack Remastered (https://kenney.nl/assets/animal-pack-remastered)
- **Author:** Kenney (https://kenney.nl)
- **License:** Creative Commons Zero v1.0 Universal (CC0 1.0, public domain dedication; https://creativecommons.org/publicdomain/zero/1.0/)
- **Files used:** the `monkey` (runner), `frog`, `parrot`, `snake`, and `sloth` (chaser) sprites (Round style), inlined as `data:image/png` URIs under `src/assets/` at build time.

CC0 places these assets in the public domain: no attribution is required. This
notice is provided as a courtesy and to record provenance.

The maze, dots, walls, and the frightened/eaten chaser states are drawn
procedurally by the game's own code (flat shapes). No third-party audio is
included.
