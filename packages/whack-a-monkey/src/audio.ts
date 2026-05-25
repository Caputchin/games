// Procedural sound effects via the Web Audio API. No audio files are bundled
// or fetched (CSP forbids external fetch and we keep the bundle tiny): every
// sound is synthesized from oscillators + a noise burst at play time.
//
// Browsers require a user gesture before audio starts, so the AudioContext is
// created + resumed on the first interaction (the Start button click). All
// methods no-op safely when sound is disabled or Web Audio is unavailable
// (e.g. happy-dom in tests), so callers never need to guard.

type Ctor = typeof AudioContext;

export interface Sfx {
  /** A monkey was tapped. */
  whack(): void;
  /** A decoy animal was tapped (wrong). */
  decoy(): void;
  /** A level was cleared. */
  level(): void;
  /** The round was passed. */
  verify(): void;
  /** Unlock/resume audio; call from a user-gesture handler. */
  resume(): void;
  setEnabled(on: boolean): void;
  dispose(): void;
}

export function createSfx(view: Window, enabled: boolean): Sfx {
  const w = view as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  const Ctx: Ctor | undefined = w.AudioContext ?? w.webkitAudioContext;
  let ctx: AudioContext | null = null;
  let on = enabled;

  function ensure(): AudioContext | null {
    if (!Ctx) return null;
    if (!ctx) {
      try { ctx = new Ctx(); } catch { ctx = null; }
    }
    return ctx;
  }

  /** A pitched blip with a fast attack + exponential decay envelope. */
  function note(freq: number, when: number, dur: number, type: OscillatorType, gain: number, slideTo?: number): void {
    const c = ctx;
    if (!c) return;
    const t0 = c.currentTime + when;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  /** A decaying noise burst (used to give the decoy buzz some grit). */
  function noiseBurst(dur: number, gain: number): void {
    const c = ctx;
    if (!c) return;
    const t0 = c.currentTime;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(g).connect(c.destination);
    src.start(t0);
  }

  function guard(fn: () => void): void {
    if (!on || !ensure()) return;
    try { fn(); } catch { /* audio is best-effort */ }
  }

  return {
    whack() { guard(() => note(540, 0, 0.08, 'square', 0.16, 1100)); },
    decoy() { guard(() => { noiseBurst(0.16, 0.14); note(170, 0, 0.18, 'sawtooth', 0.18, 90); }); },
    level() { guard(() => { note(660, 0, 0.1, 'triangle', 0.15); note(990, 0.09, 0.12, 'triangle', 0.15); }); },
    verify() { guard(() => { note(660, 0, 0.12, 'triangle', 0.16); note(880, 0.1, 0.12, 'triangle', 0.16); note(1320, 0.21, 0.18, 'triangle', 0.16); }); },
    resume() {
      const c = ensure();
      if (c && c.state === 'suspended') void c.resume();
    },
    setEnabled(v: boolean) { on = v; },
    dispose() {
      if (ctx) {
        try { void ctx.close(); } catch { /* already closed */ }
        ctx = null;
      }
    },
  };
}
