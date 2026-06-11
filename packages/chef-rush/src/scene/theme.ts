// Resolve the operator skin into the typed colour set the shape Actors read. The art
// is built from Excalibur shapes (no gradients/sprites for the kitchen), so a theme
// restyles the whole scene by these colours. Keys match the skin contract in
// src/skin.ts exactly (tests/skin-schema.test.ts guards that), so every colour an
// operator can set in skins.json actually reaches a shape here.

import type { GameContext } from '@caputchin/preset-excalibur';
import { SKIN_COLORS } from '../skin.js';

export interface Theme {
  /** Back wall. */
  readonly wall: string;
  /** Wooden counter band the stations sit on. */
  readonly counter: string;
  /** Cutting board surface. */
  readonly board: string;
  /** Cutting board edge / grain lines. */
  readonly boardEdge: string;
  /** Order ticket + overlay card paper. */
  readonly ticket: string;
  /** Text on the ticket / overlays / labels. */
  readonly ink: string;
  /** Cook + serve accent (success). */
  readonly accent: string;
  /** Lives (hearts) colour. */
  readonly life: string;
  // Fixed industrial tones (not operator-themed; cookware reads as metal regardless).
  readonly metal: string;
  readonly metalDark: string;
  readonly steel: string;
  readonly pan: string;
  readonly trash: string;
  readonly danger: string;
  readonly lifeOff: string;
}

const HEX = /^#([0-9a-f]{3,8})$/i;

/** Resolve the skin map into a Theme, falling back to the built-in default per key. */
export function resolveTheme(skin: GameContext['skin']): Theme {
  const m = (skin ?? {}) as Record<string, unknown>;
  const get = (k: string): string => {
    const v = m[k];
    return typeof v === 'string' && HEX.test(v) ? v : SKIN_COLORS[k]!;
  };
  return {
    wall: get('wall'),
    counter: get('counter'),
    board: get('board'),
    boardEdge: get('board_edge'),
    ticket: get('ticket'),
    ink: get('ink'),
    accent: get('accent_color'),
    life: get('life_color'),
    metal: '#cfd4da',
    metalDark: '#6b7178',
    steel: '#9aa0a8',
    pan: '#33333a',
    trash: '#878e95',
    danger: '#e8615a',
    lifeOff: '#6a5240',
  };
}
