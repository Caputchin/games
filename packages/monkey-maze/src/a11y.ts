// Accessibility helpers: a polite live-region announcer for game-state changes
// and a reduced-motion probe. Screen-reader users get spoken game state; the
// visual board is mirrored by the live HUD (dots left, score) in the DOM.

export interface Announcer {
  element: HTMLElement;
  say(message: string): void;
}

export function createAnnouncer(doc: Document): Announcer {
  const el = doc.createElement('div');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-atomic', 'true');
  el.style.position = 'absolute';
  el.style.width = '1px';
  el.style.height = '1px';
  el.style.overflow = 'hidden';
  el.style.clip = 'rect(0 0 0 0)';
  el.style.clipPath = 'inset(50%)';
  el.style.whiteSpace = 'nowrap';
  el.style.border = '0';
  el.style.padding = '0';
  el.style.margin = '-1px';
  let last = '';
  return {
    element: el,
    say(message: string): void {
      if (message === last) {
        // Re-announce identical text by toggling content.
        el.textContent = '';
      }
      last = message;
      el.textContent = message;
    },
  };
}

export function prefersReducedMotion(view: Window): boolean {
  try {
    return view.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
