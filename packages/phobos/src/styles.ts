// Stage footprint + skin-themed CSS for the Phobos chrome. The DOOM render
// resolution is the logical stage; CSS scales the canvas to fit the widget.
// STAGE_WIDTH/HEIGHT MUST match caputchin.json `preferred` (enforced by a test).

export const STAGE_WIDTH = 640;
export const STAGE_HEIGHT = 400;

const DEFAULTS: Record<string, string> = {
  bg: '#101014',
  fg: '#e8e6e3',
  button_bg: '#9c1f1f',
  button_text: '#ffffff',
  button_hover: '#bf2a2a',
  hud_bg: 'rgba(0,0,0,0.55)',
  badge_bg: '#2f8f3f',
  focus_ring: '#bf2a2a',
};

function v(skin: Record<string, string> | null | undefined, key: string): string {
  return (skin && skin[key]) || DEFAULTS[key]!;
}

/** Inject scoped styles into the game root, themed by the resolved skin. */
export function mountStyles(root: HTMLElement, skin: Record<string, string> | null | undefined): void {
  const css = `
.phobos { position:relative; width:100%; max-width:${STAGE_WIDTH}px; margin:0 auto;
  aspect-ratio:${STAGE_WIDTH}/${STAGE_HEIGHT}; background:${v(skin, 'bg')}; color:${v(skin, 'fg')};
  font-family:system-ui,sans-serif; overflow:hidden; border-radius:6px; user-select:none; }
.phobos-canvas { width:100%; height:100%; display:block; image-rendering:pixelated; outline:none; touch-action:none; }
.phobos-canvas:focus-visible { box-shadow:inset 0 0 0 2px ${v(skin, 'focus_ring')}; }
.phobos-hud { position:absolute; top:6px; left:6px; display:flex; gap:8px; align-items:center;
  padding:2px 8px; border-radius:4px; background:${v(skin, 'hud_bg')}; font-variant-numeric:tabular-nums; font-size:14px; }
.phobos-badge { background:${v(skin, 'badge_bg')}; color:#fff; padding:1px 6px; border-radius:3px; font-size:12px; }
.phobos-start { position:absolute; inset:0; display:flex; flex-direction:column; gap:8px;
  align-items:center; justify-content:center; text-align:center; padding:16px;
  background:${v(skin, 'bg')}cc; backdrop-filter:blur(2px); }
.phobos-start h2 { margin:0; font-size:22px; letter-spacing:0.04em; }
.phobos-start p { margin:0; max-width:36ch; opacity:0.85; font-size:14px; }
.phobos-start small { opacity:0.6; font-size:12px; }
.phobos-btn { cursor:pointer; border:none; border-radius:4px; padding:8px 22px; font-size:15px;
  background:${v(skin, 'button_bg')}; color:${v(skin, 'button_text')}; }
.phobos-btn:hover { background:${v(skin, 'button_hover')}; }
.phobos-controls { position:absolute; bottom:6px; right:6px; display:flex; gap:6px; }
.phobos-controls[aria-hidden="true"] { display:none; }
.phobos-controls button { width:44px; height:44px; border-radius:50%; border:1px solid ${v(skin, 'fg')}55;
  background:${v(skin, 'hud_bg')}; color:${v(skin, 'fg')}; font-size:16px; touch-action:none; }
.phobos-live { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); }
@media (pointer:fine) { .phobos-controls { display:none; } }`;
  const style = document.createElement('style');
  style.textContent = css;
  root.appendChild(style);
}
