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
.vs-top{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 14px;font-size:14px;font-weight:600;text-shadow:0 1px 4px rgba(0,0,0,.7);}
.vs-shield{display:flex;gap:5px;}
.vs-pip{width:14px;height:14px;border-radius:3px;background:${accent};box-shadow:0 0 8px ${accent};}
.vs-pip.spent{background:#2a3450;box-shadow:none;}
.vs-center{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;text-align:center;padding:24px;}
.vs-center.hidden{display:none;}
.vs-banner{font-size:30px;font-weight:800;letter-spacing:.04em;}
.vs-hint{font-size:15px;opacity:.85;max-width:18em;line-height:1.4;}
.vs-btns{position:absolute;bottom:0;right:0;display:flex;gap:10px;padding:12px;}
.vs-btn{pointer-events:auto;border:1px solid ${accent};background:rgba(8,12,28,.72);color:#fff;border-radius:12px;padding:11px 16px;font-size:14px;font-weight:600;cursor:pointer;min-width:48px;min-height:48px;}
.vs-btn:active{transform:scale(.95);}
.vs-btn:focus-visible{outline:2px solid #fff;outline-offset:2px;}
.vs-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;}
@media (prefers-reduced-motion: reduce){.vs-pip{box-shadow:none;}.vs-btn:active{transform:none;}}
`;
}
