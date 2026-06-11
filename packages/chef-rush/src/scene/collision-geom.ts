// The engine-driven verdict geometry: every box hit-test the rule core needs is
// decided by an Excalibur Collider's `contains`, so the live AND headless replay
// decide drop-target / prep-hit / button-hit with the engine's own collision geometry
// (not hand-rolled math). Each region the rules use is an axis-aligned box
// (Chebyshev / rect), so an `ex.Shape.Box` collider is bit-identical to the integer
// geometry the red-team drives with - tests/collision-parity.test.ts guards that, so
// an offline-planned winning trace still passes the collision-graded engine.

import * as ex from 'excalibur';
import {
  overlayButtonRect,
  PREP,
  PREP_R,
  STATIONS,
  STATION_R,
  TRASH,
  TRASH_R,
} from '../sim/constants.js';
import { DROP_NONE, DROP_TRASH, GAME_WAITING, type GamePhase } from '../sim/types.js';
import type { SimGeometry } from '../sim/sim.js';

/** A box collider of width x height centred at (cx, cy). The rules' integer box tests
 *  are EDGE-INCLUSIVE (`cheb <= r`, `x <= b.x + b.w`) while Excalibur's `contains` is
 *  edge-exclusive, so we grow the box by 1px (half-extent + 0.5): an integer edge coord
 *  then sits strictly inside and the next integer strictly outside - making `contains`
 *  bit-identical to the integer test for every integer coordinate (the only coords a
 *  recorded trace carries). The +0.5 boundary never lands on an integer, so the
 *  exclusive/inclusive question is moot. */
function boxAt(cx: number, cy: number, w: number, h: number): ex.Collider {
  return ex.Shape.Box(w + 1, h + 1, ex.Vector.Half, ex.vec(cx, cy));
}

/** Build the SimGeometry backed by Excalibur colliders. Constructed once; the colliders
 *  are static (the stations / trash / prep / overlay button never move). */
export function collisionGeometry(): SimGeometry {
  const prep = boxAt(PREP.x, PREP.y, PREP_R * 2, PREP_R * 2);
  const stations = STATIONS.map((s) => boxAt(s.x, s.y, STATION_R * 2, STATION_R * 2));
  const trash = boxAt(TRASH.x, TRASH.y, TRASH_R * 2, TRASH_R * 2);
  // The button rect depends on the lifecycle phase (the card height differs); WON and
  // LOST share a rect, WAITING has its own - two distinct colliders, built on demand.
  const buttons = new Map<number, ex.Collider>();
  const buttonFor = (gamePhase: GamePhase): ex.Collider => {
    let c = buttons.get(gamePhase);
    if (!c) {
      const b = overlayButtonRect(gamePhase);
      c = boxAt(b.x + b.w / 2, b.y + b.h / 2, b.w, b.h);
      buttons.set(gamePhase, c);
    }
    return c;
  };
  // Warm the two distinct phase buttons up front (deterministic, allocation-free at tick).
  buttonFor(GAME_WAITING);

  return {
    onPrepItem: (x, y) => prep.contains(ex.vec(x, y)),
    dropTarget: (x, y) => {
      const p = ex.vec(x, y);
      for (let i = 0; i < stations.length; i++) if (stations[i]!.contains(p)) return i;
      if (trash.contains(p)) return DROP_TRASH;
      return DROP_NONE;
    },
    inButton: (gamePhase, x, y) => buttonFor(gamePhase).contains(ex.vec(x, y)),
  };
}
