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

function v(skin: Record<string, string | boolean | number> | null | undefined, key: string): string {
  const raw = skin?.[key];
  return typeof raw === 'string' && raw.length > 0 ? raw : DEFAULTS[key]!;
}

/** Inject scoped styles into the game root, themed by the resolved skin. */
export function mountStyles(root: HTMLElement, skin: Record<string, string | boolean | number> | null | undefined): void {
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
.phobos-start[hidden] { display:none; }
.phobos-start h2 { margin:0; max-width:100%; font-size:22px; letter-spacing:0.04em; }
.phobos-start p { margin:0; max-width:min(36ch,100%); opacity:0.85; font-size:14px; }
.phobos-start small { max-width:100%; opacity:0.6; font-size:12px; }
.phobos-btn { cursor:pointer; border:none; border-radius:4px; padding:8px 22px; font-size:15px;
  background:${v(skin, 'button_bg')}; color:${v(skin, 'button_text')}; }
.phobos-btn:hover { background:${v(skin, 'button_hover')}; }
.phobos-btn[disabled] { opacity:0.55; cursor:default; }
.phobos-cleared { position:absolute; inset:0; display:flex; flex-direction:column; gap:10px;
  align-items:center; justify-content:center; text-align:center; padding:16px;
  background:${v(skin, 'bg')}e6; backdrop-filter:blur(3px); }
.phobos-cleared[hidden] { display:none; }
.phobos-cleared-mark { width:46px; height:46px; border-radius:50%; background:${v(skin, 'badge_bg')};
  color:#fff; font-size:26px; line-height:46px; font-weight:700; }
.phobos-cleared-mark.died { background:${v(skin, 'button_bg')}; }
.phobos-cleared-title { margin:0; max-width:100%; font-size:20px; letter-spacing:0.03em; }
.phobos-cleared-body { margin:0; max-width:min(34ch,100%); opacity:0.85; font-size:14px; }
.phobos-cleared-actions { display:flex; gap:10px; margin-top:4px; flex-wrap:wrap; justify-content:center; }
.phobos-btn-ghost { cursor:pointer; border:1px solid ${v(skin, 'fg')}55; border-radius:4px;
  padding:8px 18px; font-size:15px; background:transparent; color:${v(skin, 'fg')}; }
.phobos-btn-ghost:hover { background:${v(skin, 'hud_bg')}; }
.phobos-controls { position:absolute; inset:0; pointer-events:none; }
.phobos-controls[aria-hidden="true"] { display:none; }
.phobos-stick { position:absolute; bottom:18px; left:18px; width:124px; height:124px; border-radius:50%;
  background:${v(skin, 'fg')}1a; border:2px solid ${v(skin, 'fg')}44; pointer-events:auto; touch-action:none; }
.phobos-stick-thumb { position:absolute; top:50%; left:50%; width:56px; height:56px; margin:-28px 0 0 -28px;
  border-radius:50%; background:${v(skin, 'fg')}59; border:2px solid ${v(skin, 'fg')}88; will-change:transform; }
.phobos-fire { position:absolute; bottom:30px; right:26px; width:86px; height:86px; border-radius:50%;
  border:2px solid ${v(skin, 'fg')}44; background:${v(skin, 'button_bg')}cc; color:${v(skin, 'button_text')};
  font-size:30px; line-height:1; pointer-events:auto; touch-action:none; cursor:pointer; }
.phobos-fire:active { background:${v(skin, 'button_hover')}; }
.phobos-mute { position:absolute; top:6px; right:6px; z-index:2; width:32px; height:32px; cursor:pointer;
  border:none; border-radius:4px; background:${v(skin, 'hud_bg')}; color:${v(skin, 'fg')}; font-size:16px;
  line-height:1; display:flex; align-items:center; justify-content:center; padding:0; }
.phobos-mute:hover { background:${v(skin, 'button_hover')}; }
.phobos-loading { position:absolute; inset:0; z-index:3; display:flex; flex-direction:column; gap:12px;
  align-items:center; justify-content:center; background:${v(skin, 'bg')}e6; }
.phobos-loading[hidden] { display:none; }
.phobos-loading p { margin:0; opacity:0.8; font-size:14px; }
.phobos-spinner { width:34px; height:34px; border-radius:50%; border:3px solid ${v(skin, 'fg')}33;
  border-top-color:${v(skin, 'button_bg')}; animation:phobos-spin 0.8s linear infinite; }
@keyframes phobos-spin { to { transform:rotate(360deg); } }
@media (prefers-reduced-motion:reduce) { .phobos-spinner { animation-duration:2.4s; } }
.phobos-live { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); }
@media (pointer:fine) { .phobos-controls { display:none; } }`;
  const style = document.createElement('style');
  style.textContent = css;
  root.appendChild(style);
}
