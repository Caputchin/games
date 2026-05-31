// Minimal layout. The Bevy build owns all in-arena drawing and scales the board to
// fit (camera AutoMin = contain), so the canvas simply fills the iframe in both
// axes and the game stays fully visible at any size.

export function applyStyles(container: HTMLElement, canvas: HTMLCanvasElement): void {
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
