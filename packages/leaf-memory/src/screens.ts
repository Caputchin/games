// Start / win / loss overlays that share the fixed stage footprint.
// Each function builds the screen DOM and returns it; game.ts decides
// when to mount/unmount.

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

export function renderStartScreen(doc: Document, onStart: () => void): HTMLElement {
  return buildScreen(
    doc,
    'start',
    'Leaf Memory',
    'Flip two cards at a time to find matching leaves. Clear the board before time runs out.',
    [{ label: 'Start', onClick: onStart, primary: true }],
  );
}

export interface WinScreenOptions {
  /** Headline shown above the score. game.ts varies it per level so the
   *  praise escalates with the climb (e.g. "You win!" → "Nice memory!"
   *  → "Razor sharp!" → "No bot can ever be that good!"). */
  title: string;
  score: number;
  newBest: boolean;
  onRetry: () => void;
  onHarder: (() => void) | null;
  /** Label for the advance-level button; set when onHarder is non-null.
   *  game.ts varies it per level (e.g. "Bigger board!" → "Even bigger!"
   *  → "Final challenge!") so the player knows the climb is real. */
  harderLabel?: string;
}

export function renderWinScreen(doc: Document, opts: WinScreenOptions): HTMLElement {
  const body = opts.newBest
    ? `New best score: ${opts.score}.`
    : `Score: ${opts.score}.`;
  const buttons: ScreenButton[] = [{ label: 'Retry', onClick: opts.onRetry, primary: true }];
  if (opts.onHarder) {
    buttons.push({ label: opts.harderLabel ?? 'Level up!', onClick: opts.onHarder });
  }
  return buildScreen(doc, 'win', opts.title, body, buttons);
}

export interface LossScreenOptions {
  onRetry: () => void;
  onEasier: (() => void) | null;
}

export function renderLossScreen(doc: Document, opts: LossScreenOptions): HTMLElement {
  const buttons: ScreenButton[] = [{ label: 'Retry', onClick: opts.onRetry, primary: true }];
  if (opts.onEasier) {
    buttons.push({ label: 'Try easier', onClick: opts.onEasier });
  }
  return buildScreen(doc, 'loss', 'Out of time', 'The board did not clear before the buzzer.', buttons);
}
