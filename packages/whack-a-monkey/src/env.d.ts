// PNG sprites (Kenney CC0 capuchin + decoys) are inlined as `data:image/png`
// URIs by tsup's `dataurl` loader (configured in tsup.config.ts) so the game
// ships as one self-contained bundle. Each import resolves to the data-URI
// string at build time; the art module feeds it to `new Image()` and draws it
// with `ctx.drawImage`. Raster, so no decode / sanitize step (unlike the SVG
// sprites in dino-runner / leaf-memory).
declare module '*.png' {
  const dataUri: string;
  export default dataUri;
}
