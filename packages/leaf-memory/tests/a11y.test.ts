import { describe, it, expect, beforeEach } from 'vitest';
import { createAnnouncer, prefersReducedMotion } from '../src/a11y';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('createAnnouncer', () => {
  it('returns a polite live region with status role', () => {
    const a = createAnnouncer(document);
    expect(a.element.getAttribute('role')).toBe('status');
    expect(a.element.getAttribute('aria-live')).toBe('polite');
    expect(a.element.getAttribute('aria-atomic')).toBe('true');
    expect(a.element.className).toBe('lm-announce');
  });

  it('say(...) sets textContent on next microtask', async () => {
    const a = createAnnouncer(document);
    document.body.appendChild(a.element);
    a.say('Match');
    // textContent is cleared synchronously, populated in a microtask
    await Promise.resolve();
    expect(a.element.textContent).toBe('Match');
  });

  it('repeated identical messages re-announce after clear-then-set', async () => {
    const a = createAnnouncer(document);
    document.body.appendChild(a.element);
    a.say('Match');
    await Promise.resolve();
    expect(a.element.textContent).toBe('Match');
    a.say('Match');
    expect(a.element.textContent).toBe('');
    await Promise.resolve();
    expect(a.element.textContent).toBe('Match');
  });
});

describe('prefersReducedMotion', () => {
  it('returns false when matchMedia is unavailable', () => {
    const fakeView = {} as Window;
    expect(prefersReducedMotion(fakeView)).toBe(false);
  });

  it('returns matchMedia(...).matches when available', () => {
    const matchOn = {
      matchMedia: (q: string) => ({
        matches: q.includes('reduce'),
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    } as unknown as Window;
    expect(prefersReducedMotion(matchOn)).toBe(true);

    const matchOff = {
      matchMedia: () => ({
        matches: false,
        media: '',
        addEventListener: () => {},
        removeEventListener: () => {},
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    } as unknown as Window;
    expect(prefersReducedMotion(matchOff)).toBe(false);
  });
});
