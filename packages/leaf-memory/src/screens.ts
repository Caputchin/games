// Start / win / loss overlays that share the fixed stage footprint.
// Each function builds the screen DOM and returns it; game.ts decides
// when to mount/unmount. Strings come from game.ts via the Strings helper
// so locale + RTL choices stay in one place.

import type { Strings } from './strings.js';

export interface ScreenButton {
  label: string;
  onClick(): void;
  primary?: boolean;
}

function buildScreen(
  doc: Document,
  variant: 'start' | 'win' | 'loss',
  title: string,
  body: string,
  buttons: ScreenButton[],
): HTMLElement {
  const root = doc.createElement('div');
  root.className = `lm-screen lm-screen--${variant}`;
  root.setAttribute('role', 'group');

  const heading = doc.createElement('h2');
  heading.className = 'lm-screen-title';
  heading.textContent = title;
  root.appendChild(heading);

  const para = doc.createElement('p');
  para.className = 'lm-screen-body';
  para.textContent = body;
  root.appendChild(para);

  const btnRow = doc.createElement('div');
  btnRow.className = 'lm-screen-buttons';
  for (const b of buttons) {
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = b.primary ? 'lm-action' : 'lm-action lm-action--secondary';
    btn.textContent = b.label;
    btn.addEventListener('click', b.onClick);
    btnRow.appendChild(btn);
  }
  root.appendChild(btnRow);

  return root;
}

export function renderStartScreen(doc: Document, strings: Strings, onStart: () => void): HTMLElement {
  return buildScreen(
    doc,
    'start',
    strings.t('startTitle'),
    strings.t('startBody'),
    [{ label: strings.t('startButton'), onClick: onStart, primary: true }],
  );
}

export interface WinScreenOptions {
  /** Headline shown above the score. game.ts varies it per level so the
   *  praise escalates with the climb. The string lookup happens upstream
   *  so screens.ts is locale-agnostic. */
  title: string;
  score: number;
  newBest: boolean;
  onRetry: () => void;
  onHarder: (() => void) | null;
  /** Label for the advance-level button; set when onHarder is non-null.
   *  Already localized by the caller. */
  harderLabel?: string;
}

export function renderWinScreen(doc: Document, strings: Strings, opts: WinScreenOptions): HTMLElement {
  const body = opts.newBest
    ? strings.t('winBodyNewBest', { score: opts.score })
    : strings.t('winBodyScore', { score: opts.score });
  const buttons: ScreenButton[] = [{ label: strings.t('winRetry'), onClick: opts.onRetry, primary: true }];
  if (opts.onHarder) {
    buttons.push({ label: opts.harderLabel ?? strings.t('winLevelUpDefault'), onClick: opts.onHarder });
  }
  return buildScreen(doc, 'win', opts.title, body, buttons);
}

export interface LossScreenOptions {
  onRetry: () => void;
  onEasier: (() => void) | null;
}

export function renderLossScreen(doc: Document, strings: Strings, opts: LossScreenOptions): HTMLElement {
  const buttons: ScreenButton[] = [{ label: strings.t('lossRetry'), onClick: opts.onRetry, primary: true }];
  if (opts.onEasier) {
    buttons.push({ label: strings.t('lossEasier'), onClick: opts.onEasier });
  }
  return buildScreen(doc, 'loss', strings.t('lossTitle'), strings.t('lossBody'), buttons);
}
