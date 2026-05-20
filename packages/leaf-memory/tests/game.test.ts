import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runLeafMemory } from '../src/game';
import type { Bridge } from '@caputchin/game-sdk';

function makeBridge() {
  return {
    pass: vi.fn(),
    error: vi.fn(),
    setSize: vi.fn(),
    layout: null,
  } satisfies Bridge;
}

// vi.useFakeTimers() doesn't mock performance.now(), so the realClock's
// elapsedSec measurement would always read 0. Drive a fake clock that
// advances in lock-step with vi.advanceTimersByTime.
function makeFakeClock() {
  let t = 0;
  return {
    clock: { now: () => t },
    advance: (ms: number) => { t += ms; vi.advanceTimersByTime(ms); },
  };
}

function clickCard(container: HTMLElement, index: number): void {
  const cell = container.querySelectorAll('.lm-cell')[index] as HTMLButtonElement | undefined;
  cell?.click();
}

function findCells(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('.lm-cell')) as HTMLButtonElement[];
}

// Drives a full pair-matching loop given a known shuffle layout. L1 has 4
// cards = 2 pairs. The runtime uses Math.random for shuffle, but we read
// each card's data-front SVG to identify pairs and click the matches.
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
    runLeafMemory({ container, bridge: makeBridge() });

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
    expect(best?.textContent).toMatch(/Best-/);
  });

  it('clicking the board during peek ends the memorize phase immediately', () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { clock, advance } = makeFakeClock();
    runLeafMemory({ container, bridge: makeBridge(), peekMsOverride: 5_000, clock });

    (container.querySelector('.lm-screen button') as HTMLButtonElement).click();
    // Peek scheduled for 5s; only 100ms in, cards should still be flipped.
    advance(100);
    expect(container.querySelectorAll('.lm-cell[data-flipped="true"]').length).toBeGreaterThan(0);

    // Click any cell — peek should end without waiting for the 5s budget.
    (container.querySelector('.lm-cell') as HTMLButtonElement).click();

    // All non-matched cards now flipped back (covered) and the timer is live.
    expect(container.querySelectorAll('.lm-cell[data-flipped="true"]').length).toBe(0);
    expect(container.querySelector('.lm-time')?.getAttribute('data-hidden')).toBe('false');
  });

  it('Start kicks the player into L1 with peek + board', () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { clock, advance } = makeFakeClock();
    runLeafMemory({ container, bridge: makeBridge(), peekMsOverride: 100, clock });

    (container.querySelector('.lm-screen button') as HTMLButtonElement).click();
    advance(150);

    expect(container.querySelectorAll('.lm-cell')).toHaveLength(4);
    expect(container.querySelector('.lm-level')?.textContent).toContain('1');
    expect(container.querySelector('.lm-time')?.getAttribute('data-hidden')).toBe('false');
  });

  it('first pass fires bridge.pass and shows win screen with per-level harder label', () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const bridge = makeBridge();
    const { clock, advance } = makeFakeClock();
    runLeafMemory({ container, bridge, peekMsOverride: 10, clock });

    (container.querySelector('.lm-screen button') as HTMLButtonElement).click();
    advance(20);
    clearRound(container);

    expect(bridge.pass).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.lm-screen--win')).not.toBeNull();
    const buttons = Array.from(container.querySelectorAll('.lm-screen button')).map((b) => b.textContent);
    expect(buttons).toEqual(['Retry', 'Bigger board!']);
    expect(container.querySelector('.lm-best')?.textContent).not.toContain('—');
  });

  it('harder-button label climbs per level (Bigger board / Even bigger / Final challenge)', () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const bridge = makeBridge();
    const { clock, advance } = makeFakeClock();
    runLeafMemory({ container, bridge, peekMsOverride: 10, clock });

    const expected = ['Bigger board!', 'Even bigger!', 'Final challenge!'];
    (container.querySelector('.lm-screen button') as HTMLButtonElement).click();
    for (const label of expected) {
      advance(20);
      clearRound(container);
      const harder = Array.from(container.querySelectorAll('.lm-screen button')).find(
        (b) => b.textContent === label,
      ) as HTMLButtonElement | undefined;
      expect(harder, `expected button "${label}"`).toBeDefined();
      harder?.click();
    }
  });

  it('win-screen title climbs per level (You win / Nice memory / Razor sharp / bot punchline)', () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const bridge = makeBridge();
    const { clock, advance } = makeFakeClock();
    runLeafMemory({ container, bridge, peekMsOverride: 10, clock });

    const expected = ['You win!', 'Nice memory!', 'Razor sharp!', 'No bot can ever be that good!'];
    const harderLabels = ['Bigger board!', 'Even bigger!', 'Final challenge!'];
    (container.querySelector('.lm-screen button') as HTMLButtonElement).click();
    for (let i = 0; i < expected.length; i++) {
      advance(20);
      clearRound(container);
      expect(container.querySelector('.lm-screen-title')?.textContent).toBe(expected[i]);
      if (i < harderLabels.length) {
        const harder = Array.from(container.querySelectorAll('.lm-screen button')).find(
          (b) => b.textContent === harderLabels[i],
        ) as HTMLButtonElement | undefined;
        harder?.click();
      }
    }
  });

  it('replaying the same level at a lower score does not refire bridge.pass', () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const bridge = makeBridge();
    const { clock, advance } = makeFakeClock();
    runLeafMemory({ container, bridge, peekMsOverride: 10, clock });

    (container.querySelector('.lm-screen button') as HTMLButtonElement).click();
    advance(20);
    clearRound(container);
    expect(bridge.pass).toHaveBeenCalledTimes(1);
    const firstCallScore = bridge.pass.mock.calls[0]?.[0]?.score;

    (container.querySelector('.lm-screen button') as HTMLButtonElement).click();
    advance(20);
    advance(5000);
    clearRound(container);

    expect(bridge.pass).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.lm-best')?.textContent).toContain(String(firstCallScore));
  });

  it('durationMs is the time of the current round only (not cumulative across rounds)', () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const bridge = makeBridge();
    const { clock, advance } = makeFakeClock();
    runLeafMemory({ container, bridge, peekMsOverride: 10, clock });

    (container.querySelector('.lm-screen button') as HTMLButtonElement).click();
    advance(20); // peek + tick
    advance(3000); // 3s of L1 gameplay
    clearRound(container);

    const r1 = bridge.pass.mock.calls[0]?.[0];
    expect(r1?.durationMs).toBeGreaterThanOrEqual(3000);
    expect(r1?.durationMs).toBeLessThan(3100);

    const harder = Array.from(container.querySelectorAll('.lm-screen button')).find(
      (b) => b.textContent === 'Bigger board!',
    ) as HTMLButtonElement;
    harder.click();
    advance(20);
    advance(5000); // 5s of L2 gameplay
    clearRound(container);

    const r2 = bridge.pass.mock.calls[1]?.[0];
    expect(r2?.durationMs).toBeGreaterThanOrEqual(5000);
    expect(r2?.durationMs).toBeLessThan(5100);
    // Critical: r2.durationMs is per-round (≈5000ms), NOT cumulative
    // (which would be ≈8000ms + 2× peek + clear overhead).
  });

  it('top-level win shows Retry only (no harder button at L4)', () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const bridge = makeBridge();
    const { clock, advance } = makeFakeClock();
    runLeafMemory({ container, bridge, peekMsOverride: 10, clock });

    const harderLabels = ['Bigger board!', 'Even bigger!', 'Final challenge!'];
    (container.querySelector('.lm-screen button') as HTMLButtonElement).click();
    for (let i = 0; i < 4; i++) {
      advance(20);
      clearRound(container);
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

  it('L1 loss screen shows Retry only (no Try easier)', () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { clock, advance } = makeFakeClock();
    runLeafMemory({ container, bridge: makeBridge(), peekMsOverride: 10, clock });

    (container.querySelector('.lm-screen button') as HTMLButtonElement).click();
    advance(20);
    advance(11_000); // past L1's 10s budget

    expect(container.querySelector('.lm-screen--loss')).not.toBeNull();
    const buttons = Array.from(container.querySelectorAll('.lm-screen button')).map((b) => b.textContent);
    expect(buttons).toEqual(['Retry']);
  });
});
