import { describe, it, expect } from 'vitest';
import { resolvePhobosConfig } from '../src/config.js';
import manifest from '../caputchin.json';

// Guards the config wiring: the server sends the manifest's SNAKE_CASE keys, and
// run-core/game must consume those exact spellings (a camelCase read silently
// drops every server override -> the gate ignores the site's pass_kills). This
// test would have caught that.
describe('resolvePhobosConfig', () => {
  it('falls back to the manifest default preset when config is null', () => {
    const c = resolvePhobosConfig(null);
    const def = manifest.configurations.presets.default as Record<string, number | boolean>;
    expect(c.passKills).toBe(def.pass_kills);
    expect(c.startLevel).toBe(def.start_level);
    expect(c.waveCount).toBe(def.wave_count);
    expect(c.skill).toBe(def.skill);
    expect(c.fastMonsters).toBe(def.fast_monsters);
    expect(c.respawnMonsters).toBe(def.respawn_monsters);
    expect(c.timeLimit).toBe(def.time_limit);
  });

  it('consumes each server override under its snake_case key', () => {
    const c = resolvePhobosConfig({
      pass_kills: 7,
      start_level: 3,
      wave_count: 9,
      skill: 2,
      fast_monsters: true,
      respawn_monsters: false,
      time_limit: 1400,
    });
    expect(c.passKills).toBe(7);
    expect(c.startLevel).toBe(3);
    expect(c.waveCount).toBe(9);
    expect(c.skill).toBe(2);
    expect(c.fastMonsters).toBe(true);
    expect(c.respawnMonsters).toBe(false);
    expect(c.timeLimit).toBe(1400);
  });

  it('ignores camelCase keys (the platform never sends them)', () => {
    // If run-core ever read camelCase, these would leak through; they must not.
    const c = resolvePhobosConfig({ passKills: 99, waveCount: 99 } as Record<string, unknown>);
    const def = manifest.configurations.presets.default as unknown as Record<string, number>;
    expect(c.passKills).toBe(def.pass_kills);
    expect(c.waveCount).toBe(def.wave_count);
  });

  it('ignores malformed values and keeps the fallback', () => {
    const c = resolvePhobosConfig({ pass_kills: 'lots', fast_monsters: 'yes' } as Record<string, unknown>);
    const def = manifest.configurations.presets.default as Record<string, number | boolean>;
    expect(c.passKills).toBe(def.pass_kills);
    expect(c.fastMonsters).toBe(def.fast_monsters);
  });
});
