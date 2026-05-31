// Minimal layout. The Bevy build owns all in-arena drawing and scales the board to
// fit (camera AutoMin = contain), so the canvas simply fills the iframe in both
// axes and the game stays fully visible at any size.

export function applyStyles(container: HTMLElement, canvas: HTMLCanvasElement): void {
  // `height: 100%` only resolves if every ancestor has a height. The game owns the
  // whole iframe, so give the document + body a full height (and drop default body
  // margin) - otherwise the canvas fills width but collapses to content height.
  const doc = container.ownerDocument;
  if (doc?.documentElement) {
    doc.documentElement.style.height = '100%';
  }
  if (doc?.body) {
    doc.body.style.height = '100%';
    doc.body.style.margin = '0';
    doc.body.style.overflow = 'hidden';
  }

  container.style.display = 'block';
  container.style.position = 'relative';
  container.style.width = '100%';
  container.style.height = '100%';
  container.style.background = '#0d0d12';
  container.style.overflow = 'hidden';
  container.style.touchAction = 'none';

  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.outline = 'none';
  canvas.style.touchAction = 'none';
}

// Pre-boot loading placeholder. Bevy can't render its own loader (it isn't running
// yet, and the inlined wasm is a few MB to instantiate), so this small CSS overlay
// covers the canvas until the game fires `wallsmash:ready` on its first frame. It is
// the ONLY non-Bevy visual; every screen after boot is drawn by Bevy UI.
export function createBootOverlay(doc: Document): HTMLElement {
  if (doc.head && !doc.getElementById('ws-boot-style')) {
    const style = doc.createElement('style');
    style.id = 'ws-boot-style';
    style.textContent =
      '.ws-boot{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#0d0d12;z-index:2}' +
      '.ws-boot-spin{width:34px;height:34px;border-radius:50%;border:3px solid rgba(255,255,255,.2);border-top-color:#3ad6ff;animation:ws-spin .8s linear infinite}' +
      '@keyframes ws-spin{to{transform:rotate(360deg)}}' +
      '@media (prefers-reduced-motion:reduce){.ws-boot-spin{animation:none;border-top-color:rgba(255,255,255,.2)}}';
    doc.head.appendChild(style);
  }
  const el = doc.createElement('div');
  el.className = 'ws-boot';
  const spinner = doc.createElement('div');
  spinner.className = 'ws-boot-spin';
  el.appendChild(spinner);
  return el;
}
