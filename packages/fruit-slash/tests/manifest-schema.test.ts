import { describe, it, expect } from 'vitest';
import type { LocaleKeySchema } from '@caputchin/game-sdk';
import manifest from '../caputchin.json';

const presets = manifest.locales?.presets as Record<string, Record<string, string | boolean | undefined>>;
const schema = (manifest.locales?.schema ?? {}) as Record<string, LocaleKeySchema>;
const METADATA_KEYS = new Set(['_lang', '_direction', '_default', '_extends']);

const presetNames = Object.keys(presets);
const referenceKeys = Object.keys(Object.values(presets)[0] ?? {}).filter((k) => !METADATA_KEYS.has(k));

describe('fruit-slash caputchin.json — schema / presets parity', () => {
  it('every text key in the base preset is documented in schema', () => {
    for (const key of referenceKeys) {
      expect(schema, `schema missing entry for "${key}"`).toHaveProperty(key);
    }
  });

  it('every schema entry has a non-empty name + description', () => {
    for (const [key, entry] of Object.entries(schema)) {
      expect(typeof entry.name === 'string' && entry.name.length > 0, `schema.${key}.name`).toBe(true);
      expect(typeof entry.description === 'string' && entry.description.length > 0, `schema.${key}.description`).toBe(true);
    }
  });

  it('every preset declares the same text keys as the base preset', () => {
    for (const name of presetNames) {
      const presetKeys = Object.keys(presets[name] ?? {}).filter((k) => !METADATA_KEYS.has(k));
      expect(new Set(presetKeys), `preset "${name}" key set`).toEqual(new Set(referenceKeys));
    }
  });

  it('schema-declared tokens appear in every preset variant of the key', () => {
    for (const [key, entry] of Object.entries(schema)) {
      if (!entry.tokens || entry.tokens.length === 0) continue;
      for (const name of presetNames) {
        const value = presets[name]?.[key];
        if (typeof value !== 'string') continue;
        for (const token of entry.tokens) {
          expect(value, `preset "${name}" key "${key}" missing token {${token}}`).toContain(`{${token}}`);
        }
      }
    }
  });

  it('uses no undeclared {token} in any preset value', () => {
    for (const name of presetNames) {
      for (const [key, value] of Object.entries(presets[name] ?? {})) {
        if (METADATA_KEYS.has(key) || typeof value !== 'string') continue;
        const declared = new Set(schema[key]?.tokens ?? []);
        for (const match of value.matchAll(/\{(\w+)\}/g)) {
          expect(declared.has(match[1]!), `preset "${name}" key "${key}" uses undeclared token {${match[1]}}`).toBe(true);
        }
      }
    }
  });

  it('uses no em-dash in any preset value (public-source rule)', () => {
    const EM_DASH = String.fromCharCode(0x2014);
    for (const name of presetNames) {
      for (const [key, value] of Object.entries(presets[name] ?? {})) {
        if (METADATA_KEYS.has(key) || typeof value !== 'string') continue;
        expect(value.includes(EM_DASH), `preset "${name}" key "${key}" contains an em-dash`).toBe(false);
      }
    }
  });

  it('covers the official supported-language set (all 11)', () => {
    const OFFICIAL_LANGS = ['en', 'zh-Hans', 'es', 'ar', 'pt', 'fr', 'de', 'ru', 'ja', 'ko', 'id'];
    const declared = new Set(
      presetNames.map((n) => presets[n]?.['_lang']).filter((v): v is string => typeof v === 'string'),
    );
    for (const lang of OFFICIAL_LANGS) {
      expect(declared.has(lang), `missing required locale preset for _lang="${lang}"`).toBe(true);
    }
  });
});
