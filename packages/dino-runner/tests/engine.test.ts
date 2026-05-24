import { describe, it, expect } from 'vitest';
import { Runner, RUNNER_GROUND_Y, runnerCollisionOrigin } from '../src/engine.js';
import { resolveDinoConfig } from '../src/config.js';
import { MS_PER_FRAME, RUNNER } from '../src/constants.js';

const cfg = resolveDinoConfig(undefined);

function newRunner(): Runner {
  const r = new Runner(cfg);
  r.start();
  return r;
}

describe('Runner jump arc', () => {
  it('rises to an apex then lands back on the ground', () => {
    const r = newRunner();
    r.startJump(6);
    let minY = r.y;
    let frames = 0;
    // simulate until grounded again (bounded)
    while (r.status === 'jumping' && frames < 600) {
      r.update(MS_PER_FRAME, 6);
      minY = Math.min(minY, r.y);
      frames += 1;
    }
    expect(minY).toBeLessThan(RUNNER_GROUND_Y - 40); // a real hop
    expect(minY).toBeGreaterThan(0); // never left the world top
    expect(r.y).toBe(RUNNER_GROUND_Y);
    expect(r.status).toBe('running');
    expect(r.jumpCount).toBe(1);
  });

  it('cannot start a jump while waiting (only after start)', () => {
    const r = new Runner(cfg);
    r.startJump(6);
    expect(r.status).toBe('waiting');
  });

  it('a released (tapped) jump peaks lower than a held jump (variable jump)', () => {
    function apexHeight(release: boolean): number {
      const r = newRunner();
      r.startJump(6);
      let minY = r.y;
      let released = false;
      let frames = 0;
      while (r.status === 'jumping' && frames < 600) {
        r.update(MS_PER_FRAME, 6);
        if (release && !released && r.y <= RUNNER_GROUND_Y - 30) {
          r.endJump();
          released = true;
        }
        minY = Math.min(minY, r.y);
        frames += 1;
      }
      return RUNNER_GROUND_Y - minY;
    }
    expect(apexHeight(true)).toBeLessThan(apexHeight(false));
  });
});

describe('Runner duck', () => {
  it('switches to the duck pose on the ground', () => {
    const r = newRunner();
    r.setDuck(true);
    expect(r.status).toBe('ducking');
    expect(r.ducking).toBe(true);
    const f = r.frame();
    // Duck renders the full-frame sprite (dino crouched in the art) at the
    // standing y, just wider.
    expect(f.width).toBe(RUNNER.widthDuck);
    expect(f.height).toBe(RUNNER.height);
    expect(f.y).toBe(RUNNER_GROUND_Y);
    r.setDuck(false);
    expect(r.status).toBe('running');
  });

  it('a mid-air duck is a fast fall, not a pose change, and lands ducking', () => {
    const r = newRunner();
    r.startJump(6);
    r.setDuck(true);
    expect(r.status).toBe('jumping'); // still airborne
    let frames = 0;
    while (r.status === 'jumping' && frames < 600) {
      r.update(MS_PER_FRAME, 6);
      frames += 1;
    }
    expect(r.status).toBe('ducking'); // duck still held on landing
  });
});

describe('runnerCollisionOrigin', () => {
  it('reports the standing top-left even while ducking', () => {
    const r = newRunner();
    r.setDuck(true);
    const o = runnerCollisionOrigin(r);
    expect(o.x).toBe(RUNNER.startX);
    expect(o.y).toBe(RUNNER_GROUND_Y);
    expect(o.ducking).toBe(true);
  });
});

describe('Runner reset', () => {
  it('returns to the idle waiting pose', () => {
    const r = newRunner();
    r.startJump(6);
    r.reset();
    expect(r.status).toBe('waiting');
    expect(r.y).toBe(RUNNER_GROUND_Y);
    expect(r.jumpCount).toBe(0);
  });
});
