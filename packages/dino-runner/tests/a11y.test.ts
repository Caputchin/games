import { describe, it, expect } from 'vitest';
import { createAnnouncer, prefersReducedMotion } from '../src/a11y.js';

describe('createAnnouncer', () => {
  it('builds a polite live region', () => {
    const a = createAnnouncer(document);
    expect(a.element.getAttribute('role')).toBe('status');
    expect(a.element.getAttribute('aria-live')).toBe('polite');
    expect(a.element.getAttribute('aria-atomic')).toBe('true');
  });

  it('announces a message after the microtask flush', async () => {
    const a = createAnnouncer(document);
    a.say('Game over');
    expect(a.element.textContent).toBe(''); // cleared synchronously
    await Promise.resolve();
    expect(a.element.textContent).toBe('Game over');
  });
});

describe('prefersReducedMotion', () => {
  it('returns false when matchMedia is unavailable', () => {
    const fakeView = {} as unknown as Window;
    expect(prefersReducedMotion(fakeView)).toBe(false);
  });

  it('reflects the media query result', () => {
    const fakeView = {
      matchMedia: (q: string) => ({ matches: q.includes('reduce') }),
    } as unknown as Window;
    expect(prefersReducedMotion(fakeView)).toBe(true);
  });
});
