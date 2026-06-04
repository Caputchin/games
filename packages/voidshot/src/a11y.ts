// Screen-reader announcer. A polite aria-live region the driver pushes game-state
// changes into (wave start, shield loss, win/lose). Combined with full keyboard
// play and auto-aim (no precise aiming needed), this is what makes a spatial
// shooter genuinely operable without sight.

export class Announcer {
  private readonly el: HTMLElement;
  private last = '';

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'vs-sr';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    this.el.setAttribute('aria-atomic', 'true');
    parent.appendChild(this.el);
  }

  say(message: string): void {
    if (message === this.last) return;
    this.last = message;
    // Clear then set so identical-after-reset messages still re-announce.
    this.el.textContent = '';
    this.el.textContent = message;
  }

  dispose(): void {
    this.el.remove();
  }
}
