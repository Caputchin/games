// Browser-key -> DOOM-key mapping. DOOM key codes are from the engine's
// doomkeys.h; the live platform's phobos_key() feeds them to DG_GetKey.

export const DOOM_KEYS = {
  right: 0xae,   // KEY_RIGHTARROW (turn)
  left: 0xac,    // KEY_LEFTARROW  (turn)
  forward: 0xad, // KEY_UPARROW
  back: 0xaf,    // KEY_DOWNARROW
  strafeL: 0xa0, // KEY_STRAFE_L
  strafeR: 0xa1, // KEY_STRAFE_R
  use: 0xa2,     // KEY_USE
  fire: 0xa3,    // KEY_FIRE
  run: 0x80 + 0x36, // KEY_RSHIFT
  enter: 13,     // KEY_ENTER
} as const;

const CODE_MAP: Record<string, number> = {
  ArrowUp: DOOM_KEYS.forward, KeyW: DOOM_KEYS.forward,
  ArrowDown: DOOM_KEYS.back, KeyS: DOOM_KEYS.back,
  ArrowLeft: DOOM_KEYS.left, KeyA: DOOM_KEYS.left,
  ArrowRight: DOOM_KEYS.right, KeyD: DOOM_KEYS.right,
  KeyQ: DOOM_KEYS.strafeL, KeyE: DOOM_KEYS.strafeR,
  Space: DOOM_KEYS.fire, ControlLeft: DOOM_KEYS.fire, ControlRight: DOOM_KEYS.fire,
  KeyF: DOOM_KEYS.use, Enter: DOOM_KEYS.use,
  ShiftLeft: DOOM_KEYS.run, ShiftRight: DOOM_KEYS.run,
};

/** Map a KeyboardEvent.code to a DOOM key, or 0 if unbound. */
export function mapKey(code: string): number {
  return CODE_MAP[code] ?? 0;
}
