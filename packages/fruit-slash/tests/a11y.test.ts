import { describe, it, expect } from 'vitest';
import { createAnnouncer, prefersReducedMotion } from '../src/a11y.js';

describe('createAnnouncer', () => {
  it('exposes a polite aria-live status region', () => {
    const a = createAnnouncer(document);
    expect(a.element.getAttribute('role')).toBe('status');
    expect(a.element.getAttribute('aria-live')).toBe('polite');
  });

  it('clear-then-set so repeated identical messages still announce', async () => {
    const a = createAnnouncer(document);
    a.say('Sliced 1.');
    await Promise.resolve(); // flush queueMicrotask
    expect(a.element.textContent).toBe('Sliced 1.');
    a.say('Sliced 1.');
    expect(a.element.textContent).toBe(''); // cleared synchronously
    await Promise.resolve();
    expect(a.element.textContent).toBe('Sliced 1.');
  });
});

describe('prefersReducedMotion', () => {
  it('returns a boolean without throwing when matchMedia exists', () => {
    expect(typeof prefersReducedMotion(window)).toBe('boolean');
  });

  it('returns false when matchMedia is unavailable', () => {
    const fake = {} as unknown as Window;
    expect(prefersReducedMotion(fake)).toBe(false);
  });
});
