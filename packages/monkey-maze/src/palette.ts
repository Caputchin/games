// Color palette. Entity colors are game-defined (flat, high-contrast); the skin
// preset themes the surrounding shell chrome via CSS custom properties. A site's
// skin (ctx.skin) can override the shell colors; entity colors stay readable.

export interface Palette {
  bg: string;
  wall: string;
  pellet: string;
  power: string;
  runner: string;
  ghost: string[];
  frightened: string;
  eaten: string;
  vars: Record<string, string>;
}

// Defaults match the Canopy (jungle, _default) skin so a no-skin render is still
// on-theme; the resolved skin overrides them.
const DEFAULT_BG = '#1d5c37';
const SHELL_KEYS: ReadonlyArray<[string, string, string]> = [
  // [skin key, css var, fallback]
  ['bg', '--mm-bg', '#1d5c37'],
  ['fg', '--mm-fg', '#f0fff4'],
  ['button_bg', '--mm-btn-bg', '#ffe24d'],
  ['button_text', '--mm-btn-text', '#143012'],
  ['focus_ring', '--mm-focus', '#fff0a8'],
];

/** Read a skin color key, or fall back. */
function color(skin: Record<string, unknown> | null, key: string, fallback: string): string {
  const v = skin?.[key];
  return typeof v === 'string' ? v : fallback;
}

export function resolvePalette(skin: Record<string, unknown> | null): Palette {
  const vars: Record<string, string> = {};
  for (const [key, cssVar, fallback] of SHELL_KEYS) {
    vars[cssVar] = color(skin, key, fallback);
  }
  // Maze colors are skinnable too (not just the shell chrome), so each preset
  // changes the actual board look - otherwise every skin renders the same maze.
  return {
    bg: color(skin, 'bg', DEFAULT_BG),
    wall: color(skin, 'wall', '#54c873'),
    pellet: color(skin, 'pellet', '#ffe24d'),
    power: color(skin, 'power', '#ff9c2e'),
    runner: '#ffe34d',
    ghost: ['#ff5b5b', '#5bd1ff', '#ff9bf0', '#9bff8a'],
    frightened: '#3b6bff',
    eaten: '#9aa3b2',
    vars,
  };
}
