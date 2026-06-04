// Input capture. Produces the per-tick sim input: a cursor target in WORLD
// coordinates plus the fire bit. The ship flies toward the target and FACES it, so
// steering IS aiming; the forward bolt stream auto-fires while engaged. Three
// first-class modalities feed the same (tx, tz, fire) the sim consumes:
//   - pointer (mouse OR touch drag): target = the arena point under the cursor.
//   - keyboard (WASD / arrows): fly the ship in the held direction.
//   - accessible (Tab / Enter): cycle the focused drone; the ship engages it
//     (flies toward + faces + fires) so a screen-reader player clears the swarm by
//     target selection rather than precise aim. Announced by the driver.
// Auto-fire means doing nothing never wins: an idle ship lets the swarm converge.

import { ARENA_R } from './constants.js';
import type { Enemy } from './wasm.js';

/** Screen->world projection for the arena plane, owned by the renderer. */
export interface Viewport {
  toWorld(clientX: number, clientY: number): { x: number; z: number };
}

export interface InputSample {
  tx: number;
  tz: number;
  fire: boolean;
}

type Mode = 'pointer' | 'keyboard' | 'a11y';

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

/** A focused enemy is "the same" across frames if one stays within this radius. */
const FOCUS_MATCH_R = 1.6;

export class Input {
  private px = 0;
  private pz = 0;
  private ptrX = 0;
  private ptrZ = 0;
  private mode: Mode = 'pointer';
  private readonly keys = new Set<string>();
  private readonly cleanups: Array<() => void> = [];

  // accessible target-cycle state
  private enemies: Enemy[] = [];
  private focus: { x: number; z: number; kind: number } | null = null;
  private focusChanged = false;

  constructor(
    private readonly el: HTMLElement,
    private readonly viewport: Viewport,
  ) {
    this.on(el, 'pointermove', (e) => this.onPointer(e as PointerEvent));
    this.on(el, 'pointerdown', (e) => this.onPointer(e as PointerEvent));
    // Keyboard lives on the window so focus on the canvas isn't required.
    this.on(window, 'keydown', (e) => this.onKey(e as KeyboardEvent, true));
    this.on(window, 'keyup', (e) => this.onKey(e as KeyboardEvent, false));
    this.on(el, 'contextmenu', (e) => e.preventDefault());
  }

  /** Renderer feeds the latest player position (keyboard lookahead + a11y aim). */
  setPlayer(x: number, z: number): void {
    this.px = x;
    this.pz = z;
  }

  /** Driver feeds the live enemy list each frame (accessible focus tracking). */
  setEnemies(list: Enemy[]): void {
    this.enemies = list;
    if (this.mode === 'a11y' && this.focus) {
      // Re-match the focused enemy by nearest position; null if it died.
      const m = this.nearestTo(this.focus.x, this.focus.z, FOCUS_MATCH_R);
      if (m) this.focus = m;
      else {
        this.focus = null;
        this.focusChanged = true;
      }
    }
  }

  private onPointer(e: PointerEvent): void {
    const w = this.viewport.toWorld(e.clientX, e.clientY);
    this.ptrX = w.x;
    this.ptrZ = w.z;
    this.mode = 'pointer';
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    // Tab / Enter / Space drive the accessible target-cycle mode.
    if (down && (e.code === 'Tab' || e.code === 'Enter' || e.code === 'Space')) {
      e.preventDefault();
      this.mode = 'a11y';
      this.cycleFocus(e.shiftKey ? -1 : 1);
      return;
    }
    if (e.code in MOVE_KEYS) {
      e.preventDefault();
      if (down) {
        this.keys.add(e.code);
        // Arrows cycle the focus while in accessible mode; otherwise fly the ship.
        if (this.mode === 'a11y') {
          const [mx, my] = MOVE_KEYS[e.code]!;
          this.cycleFocus(mx + my < 0 ? -1 : 1);
        } else {
          this.mode = 'keyboard';
        }
      } else {
        this.keys.delete(e.code);
      }
    }
  }

  /** Advance the accessible focus among the live enemies, ordered by bearing. */
  private cycleFocus(dir: number): void {
    const n = this.enemies.length;
    if (n === 0) {
      this.focus = null;
      return;
    }
    const ordered = [...this.enemies].sort(
      (a, b) =>
        Math.atan2(a.z - this.pz, a.x - this.px) - Math.atan2(b.z - this.pz, b.x - this.px),
    );
    let idx = 0;
    if (this.focus) {
      let best = Infinity;
      for (let k = 0; k < ordered.length; k += 1) {
        const e = ordered[k]!;
        const d = (e.x - this.focus.x) ** 2 + (e.z - this.focus.z) ** 2;
        if (d < best) {
          best = d;
          idx = k;
        }
      }
      idx = (idx + dir + n) % n;
    } else {
      // start at the nearest threat
      idx = ordered.indexOf(this.nearestEnemy(ordered)!);
      if (idx < 0) idx = 0;
    }
    const e = ordered[idx]!;
    this.focus = { x: e.x, z: e.z, kind: e.kind };
    this.focusChanged = true;
  }

  private nearestEnemy(list: Enemy[]): Enemy | null {
    let best: Enemy | null = null;
    let bd = Infinity;
    for (const e of list) {
      const d = (e.x - this.px) ** 2 + (e.z - this.pz) ** 2;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  private nearestTo(x: number, z: number, maxR: number): { x: number; z: number; kind: number } | null {
    let best: Enemy | null = null;
    let bd = maxR * maxR;
    for (const e of this.enemies) {
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best ? { x: best.x, z: best.z, kind: best.kind } : null;
  }

  /** Whether accessible mode is active (the driver announces focus + state). */
  isA11y(): boolean {
    return this.mode === 'a11y';
  }

  /** The currently focused drone (null when none / it just died). */
  currentFocus(): { x: number; z: number; kind: number } | null {
    return this.focus;
  }

  /** True once after the focus changed (target picked, advanced, or lost). */
  consumeFocusChanged(): boolean {
    const c = this.focusChanged;
    this.focusChanged = false;
    return c;
  }

  /** Current target + fire for this tick. */
  read(): InputSample {
    if (this.mode === 'a11y') {
      // Engage the focused drone (fly toward + face + fire); idle if none, so the
      // player must keep selecting targets - doing nothing loses.
      if (this.focus) return { tx: clampR(this.focus.x), tz: clampR(this.focus.z), fire: true };
      return { tx: this.px, tz: this.pz, fire: false };
    }
    if (this.mode === 'keyboard' && this.keys.size > 0) {
      let dx = 0;
      let dz = 0;
      for (const k of this.keys) {
        const move = MOVE_KEYS[k];
        if (!move) continue;
        dx += move[0];
        dz += move[1];
      }
      const len = Math.hypot(dx, dz);
      if (len > 1e-5) {
        dx /= len;
        dz /= len;
      }
      return { tx: clampR(this.px + dx * ARENA_R), tz: clampR(this.pz + dz * ARENA_R), fire: true };
    }
    // pointer (or keyboard with no key held: hold position, keep firing)
    return { tx: clampR(this.ptrX), tz: clampR(this.ptrZ), fire: true };
  }

  private on(target: EventTarget, type: string, fn: (e: Event) => void): void {
    target.addEventListener(type, fn as EventListener);
    this.cleanups.push(() => target.removeEventListener(type, fn as EventListener));
  }

  dispose(): void {
    for (const c of this.cleanups) c();
    this.cleanups.length = 0;
    this.keys.clear();
  }
}

function clampR(v: number): number {
  if (v > ARENA_R) return ARENA_R;
  if (v < -ARENA_R) return -ARENA_R;
  return v;
}
