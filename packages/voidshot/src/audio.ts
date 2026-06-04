// Synthesized SFX (Web Audio). RENDER-ONLY: audio never reaches the server, so it
// carries no determinism duty. The game is fully playable muted; every cue has a
// visual equivalent in the renderer/HUD. No asset files; all tones are
// oscillator-synthesized. Guarded: a no-op when muted, disabled, or where Web
// Audio is unavailable.

type Osc = OscillatorType;

export class Sfx {
  private ctx: AudioContext | null = null;
  private muted = false;

  constructor(private readonly enabled: boolean) {}

  private ac(): AudioContext | null {
    if (this.muted || !this.enabled) return null;
    if (!this.ctx) {
      const Ctor =
        typeof AudioContext !== 'undefined'
          ? AudioContext
          : (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      try {
        this.ctx = Ctor ? new Ctor() : null;
      } catch {
        this.ctx = null;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private blip(freq: number, dur: number, type: Osc, gain: number): void {
    const ac = this.ac();
    if (!ac) return;
    this.blipAt(ac, freq, ac.currentTime, dur, type, gain);
  }

  private blipAt(
    ac: AudioContext,
    freq: number,
    start: number,
    dur: number,
    type: Osc,
    gain: number,
  ): void {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(ac.destination);
    osc.start(start);
    osc.stop(start + dur);
  }

  shoot(): void {
    this.blip(900, 0.045, 'square', 0.025);
  }
  hit(): void {
    this.blip(130, 0.18, 'sawtooth', 0.11);
  }
  wave(): void {
    this.blip(440, 0.18, 'triangle', 0.06);
  }
  win(): void {
    const ac = this.ac();
    if (!ac) return;
    [523, 659, 784].forEach((f, i) => this.blipAt(ac, f, ac.currentTime + i * 0.09, 0.26, 'triangle', 0.08));
  }
  lose(): void {
    this.blip(160, 0.5, 'sawtooth', 0.1);
  }

  setMuted(m: boolean): void {
    this.muted = m;
  }
  isMuted(): boolean {
    return this.muted;
  }

  dispose(): void {
    try {
      this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
  }
}
