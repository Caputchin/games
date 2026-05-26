import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runLeafMemory } from '../src/game';
import type { Bridge, GameContext, ResolvedLocale } from '@caputchin/game-sdk';
import { FIXED_TIMESTEP_MS } from '@caputchin/engine-runtime';

function ctxWithLocale(iso: string, direction: 'ltr' | 'rtl' = 'ltr'): GameContext {
  return {
    seed: null,
    locale: { _lang: iso, _direction: direction } as ResolvedLocale,
    skin: null,
    config: null,
  };
}

function makeBridge() {
  return {
    pass: vi.fn(),
    error: vi.fn(),
    setSize: vi.fn(),
    layout: null,
  } satisfies Bridge;
}

/** Fake rAF/cAF + a monotonic `now()` so tests can advance simulation time
 *  without real timers. Each call to `pump(ticks)` fires one rAF callback
 *  per tick step, advancing `now` by FIXED_TIMESTEP_MS + ε so the
 *  accumulator drains exactly one tick at a time. */
function makeLoop() {
  let t = 0;
  let pending: ((ts: number) => void) | null = null;
  let handle = 0;

  function raf(cb: (ts: number) => void): number {
    pending = cb;
    return ++handle;
  }
  function caf(_h: number): void {
    pending = null;
  }
  function now(): number {
    return t;
  }

  /** Advance by one rAF frame worth of time and fire the callback. */
  function step(): void {
    const cb = pending;
    if (!cb) return;
    pending = null;
    t += FIXED_TIMESTEP_MS + 0.01; // slightly above step so acc drains cleanly
    cb(t);
  }

  /** Pump `n` frames. */
  function pump(n: number): void {
    for (let i = 0; i < n; i++) step();
  }

  return { raf, caf, now, pump, step };
}

/** End the peek phase by clicking any board cell right after Start. */
function endPeek(container: HTMLElement): void {
  const cell = container.querySelector('.lm-cell') as HTMLButtonElement | null;
  cell?.click();
}

function clickCard(container: HTMLElement, index: number): void {
  const cell = container.querySelectorAll('.lm-cell')[index] as HTMLButtonElement | undefined;
  cell?.click();
}

function findCells(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('.lm-cell')) as HTMLButtonElement[];
}

/** Drives a full pair-matching loop by reading each card's leaf SVG to
 *  identify pairs and clicking the matches. Works regardless of shuffle. */
function clearRound(container: HTMLElement): void {
  const cells = findCells(container);
  const leaves = cells.map((c) => c.querySelector('.lm-front')?.innerHTML ?? '');
  const matched = new Set<number>();
  for (let i = 0; i < cells.length; i++) {
    if (matched.has(i)) continue;
    for (let j = i + 1; j < cells.length; j++) {
      if (matched.has(j)) continue;
      if (leaves[i] === leaves[j]) {
        cells[i]?.click();
        cells[j]?.click();
        matched.add(i);
        matched.add(j);
        break;
      }
    }
  }
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('runLeafMemory state machine', () => {
  it('boots into the start screen with title + Start button + no level shown', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const loop = makeLoop();
    runLeafMemory({ container, bridge: makeBridge(), raf: loop.raf, caf: loop.caf, now: loop.now });

    const title = container.querySelector('.lm-screen-title');
    const buttons = container.querySelectorAll('.lm-screen button');
    const level = container.querySelector('.lm-level');
    const time = container.querySelector('.lm-time');
    const best = container.querySelector('.lm-best');

    expect(title?.textContent).toBe('Leaf Memory');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.textContent).toBe('Start');
    expect(level?.getAttribute('data-hidden')).toBe('true');
    expect(time?.getAttribute('data-hidden')).toBe('true');
    expect(best?.textContent).toMatch(/Best/);
  });

  it('clicking the board during peek ends the memorize phase immediately', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const loop = makeLoop();
    runLeafMemory({
      container, bridge: makeBridge(),
      raf: loop.raf, caf: loop.caf, now: loop.now,
      peekMsOverride: 5_000,
    });

    (container.querySelector('.lm-screen button') as HTMLButtonElement).click();
    // Some cells should be revealed (peek phase).
    expect(container.querySelectorAll('.lm-cell[data-flipped="true"]').length).toBeGreaterThan(0);

    // Click any cell — peek should end immediately.
    (container.querySelector('.lm-cell') as HTMLButtonElement).click();

    // All non-matched cards now covered.
    expect(container.querySelectorAll('.lm-cell[data-flipped="true"]').length).toBe(0);
    expect(container.querySelector('.lm-time')?.getAttribute('data-hidden')).toBe('false');
  });

  it('Start kicks the player into L1 with peek + board', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const loop = makeLoop();
    runLeafMemory({
      container, bridge: makeBridge(),
      raf: loop.raf, caf: loop.caf, now: loop.now,
      peekMsOverride: 0,
    });

    (container.querySelector('.lm-screen button') as HTMLButtonElement).click();

    expect(container.querySelectorAll('.lm-cell')).toHaveLength(4);
    expect(container.querySelector('.lm-level')?.textContent).toContain('1');
    expect(container.querySelector('.lm-time')?.getAttribute('data-hidden')).toBe('false');
  });

  it('first pass fires bridge.pass and shows win screen with per-level harder label', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const bridge = makeBridge();
    const loop = makeLoop();
    runLeafMemory({
      container, bridge,
      raf: loop.raf, caf: loop.caf, now: loop.now,
      peekMsOverride: 0,
    });

    (container.querySelector('.lm-screen button') as HTMLButtonElement).click();
    clearRound(container);
    // Pump a tick so the sim processes the picks.
    loop.pump(5);

    expect(bridge.pass).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.lm-screen--win')).not.toBeNull();
    const buttons = Array.from(container.querySelectorAll('.lm-screen button')).map((b) => b.textContent);
    expect(buttons).toEqual(['Retry', 'Bigger board!']);
    expect(container.querySelector('.lm-best')?.textContent).not.toContain('—');
  });

  it('harder-button label climbs per level (Bigger board / Even bigger / Final challenge)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const bridge = makeBridge();
    const loop = makeLoop();
    runLeafMemory({
      container, bridge,
      raf: loop.raf, caf: loop.caf, now: loop.now,
      peekMsOverride: 0,
    });

    const expected = ['Bigger board!', 'Even bigger!', 'Final challenge!'];
    (container.querySelector('.lm-screen button') as HTMLButtonElement).click();
    for (const label of expected) {
      clearRound(container);
      loop.pump(10);
      const harder = Array.from(container.querySelectorAll('.lm-screen button')).find(
        (b) => b.textContent === label,
      ) as HTMLButtonElement | undefined;
      expect(harder, `expected button "${label}"`).toBeDefined();
      harder?.click();
    }
  });

  it('win-screen title climbs per level', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const bridge = makeBridge();
    const loop = makeLoop();
    runLeafMemory({
      container, bridge,
      raf: loop.raf, caf: loop.caf, now: loop.now,
      peekMsOverride: 0,
    });

    const expected = ['You win!', 'Nice memory!', 'Razor sharp!', 'No bot can ever be that good!'];
    const harderLabels = ['Bigger board!', 'Even bigger!', 'Final challenge!'];
    (container.querySelector('.lm-screen button') as HTMLButtonElement).click();
    for (let i = 0; i < expected.length; i++) {
      clearRound(container);
      loop.pump(10);
      expect(container.querySelector('.lm-screen-title')?.textContent).toBe(expected[i]);
      if (i < harderLabels.length) {
        const harder = Array.from(container.querySelectorAll('.lm-screen button')).find(
          (b) => b.textContent === harderLabels[i],
        ) as HTMLButtonElement | undefined;
        harder?.click();
      }
    }
  });

  it('top-level win shows Retry only (no harder button at L4)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const bridge = makeBridge();
    const loop = makeLoop();
    runLeafMemory({
      container, bridge,
      raf: loop.raf, caf: loop.caf, now: loop.now,
      peekMsOverride: 0,
    });

    const harderLabels = ['Bigger board!', 'Even bigger!', 'Final challenge!'];
    (container.querySelector('.lm-screen button') as HTMLButtonElement).click();
    for (let i = 0; i < 4; i++) {
      clearRound(container);
      loop.pump(10);
      if (i < 3) {
        const harder = Array.from(container.querySelectorAll('.lm-screen button')).find(
          (b) => b.textContent === harderLabels[i],
        ) as HTMLButtonElement | undefined;
        harder?.click();
      }
    }

    expect(container.querySelector('.lm-level')?.textContent).toContain('4');
    const buttons = Array.from(container.querySelectorAll('.lm-screen button')).map((b) => b.textContent);
    expect(buttons).toEqual(['Retry']);
  });

  it('L1 loss screen shows Retry only when time runs out', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const loop = makeLoop();
    runLeafMemory({
      container, bridge: makeBridge(),
      raf: loop.raf, caf: loop.caf, now: loop.now,
      peekMsOverride: 0,
    });

    (container.querySelector('.lm-screen button') as HTMLButtonElement).click();
    // Pump enough ticks to exhaust the L1 time budget (5s / 16ms = ~313 ticks).
    loop.pump(400);

    expect(container.querySelector('.lm-screen--loss')).not.toBeNull();
    const buttons = Array.from(container.querySelectorAll('.lm-screen button')).map((b) => b.textContent);
    expect(buttons).toEqual(['Retry']);
  });
});

describe('runLeafMemory locale rendering (lang + CJK font)', () => {
  function root(container: HTMLElement): HTMLElement {
    return container.querySelector('.lm-root') as HTMLElement;
  }

  it('publishes the resolved language on the root lang attribute', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const loop = makeLoop();
    runLeafMemory({
      container, bridge: makeBridge(),
      raf: loop.raf, caf: loop.caf, now: loop.now,
      ctx: ctxWithLocale('fr'),
    });
    expect(root(container).getAttribute('lang')).toBe('fr');
  });

  it('defaults the lang attribute to en when no locale resolves', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const loop = makeLoop();
    runLeafMemory({
      container, bridge: makeBridge(),
      raf: loop.raf, caf: loop.caf, now: loop.now,
    });
    expect(root(container).getAttribute('lang')).toBe('en');
  });

  it('sets the --lm-cjk font stack for a CJK locale', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const loop = makeLoop();
    runLeafMemory({
      container, bridge: makeBridge(),
      raf: loop.raf, caf: loop.caf, now: loop.now,
      ctx: ctxWithLocale('ja'),
    });
    expect(root(container).style.getPropertyValue('--lm-cjk')).toContain('Hiragino Sans');
  });

  it('leaves --lm-cjk unset (stylesheet default wins) for a non-CJK locale', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const loop = makeLoop();
    runLeafMemory({
      container, bridge: makeBridge(),
      raf: loop.raf, caf: loop.caf, now: loop.now,
      ctx: ctxWithLocale('en'),
    });
    expect(root(container).style.getPropertyValue('--lm-cjk')).toBe('');
  });
});
