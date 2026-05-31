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
