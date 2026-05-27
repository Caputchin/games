// SVG files are inlined as data URIs by tsup's `dataurl` loader (configured
// in tsup.config.ts). The game decodes them back to SVG markup at runtime
// so `fill="currentColor"` inside the source SVG inherits the skin's
// current color through normal CSS - `<img src>` would NOT inherit.
declare module '*.svg' {
  const dataUri: string;
  export default dataUri;
}

// Ogg sound effects are inlined as `data:audio/ogg;base64,…` URIs by the same
// dataurl loader; the audio module decodes them via the Web Audio API.
declare module '*.ogg' {
  const dataUri: string;
  export default dataUri;
}
