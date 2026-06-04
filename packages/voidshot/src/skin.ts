// Resolve the opaque skin (ctx.skin, server-resolved from .caputchin/skins.json)
// into the render palette. Skins are RENDER-ONLY: they are consumed by the OGL
// renderer and the HUD, and never touch the sim, so they cannot affect the
// verdict. Every key falls back to a neon default, so the game renders with
// skin === null.

import type { ResolvedSkin } from '@caputchin/game-sdk';

export interface RenderSkin {
  background: string;
  arena: string;
  grid: string;
  player: string;
  /** Enemy drone hull color (their glow uses the per-type chaser/weaver/splitter). */
  drone: string;
  chaser: string;
  weaver: string;
  splitter: string;
  accent: string;
}

const DEFAULT: RenderSkin = {
  background: '#05060f',
  arena: '#0e1430',
  grid: '#1c2a55',
  player: '#36f0ff',
  drone: '#9aa6bd',
  chaser: '#ff3d7f',
  weaver: '#ffd23d',
  splitter: '#7dff5a',
  accent: '#36f0ff',
};

function color(skin: ResolvedSkin | null | undefined, key: string, fallback: string): string {
  const v = skin?.[key];
  return typeof v === 'string' && v.length > 0 ? v : fallback;
}

export function resolveSkin(skin: ResolvedSkin | null | undefined): RenderSkin {
  return {
    background: color(skin, 'background', DEFAULT.background),
    arena: color(skin, 'arena', DEFAULT.arena),
    grid: color(skin, 'grid', DEFAULT.grid),
    player: color(skin, 'player', DEFAULT.player),
    drone: color(skin, 'drone', DEFAULT.drone),
    chaser: color(skin, 'chaser', DEFAULT.chaser),
    weaver: color(skin, 'weaver', DEFAULT.weaver),
    splitter: color(skin, 'splitter', DEFAULT.splitter),
    accent: color(skin, 'accent', DEFAULT.accent),
  };
}

/** Enemy color by kind code (0 chaser, 1 weaver, 2 splitter). */
export function enemyColor(skin: RenderSkin, kind: number): string {
  if (kind === 1) return skin.weaver;
  if (kind === 2) return skin.splitter;
  return skin.chaser;
}

/** Parse `#rrggbb` to linear-ish [r,g,b] floats in 0..1 for WebGL. */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = h.length === 3
    ? h.split('').map((c) => c + c).join('')
    : h.padEnd(6, '0').slice(0, 6);
  const int = parseInt(n, 16);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}
