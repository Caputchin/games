import { describe, it, expect } from 'vitest';
import { resolveSimConfig } from '../src/sim/config.js';
import cfgJson from '../.caputchin/configurations.json';

// Guards the customer config contract: the .caputchin/configurations.json the
// dashboard renders MUST describe exactly the knobs the sim reads, with ranges
// that fall inside the sim's clamps. Without this, the dashboard can advertise
// dead knobs (silently ignored) or ranges the sim truncates with no signal.

type Field = keyof ReturnType<typeof resolveSimConfig>;
const FIELD: Record<string, Field> = {
  cols: 'cols',
  rows: 'rows',
  pass_lines: 'passLines',
  gravity: 'gravity',
  lock_delay: 'lockDelay',
  sound: 'sound',
};

const schema = cfgJson.schema as Record<string, { type: string; min?: number; max?: number; step?: number }>;
const presets = cfgJson.presets as Record<string, Record<string, number | boolean | string>>;

describe('configurations.json <-> config.ts parity', () => {
  it('documents exactly the knobs the sim reads (no dead or missing knobs)', () => {
    expect(new Set(Object.keys(schema))).toEqual(new Set(Object.keys(FIELD)));
  });

  it('every schema range sits inside the sim clamp (the dashboard never lies)', () => {
    for (const [key, s] of Object.entries(schema)) {
      if (s.type !== 'range') continue;
      const field = FIELD[key]!;
      expect(resolveSimConfig({ [key]: s.min })[field], `${key} min ${s.min} is clamped up`).toBe(s.min);
      expect(resolveSimConfig({ [key]: s.max })[field], `${key} max ${s.max} is clamped down`).toBe(s.max);
    }
  });

  it('every preset value resolves unclamped (presets stay in range)', () => {
    for (const [name, preset] of Object.entries(presets)) {
      for (const [key, field] of Object.entries(FIELD)) {
        const v = preset[key];
        if (typeof v !== 'number' && typeof v !== 'boolean') continue;
        expect(resolveSimConfig({ [key]: v })[field], `preset ${name}.${key} = ${String(v)}`).toBe(v);
      }
    }
  });
});
