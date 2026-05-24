// Accessibility helpers: an aria-live announcement region + a reduced-motion
// query. game.ts surfaces run-started / game-over / new-best events to screen
// readers through the announcer, and consults prefersReducedMotion to drop
// decorative motion (parallax clouds, day/night cross-fade) while keeping the
// core gameplay intact.

export interface Announcer {
  say(message: string): void;
  element: HTMLElement;
}

export function createAnnouncer(doc: Document): Announcer {
  const el = doc.createElement('div');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-atomic', 'true');
  el.className = 'dr-announce';
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
