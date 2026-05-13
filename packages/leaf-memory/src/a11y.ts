// Accessibility helpers — aria-live announcement region + reduced-motion
// query. Used by board.ts to surface match / no-match / round-passed /
// out-of-time events to screen readers.

export interface Announcer {
  say(message: string): void;
  element: HTMLElement;
}

export function createAnnouncer(doc: Document): Announcer {
  const el = doc.createElement('div');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-atomic', 'true');
  el.className = 'lm-announce';
  return {
    element: el,
    say(message: string): void {
      // Clear-then-set ensures repeated identical messages still announce.
      el.textContent = '';
      // Defer so the empty value flushes before the next.
      queueMicrotask(() => {
        el.textContent = message;
      });
    },
  };
}

export function prefersReducedMotion(view: Window): boolean {
  if (typeof view.matchMedia !== 'function') return false;
  return view.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
