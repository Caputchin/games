// Trace codec for Paddle Rally. The opaque trace is one character per tick encoding the
// player's paddle intent: '0' = up (-1), '1' = none (0), '2' = down (+1). Compact,
// order-preserving, trivial to decode on the server. The platform never parses it;
// only this game's own encode/decode do.
import type { Action } from './sim.js';

export function encode(actions: readonly Action[]): string {
  let out = '';
  for (const a of actions) out += String(a + 1);
  return out;
}

export function decode(trace: Uint8Array | string): Action[] {
  const text = typeof trace === 'string' ? trace : new TextDecoder().decode(trace);
  const actions: Action[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i) - 48; // '0' -> 0
    actions.push((c === 0 ? -1 : c === 2 ? 1 : 0) as Action);
  }
  return actions;
}
