import { describe, it, expect, beforeEach } from 'vitest';
import type { Bridge, ConfigPreset, ConfigSchemaEntry } from '@caputchin/game-sdk';
import manifest from '../caputchin.json';
import { resolveLeafMemoryConfig } from '../src/config.js';
import { DIFFICULTY_LADDER, MAX_LEVEL } from '../src/difficulty.js';
import { runLeafMemory } from '../src/game.js';

function makeBridge(): Bridge {
  return {
    pass: () => {},
    error: () => {},
    setSize: () => {},
    layout: null,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

const configurations = manifest.configurations;
const presets = (configurations?.presets ?? {}) as Record<string, ConfigPreset>;
const schema = (configurations?.schema ?? {}) as Record<string, ConfigSchemaEntry>;

describe('leaf-memory caputchin.json — configurations schema / preset parity', () => {
  it('declares a default preset marked _default:true', () => {
    expect(presets['default']?._default).toBe(true);
  });

  it('every preset key is documented in configurations.schema', () => {
    const reservedKeys = new Set(['_default', '_extends']);
    for (const [name, preset] of Object.entries(presets)) {
      for (const key of Object.keys(preset)) {
        if (reservedKeys.has(key)) continue;
        expect(schema, `preset "${name}" key "${key}" missing from schema`).toHaveProperty(key);
      }
    }
  });

  it('default preset covers every schema key (no missing knob)', () => {
    const schemaKeys = Object.keys(schema);
    const defaultKeys = Object.keys(presets['default'] ?? {});
    for (const key of schemaKeys) {
      expect(defaultKeys.includes(key), `default preset missing "${key}"`).toBe(true);
    }
  });

  // LC5 drift guard: per-level timings live in BOTH the JSON default preset
  // (runtime override source when widget hands a config) AND in
  // DIFFICULTY_LADDER (the code-side default when no config is passed).
  // If the two ever disagree, a player who never customizes config gets
  // different timing than a player who picks the bundled default. Lock
  // them together at CI time.
  it('DIFFICULTY_LADDER per-level timings match the JSON default preset', () => {
    const defaultPreset = presets['default'] ?? {};
    for (const level of DIFFICULTY_LADDER) {
      const jsonPeek = defaultPreset[`memorize_seconds_level_${level.level}`];
      const jsonSolve = defaultPreset[`solve_seconds_level_${level.level}`];
      expect(typeof jsonPeek).toBe('number');
      expect(typeof jsonSolve).toBe('number');
      expect(Math.round((jsonPeek as number) * 1000), `peek L${level.level}`).toBe(level.peekMs);
      expect(jsonSolve, `solve L${level.level}`).toBe(level.timeSec);
    }
  });
});

describe('resolveLeafMemoryConfig — null ctx (no configurations block)', () => {
  it('returns the hardcoded fallbacks', () => {
    const out = resolveLeafMemoryConfig(undefined);
    expect(out.startIndex).toBe(0);
    expect(out.levels.length).toBe(MAX_LEVEL);
    expect(out.showHighScore).toBe(true);
    expect(out.showLevelIndicator).toBe(true);
    expect(out.mismatchFlipBackMs).toBe(600);
  });

  it('preserves the static difficulty ladder values when no overrides apply', () => {
    const out = resolveLeafMemoryConfig({ seed: null, locale: null, skin: null, config: null });
    for (let i = 0; i < DIFFICULTY_LADDER.length; i++) {
      expect(out.levels[i]?.peekMs).toBe(DIFFICULTY_LADDER[i]?.peekMs);
      expect(out.levels[i]?.timeSec).toBe(DIFFICULTY_LADDER[i]?.timeSec);
      expect(out.levels[i]?.pairs).toBe(DIFFICULTY_LADDER[i]?.pairs);
    }
  });
});

describe('resolveLeafMemoryConfig — start_level', () => {
  it('translates start_level=1 to startIndex=0', () => {
    const out = resolveLeafMemoryConfig({ seed: null, locale: null, skin: null, config: { start_level: 1 } });
    expect(out.startIndex).toBe(0);
  });
  it('translates start_level=3 to startIndex=2', () => {
    const out = resolveLeafMemoryConfig({ seed: null, locale: null, skin: null, config: { start_level: 3 } });
    expect(out.startIndex).toBe(2);
  });
  it('translates start_level=4 to startIndex=3 (top of ladder)', () => {
    const out = resolveLeafMemoryConfig({ seed: null, locale: null, skin: null, config: { start_level: 4 } });
    expect(out.startIndex).toBe(3);
  });
  it('clamps start_level=99 to the top of the ladder', () => {
    const out = resolveLeafMemoryConfig({ seed: null, locale: null, skin: null, config: { start_level: 99 } });
    expect(out.startIndex).toBe(MAX_LEVEL - 1);
  });
  it('clamps start_level=0 to the bottom', () => {
    const out = resolveLeafMemoryConfig({ seed: null, locale: null, skin: null, config: { start_level: 0 } });
    expect(out.startIndex).toBe(0);
  });
  it('rounds non-integer start_level (1.7 -> 2 -> index 1)', () => {
    const out = resolveLeafMemoryConfig({ seed: null, locale: null, skin: null, config: { start_level: 1.7 } });
    expect(out.startIndex).toBe(1);
  });
});

describe('resolveLeafMemoryConfig — per-level timing overrides', () => {
  it('applies memorize_seconds_level_2 (seconds -> peekMs)', () => {
    const out = resolveLeafMemoryConfig({
      seed: null,
      locale: null,
      skin: null,
      config: { memorize_seconds_level_2: 2 },
    });
    expect(out.levels[1]?.peekMs).toBe(2000);
    // Untouched levels stay at default ladder values.
    expect(out.levels[0]?.peekMs).toBe(DIFFICULTY_LADDER[0]?.peekMs);
    expect(out.levels[2]?.peekMs).toBe(DIFFICULTY_LADDER[2]?.peekMs);
  });

  it('applies solve_seconds_level_3 directly (already seconds)', () => {
    const out = resolveLeafMemoryConfig({
      seed: null,
      locale: null,
      skin: null,
      config: { solve_seconds_level_3: 45 },
    });
    expect(out.levels[2]?.timeSec).toBe(45);
    expect(out.levels[0]?.timeSec).toBe(DIFFICULTY_LADDER[0]?.timeSec);
  });

  it('preserves layout fields (pairs/cols/rows) under timing override', () => {
    const out = resolveLeafMemoryConfig({
      seed: null,
      locale: null,
      skin: null,
      config: { solve_seconds_level_1: 1 },
    });
    expect(out.levels[0]?.pairs).toBe(DIFFICULTY_LADDER[0]?.pairs);
    expect(out.levels[0]?.cols).toBe(DIFFICULTY_LADDER[0]?.cols);
    expect(out.levels[0]?.rows).toBe(DIFFICULTY_LADDER[0]?.rows);
  });
});

describe('resolveLeafMemoryConfig — boolean toggles', () => {
  it('show_high_score=false propagates', () => {
    const out = resolveLeafMemoryConfig({ seed: null, locale: null, skin: null, config: { show_high_score: false } });
    expect(out.showHighScore).toBe(false);
  });
  it('show_level_indicator=false propagates', () => {
    const out = resolveLeafMemoryConfig({ seed: null, locale: null, skin: null, config: { show_level_indicator: false } });
    expect(out.showLevelIndicator).toBe(false);
  });
});

describe('resolveLeafMemoryConfig — type guards (defensive)', () => {
  it('ignores string-form numbers and falls back to defaults', () => {
    const out = resolveLeafMemoryConfig({
      seed: null,
      locale: null,
      skin: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config: { start_level: '3' as any, mismatch_flip_back_ms: '200' as any },
    });
    expect(out.startIndex).toBe(0);
    expect(out.mismatchFlipBackMs).toBe(600);
  });
  it('ignores string-form booleans', () => {
    const out = resolveLeafMemoryConfig({
      seed: null,
      locale: null,
      skin: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config: { show_high_score: 'false' as any },
    });
    expect(out.showHighScore).toBe(true);
  });
});

describe('bundled preset behaviors', () => {
  it('start_at_3 preset starts at level 3 with default everything else', () => {
    const out = resolveLeafMemoryConfig({
      seed: null,
      locale: null,
      skin: null,
      // Use raw preset payload to mirror what the widget resolver hands the game.
      // The resolver in widget would have flattened _extends already; we feed
      // the post-flatten shape here.
      config: { start_level: 3, mismatch_flip_back_ms: 600, show_high_score: true, show_level_indicator: true },
    });
    expect(out.startIndex).toBe(2);
  });
});

// LC3 regression: prior to LC1 fix, the start-button click handler in game.ts
// hardcoded `currentIndex = 0`, silently defeating the `start_level` config.
// These tests drive `runLeafMemory` end-to-end and assert the first round
// after Start uses the configured level + ladder values, not the
// hardcoded level 1.
describe('runLeafMemory — start_level threads through Start button', () => {
  it('config.start_level=3 opens the first round at level 3 (4 pairs, 4x2)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    runLeafMemory({
      container,
      bridge: makeBridge(),
      ctx: { seed: null, locale: null, skin: null, config: { start_level: 3 } },
    });
    const startBtn = container.querySelector('.lm-screen button') as HTMLButtonElement | null;
    expect(startBtn).not.toBeNull();
    startBtn!.click();

    // Level chip reflects the started level (3/4) — and 4 pairs = 8 cards.
    const levelEl = container.querySelector('.lm-level');
    expect(levelEl?.textContent).toContain('3');
    expect(container.querySelectorAll('.lm-cell').length).toBe(8);
  });

  it('config.start_level absent → default round opens at level 1 (2 pairs, 2x2)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    runLeafMemory({ container, bridge: makeBridge() });
    const startBtn = container.querySelector('.lm-screen button') as HTMLButtonElement | null;
    startBtn!.click();
    expect(container.querySelectorAll('.lm-cell').length).toBe(4);
  });

  it('config.start_level=4 opens at level 4 (6 pairs, 4x3 = 12 cards)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    runLeafMemory({
      container,
      bridge: makeBridge(),
      ctx: { seed: null, locale: null, skin: null, config: { start_level: 4 } },
    });
    const startBtn = container.querySelector('.lm-screen button') as HTMLButtonElement | null;
    startBtn!.click();
    expect(container.querySelectorAll('.lm-cell').length).toBe(12);
  });
});

describe('runLeafMemory — header visibility toggles via config', () => {
  it('show_high_score=false hides the Best chip', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    runLeafMemory({
      container,
      bridge: makeBridge(),
      ctx: { seed: null, locale: null, skin: null, config: { show_high_score: false } },
    });
    const bestEl = container.querySelector('.lm-best') as HTMLElement | null;
    expect(bestEl?.style.visibility).toBe('hidden');
  });

  it('show_level_indicator=false hides the Level chip', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    runLeafMemory({
      container,
      bridge: makeBridge(),
      ctx: { seed: null, locale: null, skin: null, config: { show_level_indicator: false } },
    });
    const levelEl = container.querySelector('.lm-level') as HTMLElement | null;
    expect(levelEl?.style.visibility).toBe('hidden');
  });
});
