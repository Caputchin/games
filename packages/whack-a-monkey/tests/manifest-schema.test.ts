import { describe, it, expect } from 'vitest';
import localesJson from '../.caputchin/locales.json';
import skinsJson from '../.caputchin/skins.json';
import configurationsJson from '../.caputchin/configurations.json';

const EXPECTED_LANGS = ['en', 'zh-Hans', 'es', 'ar', 'pt', 'fr', 'de', 'ru', 'ja', 'ko', 'id'];

function tokensIn(value: string): string[] {
  return [...new Set([...value.matchAll(/\{(\w+)\}/g)].map((x) => x[1]!))].sort();
}

describe('locales schema + preset integrity', () => {
  const presets = localesJson.presets as Record<string, Record<string, unknown>>;
  const schema = localesJson.schema as Record<string, { name: string; description: string; tokens?: string[] }>;
  const en = presets.English as Record<string, string>;
  const textKeys = Object.keys(en).filter((k) => !k.startsWith('_'));

  it('documents every text key with a name + description', () => {
    for (const k of textKeys) {
      expect(schema[k], `schema missing ${k}`).toBeDefined();
      expect(typeof schema[k]!.name).toBe('string');
      expect(typeof schema[k]!.description).toBe('string');
    }
  });

  it('gives every preset exactly the English text-key set', () => {
    for (const [name, p] of Object.entries(presets)) {
      const keys = Object.keys(p).filter((k) => !k.startsWith('_')).sort();
      expect(keys, `preset ${name}`).toEqual([...textKeys].sort());
    }
  });

  it('preserves the schema-declared tokens verbatim in every preset value', () => {
    for (const [name, p] of Object.entries(presets)) {
      for (const k of textKeys) {
        const declared = [...(schema[k]!.tokens ?? [])].sort();
        expect(tokensIn(String(p[k])), `${name}.${k}`).toEqual(declared);
      }
    }
  });

  it('covers all 11 official languages', () => {
    const langs = Object.values(presets).map((p) => p['_lang']).sort();
    expect(langs).toEqual([...EXPECTED_LANGS].sort());
  });

  it('uses no em-dash or en-dash in any preset string (public-source rule)', () => {
    // Built at runtime so this file holds no literal dash (mirrors the other
    // games + the widget locale test; keeps the detector immune to a sweep).
    const EM_DASH = String.fromCharCode(0x2014);
    const EN_DASH = String.fromCharCode(0x2013);
    for (const [name, p] of Object.entries(presets)) {
      for (const k of textKeys) {
        const v = String(p[k]);
        expect(v.includes(EM_DASH), `${name}.${k} em-dash`).toBe(false);
        expect(v.includes(EN_DASH), `${name}.${k} en-dash`).toBe(false);
      }
    }
  });
});

describe('skin + configuration preset keys are all declared in their schema', () => {
  it('skins', () => {
    const schema = skinsJson.schema as Record<string, unknown>;
    for (const [name, p] of Object.entries(skinsJson.presets as Record<string, Record<string, unknown>>)) {
      for (const k of Object.keys(p).filter((key) => !key.startsWith('_'))) {
        expect(schema[k], `skin ${name}.${k}`).toBeDefined();
      }
    }
  });

  it('configurations', () => {
    const schema = configurationsJson.schema as Record<string, unknown>;
    for (const [name, p] of Object.entries(configurationsJson.presets as Record<string, Record<string, unknown>>)) {
      for (const k of Object.keys(p).filter((key) => !key.startsWith('_'))) {
        expect(schema[k], `config ${name}.${k}`).toBeDefined();
      }
    }
  });
});
