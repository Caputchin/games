// Block + chrome colors, resolved from the site skin with an original default
// palette. The default piece-to-color mapping is deliberately NOT the canonical
// Tetris set (cyan-I, yellow-O, purple-T, ...), so none of that trade dress is
// reproduced.

import type { ResolvedSkin } from '@caputchin/game-sdk';

export interface Palette {
  readonly well: string;
  readonly grid: string;
  readonly text: string;
  readonly accent: string;
  readonly danger: string;
  readonly pieces: readonly string[];
}

const DEFAULT: Palette = {
  well: '#11131c',
  grid: '#20243a',
  text: '#e6e9f5',
  accent: '#67c98b',
  danger: '#e85b7a',
  // I, O, T, S, Z, J, L — an original, scrambled-vs-canonical hue set.
  pieces: ['#e8794b', '#5b8cff', '#4ec3c9', '#e6b34a', '#9b6cff', '#67c98b', '#e85b7a'],
};

export function resolvePalette(skin: ResolvedSkin | null): Palette {
  if (!skin) return DEFAULT;
  const s = skin as Record<string, unknown>;
  const str = (key: string, def: string): string =>
    typeof s[key] === 'string' ? (s[key] as string) : def;
  return {
    well: str('well', DEFAULT.well),
    grid: str('grid', DEFAULT.grid),
    text: str('text', DEFAULT.text),
    accent: str('accent', DEFAULT.accent),
    danger: str('danger', DEFAULT.danger),
    pieces: DEFAULT.pieces.map((d, i) => str(`piece${i}`, d)),
  };
}

/** Parse `#rrggbb` into [r, g, b] (0-255). */
export function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
