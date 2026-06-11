// The engine-driven verdict is decided by Excalibur collider geometry
// (src/scene/collision-geom.ts); the offline red-team plans winning traces with the
// integer geometry (src/sim/sim.ts integerGeometry). They MUST agree for every
// integer coordinate the trace can carry, or a red-team-planned trace could fail the
// collision-graded engine (or vice versa). This sweeps the whole world and every
// lifecycle button and asserts the two geometries return the identical hit-test.
// `/install` first so excalibur evaluates under the headless shim (it reads ambient
// at module-eval).
import '@caputchin/preset-excalibur/install';
import { describe, it, expect } from 'vitest';
import { integerGeometry } from '../src/sim/sim.js';
import { collisionGeometry } from '../src/scene/collision-geom.js';
import { GAME_LOST, GAME_WAITING, GAME_WON } from '../src/sim/types.js';
import { WORLD_H, WORLD_W } from '../src/sim/constants.js';

const ig = integerGeometry;
const cg = collisionGeometry();

describe('collision geometry == integer geometry (parity)', () => {
  it('onPrepItem + dropTarget agree at every integer world coordinate', () => {
    const mismatches: string[] = [];
    for (let y = 0; y <= WORLD_H; y++) {
      for (let x = 0; x <= WORLD_W; x++) {
        if (cg.onPrepItem(x, y) !== ig.onPrepItem(x, y)) mismatches.push(`prep@${x},${y}`);
        if (cg.dropTarget(x, y) !== ig.dropTarget(x, y)) mismatches.push(`drop@${x},${y}`);
        if (mismatches.length > 8) break;
      }
      if (mismatches.length > 8) break;
    }
    expect(mismatches, mismatches.slice(0, 8).join(' ')).toEqual([]);
  });

  it('inButton agrees for every lifecycle phase + coordinate', () => {
    const mismatches: string[] = [];
    for (const gp of [GAME_WAITING, GAME_WON, GAME_LOST] as const) {
      for (let y = 0; y <= WORLD_H; y++) {
        for (let x = 0; x <= WORLD_W; x++) {
          if (cg.inButton(gp, x, y) !== ig.inButton(gp, x, y)) mismatches.push(`btn@${gp}:${x},${y}`);
          if (mismatches.length > 8) break;
        }
        if (mismatches.length > 8) break;
      }
    }
    expect(mismatches, mismatches.slice(0, 8).join(' ')).toEqual([]);
  });
});
