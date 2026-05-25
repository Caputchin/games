import { describe, it, expect } from 'vitest';
import { createAnnouncer, prefersReducedMotion } from '../src/a11y.js';
import manifest from '../caputchin.json';

describe('createAnnouncer', () => {
  it('is a polite aria-live status region', () => {
    const a = createAnnouncer(document);
    expect(a.element.getAttribute('role')).toBe('status');
    expect(a.element.getAttribute('aria-live')).toBe('polite');
    expect(a.element.getAttribute('aria-atomic')).toBe('true');
  });

  it('sets the message after the clear-then-set microtask', async () => {
    const a = createAnnouncer(document);
    a.say('hello');
    await Promise.resolve();
    await Promise.resolve();
    expect(a.element.textContent).toBe('hello');
  });
});

describe('prefersReducedMotion', () => {
  it('returns a boolean and is false when matchMedia is unavailable', () => {
    expect(typeof prefersReducedMotion(window)).toBe('boolean');
    expect(prefersReducedMotion({} as Window)).toBe(false);
  });
});

describe('announcements never leak a target position', () => {
  it('allows only score / level tokens in announce* strings (never a hole index)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = (manifest as any).locales.schema as Record<string, { tokens?: string[] }>;
    for (const key of Object.keys(schema)) {
      if (!key.startsWith('announce')) continue;
      for (const tok of schema[key]!.tokens ?? []) {
        expect(['score', 'level']).toContain(tok);
      }
    }
  });
});
