// PNG sprites (the Kenney CC0 capuchin + jungle-critter set) are inlined as
// `data:image/png` URIs by tsup's `dataurl` loader (configured in
// tsup.config.ts), so the game ships as one self-contained bundle under the
// iframe CSP (which forbids fetching assets). Each import resolves to the
// data-URI string at build time; art.ts feeds it to `new Image()` and game.ts
// draws it with `ctx.drawImage`. Raster, so no decode / sanitize step.
declare module '*.png' {
  const dataUri: string;
  export default dataUri;
}
