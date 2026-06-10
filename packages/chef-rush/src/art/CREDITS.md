# Art credits

The ingredient sprites in `sprites/` are from **Glitch** (the game by Tiny Speck,
now Slack). Tiny Speck released the Glitch art into the public domain under
**CC0 1.0** (there is no obligation to credit, but we do so gladly).

- Source: <https://www.glitchthegame.com/public-domain-game-art/>
- OpenGameArt mirror (Food & Drink, SVG): <https://opengameart.org/node/20149>
- License: CC0 1.0 Universal (public domain dedication). No attribution required,
  no copyleft, free for commercial use.

The SVG originals were rasterized to right-sized PNGs (192px) and color-quantized
for the widget bundle; no artistic alteration was made. The kitchen itself (counter,
wall, stove, cookware, plate, HUD) is drawn procedurally in `../render.ts`.

The sprites are inlined into `../sprites.generated.ts` as base64 data-URIs by
`../../scripts/gen-sprites.mjs`.
