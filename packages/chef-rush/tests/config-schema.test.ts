// Guards the dashboard config contract: configurations.json (what operators tune)
// MUST line up with config.ts (what the sim actually reads). Without this, a renamed
// or missing key silently no-ops - the operator sets a difficulty and the sim ignores
// it, falling to hardcoded defaults, with tsc + every other test still green. The
// single source of truth is CONFIG_FIELDS in config.ts.

import { describe, it, expect } from 'vitest';
import configs from '../.caputchin/configurations.json';
import { CONFIG_FIELDS } from '../src/sim/config.js';

const schema = configs.schema as Record<string, { type: string; min?: number; max?: number }>;
const presets = configs.presets as Record<string, Record<string, number | boolean | string>>;
const fields: ReadonlyArray<{ key: string; min: number; max: number }> = Object.values(CONFIG_FIELDS);
const fieldKeys = new Set<string>(fields.map((f) => f.key));
// Manifest keys read by surfaces other than the sim (the renderer reads `sound`).
const NON_SIM_KEYS = new Set(['sound']);

describe('chef-rush config contract (configurations.json <-> config.ts)', () => {
  it('every key config.ts reads has a dashboard schema entry', () => {
    for (const f of fields) expect(schema, `no schema entry for read key "${f.key}"`).toHaveProperty(f.key);
  });

  it('every dashboard schema key is actually read by config.ts (no dead knob)', () => {
    for (const key of Object.keys(schema)) {
      if (NON_SIM_KEYS.has(key)) continue;
      expect(fieldKeys.has(key), `schema key "${key}" is never read by config.ts (dead config knob)`).toBe(true);
    }
  });

  it('schema range matches the config.ts clamp for each field', () => {
    for (const f of fields) {
      const s = schema[f.key]!;
      expect(s.min, `${f.key} schema.min`).toBe(f.min);
      expect(s.max, `${f.key} schema.max`).toBe(f.max);
    }
  });

  it('every preset value stays within its schema range (advertised == applied, never silently clamped)', () => {
    for (const [name, preset] of Object.entries(presets)) {
      for (const f of fields) {
        const v = preset[f.key];
        if (typeof v !== 'number') continue;
        expect(v >= f.min && v <= f.max, `preset "${name}".${f.key}=${v} outside [${f.min}, ${f.max}]`).toBe(true);
      }
    }
  });
});
