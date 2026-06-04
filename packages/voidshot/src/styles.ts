// Scoped CSS for the canvas + HUD overlay. Injected once per mount. The arena
// canvas fills the container on both axes (responsive); the HUD is a pointer-
// transparent overlay except for its buttons.
//
// The game owns the whole iframe, so html + body must carry a full height -
// `height:100%` on the container only resolves if every ancestor has a height,
// otherwise the absolutely-positioned canvas collapses the container to 0 and
// nothing is visible. The host runtime sizes the iframe (from `preferred` or the
// layout), so 100% then flows down to the canvas.

export function styleSheet(accent: string): string {
  return `
html,body{height:100%;margin:0;}
.vs-root{position:relative;width:100%;height:100%;overflow:hidden;background:#05060f;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;touch-action:none;user-select:none;-webkit-user-select:none;}
.vs-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;}
.vs-hud{position:absolute;inset:0;pointer-events:none;color:#fff;}
.vs-top{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 14px;font-size:14px;font-weight:600;}
.vs-readout{background:rgba(5,8,20,.58);border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:6px 12px;backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);}
.vs-shield{display:flex;gap:5px;align-items:center;background:rgba(5,8,20,.58);border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:7px 9px;backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);}
.vs-pip{width:14px;height:14px;border-radius:3px;background:${accent};box-shadow:0 0 8px ${accent};}
.vs-pip.spent{background:#2a3450;box-shadow:none;}
.vs-center{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;}
.vs-center.hidden{display:none;}
.vs-panel{display:flex;flex-direction:column;align-items:center;gap:12px;background:rgba(5,8,20,.66);border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:22px 30px;backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);box-shadow:0 6px 30px rgba(0,0,0,.5);}
.vs-banner{font-size:30px;font-weight:800;letter-spacing:.04em;}
.vs-hint{font-size:15px;opacity:.9;max-width:18em;line-height:1.4;}
.vs-btns{position:absolute;bottom:0;right:0;display:flex;gap:10px;padding:12px;}
.vs-btn{pointer-events:auto;border:1px solid ${accent};background:rgba(8,12,28,.72);color:#fff;border-radius:12px;padding:11px 16px;font-size:14px;font-weight:600;cursor:pointer;min-width:48px;min-height:48px;}
.vs-btn:active{transform:scale(.95);}
.vs-btn:focus-visible{outline:2px solid #fff;outline-offset:2px;}
.vs-action{pointer-events:auto;margin-top:14px;border:2px solid ${accent};background:rgba(8,12,28,.85);color:#fff;border-radius:14px;padding:13px 26px;font-size:16px;font-weight:700;letter-spacing:.02em;cursor:pointer;box-shadow:0 0 16px ${accent}66;min-height:48px;}
.vs-action:hover{background:${accent}22;}
.vs-action:active{transform:scale(.96);}
.vs-action:focus-visible{outline:2px solid #fff;outline-offset:2px;}
.vs-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;}
@media (prefers-reduced-motion: reduce){.vs-pip{box-shadow:none;}.vs-btn:active{transform:none;}.vs-action:active{transform:none;}}
`;
}
