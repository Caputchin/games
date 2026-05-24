// Start + game-over overlays. Each builder returns a detached element that
// game.ts mounts into the overlay container; all copy comes from the Strings
// helper so locale + RTL choices stay in one place. The game-over title is
// the text the host fully controls (the original Chrome game hard-coded its
// "G A M E   O V E R"); here it is just another locale key.

import type { Strings } from './strings.js';

function makeButton(
  doc: Document,
  label: string,
  onClick: () => void,
  iconSvg?: string,
): HTMLButtonElement {
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = 'dr-button';
  if (iconSvg) {
    const icon = doc.createElement('span');
    icon.className = 'dr-button-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = iconSvg;
    btn.appendChild(icon);
  }
  const text = doc.createElement('span');
  text.textContent = label;
  btn.appendChild(text);
  btn.addEventListener('click', onClick);
  return btn;
}

export function renderStartScreen(doc: Document, strings: Strings, onStart: () => void): HTMLElement {
  const root = doc.createElement('div');
  root.className = 'dr-overlay dr-overlay--start';
  root.setAttribute('role', 'group');

  const title = doc.createElement('h2');
  title.className = 'dr-title';
  title.textContent = strings.t('startTitle');

  const body = doc.createElement('p');
  body.className = 'dr-line';
  body.textContent = strings.t('startBody');

  const buttons = doc.createElement('div');
  buttons.className = 'dr-buttons';
  buttons.appendChild(makeButton(doc, strings.t('startButton'), onStart));

  const hint = doc.createElement('p');
  hint.className = 'dr-hint';
  hint.textContent = strings.t('controlsHint');

  root.append(title, body, buttons, hint);
  return root;
}

export interface GameOverOptions {
  score: number;
  best: number;
  showBest: boolean;
  /** Sanitized inline-SVG markup for the restart icon. */
  restartIcon: string;
  onRestart: () => void;
}

export function renderGameOverScreen(
  doc: Document,
  strings: Strings,
  opts: GameOverOptions,
): HTMLElement {
  const root = doc.createElement('div');
  root.className = 'dr-overlay dr-overlay--gameover';
  root.setAttribute('role', 'group');

  const title = doc.createElement('h2');
  title.className = 'dr-title';
  title.textContent = strings.t('gameOverTitle');

  const score = doc.createElement('p');
  score.className = 'dr-line dr-line--score';
  score.textContent = strings.t('gameOverScore', { score: opts.score });

  const buttons = doc.createElement('div');
  buttons.className = 'dr-buttons';
  buttons.appendChild(
    makeButton(doc, strings.t('restartButton'), opts.onRestart, opts.restartIcon),
  );

  root.append(title, score);
  if (opts.showBest) {
    const best = doc.createElement('p');
    best.className = 'dr-line dr-line--score';
    best.textContent = strings.t('gameOverBest', { score: opts.best });
    root.appendChild(best);
  }
  root.appendChild(buttons);
  return root;
}
