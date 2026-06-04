import { describe, it, expect } from 'vitest';
import { resolveSimConfig } from '../src/sim/config.js';

describe('resolveSimConfig', () => {
  it('returns defaults for null', () => {
    const c = resolveSimConfig(null);
    expect(c.cols).toBe(7);
    expect(c.rows).toBe(12);
    expect(c.passLines).toBe(2);
  });

  it('reads and rounds valid values', () => {
    const c = resolveSimConfig({ cols: 10, rows: 12, pass_lines: 3, gravity: 18, lock_delay: 12 });
    expect(c.cols).toBe(10);
    expect(c.rows).toBe(12);
    expect(c.passLines).toBe(3);
    expect(c.gravity).toBe(18);
    expect(c.lockDelay).toBe(12);
  });

  it('clamps out-of-range values', () => {
    expect(resolveSimConfig({ cols: 99 }).cols).toBe(12);
    expect(resolveSimConfig({ cols: 1 }).cols).toBe(6);
    expect(resolveSimConfig({ rows: 0 }).rows).toBe(7);
    expect(resolveSimConfig({ rows: 99 }).rows).toBe(16);
    expect(resolveSimConfig({ pass_lines: 999 }).passLines).toBe(4);
    expect(resolveSimConfig({ pass_lines: 0 }).passLines).toBe(1);
  });

  it('ignores non-numeric values', () => {
    const c = resolveSimConfig({ cols: 'wide' as unknown as number });
    expect(c.cols).toBe(7);
  });
});
