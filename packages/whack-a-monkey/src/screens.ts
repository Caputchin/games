// Start + round-over overlays. Each builder returns a detached element game.ts
// mounts into the overlay host; all copy comes from the Strings helper so locale
// + RTL choices stay in one place. Buttons are real DOM (accessible, focusable)
// layered over the canvas.

import type { Strings } from './strings.js';

function makeButton(doc: Document, label: string, onClick: () => void): HTMLButtonElement {
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = 'wm-button';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

export function renderStartScreen(doc: Document, strings: Strings, onStart: () => void): HTMLElement {
  const root = doc.createElement('div');
  root.className = 'wm-overlay wm-overlay--start';
  root.setAttribute('role', 'group');

  const title = doc.createElement('h2');
  title.className = 'wm-title';
  title.textContent = strings.t('startTitle');

  const body = doc.createElement('p');
  body.className = 'wm-line';
  body.textContent = strings.t('startBody');

  const buttons = doc.createElement('div');
  buttons.className = 'wm-buttons';
  buttons.appendChild(makeButton(doc, strings.t('startButton'), onStart));

  const hint = doc.createElement('p');
  hint.className = 'wm-hint';
  hint.textContent = strings.t('controlsHint');

  root.append(title, body, buttons, hint);
  return root;
}

export interface EndScreenOptions {
  won: boolean;
  score: number;
  onRetry: () => void;
}

export function renderEndScreen(doc: Document, strings: Strings, opts: EndScreenOptions): HTMLElement {
  const root = doc.createElement('div');
  root.className = `wm-overlay wm-overlay--${opts.won ? 'win' : 'over'}`;
  root.setAttribute('role', 'group');

  const title = doc.createElement('h2');
  title.className = 'wm-title';
  title.textContent = strings.t(opts.won ? 'winTitle' : 'overTitle');

  const body = doc.createElement('p');
  body.className = 'wm-line';
  body.textContent = strings.t(opts.won ? 'winBody' : 'overBody', { score: opts.score });

  const buttons = doc.createElement('div');
  buttons.className = 'wm-buttons';
  buttons.appendChild(makeButton(doc, strings.t('retryButton'), opts.onRetry));

  root.append(title, body, buttons);
  return root;
}
