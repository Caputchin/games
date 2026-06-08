import { describe, it, expect } from 'vitest';
import configurationsJson from '../.caputchin/configurations.json';

// Solvability invariant for the config presets (the recorded kill-bar decision).
//
// Phobos's killable demon supply for the captcha round is exactly `wave_count`:
// the round spawns `wave_count` demons (phobos_spawn_wave) and, with no respawn,
// each can be killed once, so the player's kill counter tops out at wave_count.
// The pass gate is `kills >= pass_kills`. Therefore a preset is only solvable
// when `pass_kills <= wave_count` (or respawn is on, which makes the supply
// unbounded). If pass_kills exceeds the supply, the round can never be cleared.
//
// This is the guard behind the assessed-and-reverted default kill-bar bump
// (game-bot-resistance / game-anti-cheat): raising the default pass_kills above
// wave_count would make the standard round unsolvable, so the stricter bar lives
// in the opt-in `hardcore` preset (which raises BOTH bars together) instead of
// the default. This test fails loudly if any preset ever crosses that line.

type ConfigPreset = Record<string, string | number | boolean | undefined>;
const META = new Set(['_default', '_extends']);
const PRESETS = (configurationsJson.presets ?? {}) as Record<string, ConfigPreset>;

// Flatten a preset through its `_extends` chain (child overrides parent), exactly
// as the platform resolver does, so the effective values are what a site runs.
// The game-sdk ships only the types; the runtime resolver is server-side and not
// importable here, so this mirrors its whole-key-override, walk-to-base semantics.
function resolve(name: string, seen: string[] = []): ConfigPreset {
  if (seen.includes(name)) throw new Error(`_extends cycle: ${[...seen, name].join(' -> ')}`);
  const preset = PRESETS[name];
  if (!preset) throw new Error(`unknown preset "${name}"`);
  const parentName = typeof preset._extends === 'string' ? preset._extends : null;
  const base = parentName ? resolve(parentName, [...seen, name]) : {};
  const out: ConfigPreset = { ...base };
  for (const [k, v] of Object.entries(preset)) {
    if (!META.has(k)) out[k] = v;
  }
  return out;
}

function num(preset: ConfigPreset, key: string): number {
  const v = preset[key];
  expect(typeof v === 'number' && Number.isFinite(v), `preset key "${key}" must be a finite number`).toBe(true);
  return v as number;
}

describe('phobos config presets - solvability invariant', () => {
  const names = Object.keys(PRESETS);

  it('has presets to check', () => {
    expect(names.length).toBeGreaterThan(0);
  });

  it('every preset is solvable: pass_kills <= wave_count (unless respawn is on)', () => {
    for (const name of names) {
      const p = resolve(name);
      const passKills = num(p, 'pass_kills');
      const waveCount = num(p, 'wave_count');
      const respawn = p.respawn_monsters === true;
      // With respawn off, wave_count is the hard ceiling on achievable kills.
      expect(
        respawn || passKills <= waveCount,
        `preset "${name}" is UNSOLVABLE: pass_kills=${passKills} > wave_count=${waveCount} with respawn off`,
      ).toBe(true);
    }
  });

  it('the default preset stays solvable (guards the reverted kill-bar bump)', () => {
    const defName = names.find((n) => PRESETS[n]?._default === true);
    expect(defName, 'a preset must carry _default: true').toBeTruthy();
    const def = resolve(defName!);
    expect(num(def, 'pass_kills')).toBeLessThanOrEqual(num(def, 'wave_count'));
    expect(def.respawn_monsters === true).toBe(false); // default is no-respawn, finite wave
  });

  it('hardcore offers a stricter bar than the default, still solvable', () => {
    expect(PRESETS.hardcore, 'the stricter bar lives in the hardcore preset').toBeTruthy();
    const def = resolve(names.find((n) => PRESETS[n]?._default === true)!);
    const hard = resolve('hardcore');
    // hardcore raises the kill bar above the default...
    expect(num(hard, 'pass_kills')).toBeGreaterThan(num(def, 'pass_kills'));
    // ...and raises the supply with it, so it never crosses into unsolvable.
    expect(num(hard, 'pass_kills')).toBeLessThanOrEqual(num(hard, 'wave_count'));
  });
});
