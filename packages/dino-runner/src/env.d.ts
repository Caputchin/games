// SVG files are inlined as data URIs by tsup's `dataurl` loader (configured
// in tsup.config.ts). The game decodes them back to SVG markup at runtime
// so `fill="currentColor"` inside the source SVG inherits the skin's
// current color through normal CSS — `<img src>` would NOT inherit.
declare module '*.svg' {
  const dataUri: string;
  export default dataUri;
}
