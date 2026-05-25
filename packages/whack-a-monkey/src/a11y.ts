// Accessibility helpers: an aria-live announcement region + a reduced-motion
// query. game.ts surfaces round-started / whacked / wrong-animal / level-up /
// verified / round-over events to screen readers through the announcer, and
// consults prefersReducedMotion to drop the decorative squash/stretch, hit
// particles, and punch overshoot while keeping the core gameplay intact.
//
// SECURITY/A11Y note: announcements describe ACTION + FEEDBACK only (started,
// score, level, verified) and NEVER which hole a monkey is in. The point of a
// canvas captcha is that the solution is not in the DOM; leaking a target's
// position through the accessibility tree would hand a scraper the same oracle.

export interface Announcer {
  say(message: string): void;
  element: HTMLElement;
}

export function createAnnouncer(doc: Document): Announcer {
  const el = doc.createElement('div');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-atomic', 'true');
  el.className = 'wm-announce';
  return {
    element: el,
    say(message: string): void {
      // Clear-then-set ensures repeated identical messages still announce.
      el.textContent = '';
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
