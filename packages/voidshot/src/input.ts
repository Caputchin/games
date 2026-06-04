// Input capture. Produces the cursor target in WORLD coordinates plus the pulse
// flag, the only things the sim consumes. Three first-class modalities:
//   - pointer (mouse OR touch drag): target = the arena point under the cursor.
//   - keyboard (WASD / arrows): target = player position + held direction (so the
//     drone heads that way); auto-aim removes any need to aim.
//   - pulse: pointerdown OR Space.
// Mouse-only is fully playable: cursor = target, guns are automatic.

import { ARENA_R } from './constants.js';

/** Screen->world projection for the arena plane, owned by the renderer. */
export interface Viewport {
  toWorld(clientX: number, clientY: number): { x: number; z: number };
}

export interface InputSample {
  tx: number;
  tz: number;
  pulse: boolean;
}

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

export class Input {
  private px = 0;
  private pz = 0;
  private ptrX = 0;
  private ptrZ = 0;
  private usingKeyboard = false;
  private pulseHeld = false;
  private readonly keys = new Set<string>();
  private readonly cleanups: Array<() => void> = [];

  constructor(
    private readonly el: HTMLElement,
    private readonly viewport: Viewport,
  ) {
    this.on(el, 'pointermove', (e) => this.onPointer(e as PointerEvent));
    this.on(el, 'pointerdown', (e) => {
      this.onPointer(e as PointerEvent);
      this.pulseHeld = true;
      this.usingKeyboard = false;
    });
    this.on(el, 'pointerup', () => {
      this.pulseHeld = false;
    });
    this.on(el, 'pointercancel', () => {
      this.pulseHeld = false;
    });
    // Keyboard lives on the window so focus on the canvas isn't required.
    this.on(window, 'keydown', (e) => this.onKey(e as KeyboardEvent, true));
    this.on(window, 'keyup', (e) => this.onKey(e as KeyboardEvent, false));
    this.on(el, 'contextmenu', (e) => e.preventDefault());
  }

  /** Renderer feeds the latest player position for keyboard lookahead. */
  setPlayer(x: number, z: number): void {
    this.px = x;
    this.pz = z;
  }

  private onPointer(e: PointerEvent): void {
    const w = this.viewport.toWorld(e.clientX, e.clientY);
    this.ptrX = w.x;
    this.ptrZ = w.z;
    this.usingKeyboard = false;
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (e.code in MOVE_KEYS) {
      e.preventDefault();
      if (down) {
        this.keys.add(e.code);
        this.usingKeyboard = true;
      } else {
        this.keys.delete(e.code);
      }
    }
    if (e.code === 'Space') {
      if (down) e.preventDefault();
      this.pulseHeld = down;
    }
  }

  /** Current target + pulse for this tick. */
  read(): InputSample {
    let tx: number;
    let tz: number;
    if (this.usingKeyboard && this.keys.size > 0) {
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
      tx = this.px + dx * ARENA_R;
      tz = this.pz + dz * ARENA_R;
    } else {
      tx = this.ptrX;
      tz = this.ptrZ;
    }
    return { tx: clampR(tx), tz: clampR(tz), pulse: this.pulseHeld };
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
