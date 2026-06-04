// DOM HUD overlay: wave + score readout, shield pips, the start hint, the
// win/lose banner, and the mute + touch-pulse buttons. Pointer-transparent except
// the buttons, so it never blocks the canvas input. RENDER-ONLY.

import type { LiveState } from './wasm.js';
import type { Strings } from './strings.js';

export interface HudCallbacks {
  onMute(): void;
  onPulseDown(): void;
  onPulseUp(): void;
}

export class Hud {
  readonly el: HTMLElement;
  private readonly waveEl: HTMLElement;
  private readonly scoreEl: HTMLElement;
  private readonly shieldEl: HTMLElement;
  private readonly center: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly muteBtn: HTMLButtonElement;
  private maxShield = 3;

  constructor(
    parent: HTMLElement,
    private readonly strings: Strings,
    cb: HudCallbacks,
  ) {
    this.el = div('vs-hud');
    this.el.dir = strings.dir;

    const top = div('vs-top');
    const left = div('');
    this.waveEl = span();
    this.scoreEl = span();
    left.append(this.waveEl, document.createTextNode('   '), this.scoreEl);
    this.shieldEl = div('vs-shield');
    this.shieldEl.setAttribute('role', 'img');
    top.append(left, this.shieldEl);

    this.center = div('vs-center');
    this.banner = div('vs-banner');
    this.hint = div('vs-hint');
    this.center.append(this.banner, this.hint);

    const btns = div('vs-btns');
    this.muteBtn = button('vs-btn', strings.t('mute'));
    this.muteBtn.addEventListener('click', () => cb.onMute());
    btns.append(this.muteBtn);

    const pulseWrap = div('vs-pulsewrap');
    const pulseBtn = button('vs-btn', strings.t('pulse'));
    pulseBtn.setAttribute('aria-label', strings.t('pulse'));
    pulseBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      cb.onPulseDown();
    });
    pulseBtn.addEventListener('pointerup', () => cb.onPulseUp());
    pulseBtn.addEventListener('pointercancel', () => cb.onPulseUp());
    pulseWrap.append(pulseBtn);

    this.el.append(top, this.center, btns, pulseWrap);
    parent.appendChild(this.el);
  }

  setMaxShield(n: number): void {
    this.maxShield = Math.max(1, n);
  }

  showStart(): void {
    this.center.classList.remove('hidden');
    this.banner.textContent = '';
    this.hint.textContent = this.strings.t('start');
  }

  hideOverlay(): void {
    this.center.classList.add('hidden');
  }

  showResult(passed: boolean): void {
    this.center.classList.remove('hidden');
    this.banner.textContent = this.strings.t(passed ? 'win' : 'lose');
    this.hint.textContent = '';
  }

  update(s: LiveState): void {
    this.waveEl.textContent = this.strings.t('hudWave', { n: Math.max(1, s.wave) });
    this.scoreEl.textContent = this.strings.t('hudScore', { n: s.score });
    if (this.shieldEl.childElementCount !== this.maxShield) {
      this.shieldEl.textContent = '';
      for (let i = 0; i < this.maxShield; i += 1) this.shieldEl.append(div('vs-pip'));
    }
    this.shieldEl.setAttribute('aria-label', this.strings.t('hudShield', { n: s.shield }));
    const pips = this.shieldEl.children;
    for (let i = 0; i < pips.length; i += 1) {
      (pips[i] as HTMLElement).classList.toggle('spent', i >= s.shield);
    }
  }

  setMuted(m: boolean): void {
    this.muteBtn.textContent = this.strings.t(m ? 'unmute' : 'mute');
    this.muteBtn.setAttribute('aria-pressed', String(m));
  }

  dispose(): void {
    this.el.remove();
  }
}

function div(cls: string): HTMLElement {
  const e = document.createElement('div');
  if (cls) e.className = cls;
  return e;
}
function span(): HTMLElement {
  return document.createElement('span');
}
function button(cls: string, label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = cls;
  b.type = 'button';
  b.textContent = label;
  return b;
}
