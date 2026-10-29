import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runDinoRunner } from '../src/game.js';
import type { Bridge, GameContext } from '@caputchin/game-sdk';

// Integration smoke for the orchestrator: mount, start, run the frame loop,
// and tear down without throwing. Frame physics are unit-tested elsewhere;
// here we drive a controllable rAF and assert the wiring holds.
function harness(ctx?: GameContext) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const bridge: Bridge = { pass: vi.fn(), error: vi.fn(), setSize: vi.fn(), layout: null };

  let next: ((ts: number) => void) | null = null;
  const raf = (cb: (ts: number) => void): number => {
    next = cb;
    return 1;
  };
  const caf = (): void => {
    next = null;
  };
  let ts = 0;
  const pump = (frames: number, dt = 16): void => {
    for (let i = 0; i < frames; i += 1) {
      const cb = next;
      next = null;
      ts += dt;
      cb?.(ts);
    }
  };

  const cleanup = runDinoRunner({ container, bridge, ctx, raf, caf });
  return { container, bridge, pump, cleanup };
}

describe('runDinoRunner', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  it('mounts the shell with the start overlay', () => {
    const { container, cleanup } = harness();
    expect(container.querySelector('.dr-root')).not.toBeNull();
    expect(container.querySelector('.dr-overlay--start')).not.toBeNull();
    expect(container.querySelector('.dr-runner')).not.toBeNull();
    cleanup();
  });

  it('starts on a jump key and accrues score across frames', () => {
    const { container, bridge, pump, cleanup } = harness();
    pump(2); // idle frames
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(container.querySelector('.dr-overlay--start')).toBeNull(); // run started
    pump(40); // run a while
    const score = container.querySelector('.dr-hud-score')?.textContent ?? '';
    expect(score).not.toBe('');
    expect(score).not.toContain('00000'); // distance has accrued
    expect(bridge.pass).not.toHaveBeenCalled(); // nowhere near pass_score yet
    cleanup();
  });

  it('fires bridge.pass once at the pass threshold and keeps running', () => {
    // pass_score = 1 verifies after a few frames, before any obstacle reaches
    // the runner, so the mid-run verify path is exercised deterministically.
    const ctx = { locale: null, skin: null, config: { pass_score: 1 } } as unknown as GameContext;
    const { container, bridge, pump, cleanup } = harness(ctx);
    pump(2);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    pump(20); // accrue past score 1

    expect(bridge.pass).toHaveBeenCalledTimes(1);
    const arg = (bridge.pass as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(typeof arg.trace).toBe('string');
    expect(arg.trace.length).toBeGreaterThan(0);
    // Verified badge is shown and the run is still going (not crashed).
    expect(container.querySelector('.dr-badge')?.getAttribute('data-hidden')).toBe('false');
    expect(container.querySelector('.dr-overlay--gameover')).toBeNull();

    // The verify is latched: running further does not re-fire the pass event.
    pump(20);
    expect(bridge.pass).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('hides the HUD backing until it has something to show', () => {
    // Score and best off: the HUD box (and its sky-masking backing) stays
    // hidden until the run verifies and the badge appears.
    const ctx = {
      locale: null,
      skin: null,
      config: { pass_score: 1, show_score: false, show_best: false },
    } as unknown as GameContext;
    const { container, pump, cleanup } = harness(ctx);
    const hud = (): string | null | undefined => container.querySelector('.dr-hud')?.getAttribute('data-hidden');
    pump(2);
    expect(hud()).toBe('true');
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    pump(20); // accrue past score 1
    expect(hud()).toBe('false');
    cleanup();
  });

  it('shows the HUD backing from the start when the score is on', () => {
    const { container, cleanup } = harness();
    expect(container.querySelector('.dr-hud')?.getAttribute('data-hidden')).toBe('false');
    cleanup();
  });

  it('puts a 359x90 touch stage in the xs bucket and keeps the tap hint', () => {
    // jsdom has no layout: give the stage the phone-strip rect and a coarse
    // pointer, as a 600x150 frame scaled to a 375 touch viewport would have.
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const [w, h] = this.classList.contains('dr-stage') ? [359, 90] : [0, 0];
        return { x: 0, y: 0, top: 0, left: 0, right: w, bottom: h, width: w, height: h, toJSON: () => ({}) } as DOMRect;
      });
    const media = vi
      .spyOn(window, 'matchMedia')
      .mockImplementation((q: string) => ({ matches: q.includes('coarse') }) as MediaQueryList);
    try {
      const { container, cleanup } = harness();
      expect(container.querySelector<HTMLElement>('.dr-root')?.dataset['size']).toBe('xs');
      const hint = container.querySelector('.dr-overlay--start .dr-hint');
      expect(hint?.textContent).toBe('Tap to jump');
      expect(hint?.getAttribute('aria-hidden')).toBeNull();
      cleanup();
    } finally {
      rect.mockRestore();
      media.mockRestore();
    }
  });

  it('cleans up the DOM and stops the loop', () => {
    const { container, pump, cleanup } = harness();
    cleanup();
    expect(container.querySelector('.dr-root')).toBeNull();
    expect(() => pump(5)).not.toThrow();
  });
});
