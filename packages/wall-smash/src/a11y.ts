// Screen-reader bridge for an engine-rendered game. The Bevy canvas is opaque to
// assistive tech (it's pixels), so the visuals stay 100% in Bevy and THIS hidden
// aria-live region carries the spoken state. game.ts drives it from the same
// `wallsmash:*` events Bevy emits (launch / level / life-lost / verified / round
// over), localized through strings.ts. This is the reference pattern for future
// engine-based games: visuals in the engine, a thin DOM live-region for a11y.

export interface Announcer {
  say(message: string): void;
  element: HTMLElement;
}

export function createAnnouncer(doc: Document): Announcer {
  const el = doc.createElement('div');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-atomic', 'true');
  // Visually hidden, still exposed to screen readers (the standard sr-only recipe).
  el.style.cssText =
    'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;' +
    'clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;';
  return {
    element: el,
    say(message: string): void {
      // Clear-then-set so repeated identical messages still re-announce.
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
