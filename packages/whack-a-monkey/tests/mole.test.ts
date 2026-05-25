import { describe, it, expect } from 'vitest';
import {
  springStep,
  spawnMole,
  stepMole,
  tapMole,
  isTappable,
  timingFraction,
  hitScale,
} from '../src/mole.js';
import { MAX_DT, MIN_HIT_SCALE, RETRACT_OMEGA } from '../src/constants.js';

describe('springStep', () => {
  it('converges to the target', () => {
    let pos = 0;
    let vel = 0;
    for (let i = 0; i < 2000; i++) {
      const s = springStep(pos, vel, 1, 22, 0.55, 1 / 240);
      pos = s.pos;
      vel = s.vel;
    }
    expect(pos).toBeCloseTo(1, 2);
    expect(vel).toBeCloseTo(0, 2);
  });

  it('does not overshoot when critically damped from rest', () => {
    let pos = 0;
    let vel = 0;
    let maxPos = 0;
    for (let i = 0; i < 2000; i++) {
      const s = springStep(pos, vel, 1, RETRACT_OMEGA, 1.0, 1 / 240);
      pos = s.pos;
      vel = s.vel;
      maxPos = Math.max(maxPos, pos);
    }
    expect(maxPos).toBeLessThanOrEqual(1.0001);
  });

  it('stays stable at the MAX_DT clamp', () => {
    let pos = 0;
    let vel = 0;
    for (let i = 0; i < 600; i++) {
      const s = springStep(pos, vel, 1, 30, 0.7, MAX_DT);
      pos = s.pos;
      vel = s.vel;
    }
    expect(Number.isFinite(pos)).toBe(true);
    expect(pos).toBeCloseTo(1, 1);
  });
});

describe('mole lifecycle', () => {
  it('spawns up, compressed, with anticipation velocity', () => {
    const m = spawnMole(0, 4, 'monkey', null, 0.8);
    expect(m.phase).toBe('up');
    expect(m.scaleY).toBe(0);
    expect(m.scaleVel).toBeLessThan(0);
    expect(isTappable(m)).toBe(true);
  });

  it('rises toward full scale while up', () => {
    let m = spawnMole(0, 0, 'monkey', null, 1.0);
    for (let i = 0; i < 20; i++) m = stepMole(m, 1 / 60);
    expect(m.scaleY).toBeGreaterThan(0.5);
    expect(m.phase).toBe('up');
  });

  it('auto-retracts after its uptime and eventually dies', () => {
    let m = spawnMole(0, 0, 'monkey', null, 0.3);
    let sawRetract = false;
    for (let i = 0; i < 600; i++) {
      const wasUp = m.phase === 'up';
      m = stepMole(m, 1 / 60);
      if (wasUp && m.phase === 'retracting') sawRetract = true;
    }
    expect(sawRetract).toBe(true);
    expect(m.phase).toBe('dead');
  });

  it('tap starts the duck, marks the hit, and fires the punch', () => {
    const m = spawnMole(0, 0, 'monkey', null, 1.0);
    const tapped = tapMole(m);
    expect(tapped.phase).toBe('retracting');
    expect(tapped.hit).toBe(true);
    expect(tapped.punch).toBeGreaterThan(1);
    expect(isTappable(tapped)).toBe(false);
    // tapping a non-up mole is a no-op
    expect(tapMole(tapped)).toBe(tapped);
  });

  it('timingFraction decays from 1 to 0 over the uptime', () => {
    const fresh = spawnMole(0, 0, 'monkey', null, 1.0);
    expect(timingFraction(fresh)).toBeCloseTo(1, 6);
    const stale = { ...fresh, age: 1.0 };
    expect(timingFraction(stale)).toBe(0);
    const past = { ...fresh, age: 5 };
    expect(timingFraction(past)).toBe(0);
  });

  it('floors the hit-test scale so a partly-risen mole is still tappable', () => {
    const m = spawnMole(0, 0, 'monkey', null, 1.0); // scaleY 0
    expect(hitScale(m)).toBe(MIN_HIT_SCALE);
  });
});
