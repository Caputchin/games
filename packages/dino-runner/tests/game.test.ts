import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runDinoRunner } from '../src/game.js';
import type { Bridge } from '@caputchin/game-sdk';

// Integration smoke for the orchestrator: mount, start, run the frame loop,
// and tear down without throwing. Frame physics are unit-tested elsewhere;
// here we drive a controllable rAF and assert the wiring holds.
function harness() {
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

  const cleanup = runDinoRunner({ container, bridge, raf, caf });
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

  it('cleans up the DOM and stops the loop', () => {
    const { container, pump, cleanup } = harness();
    cleanup();
    expect(container.querySelector('.dr-root')).toBeNull();
    expect(() => pump(5)).not.toThrow();
  });
});
