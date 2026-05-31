// Procedural sound effects, synthesized on the fly with Web Audio. No bundled
// audio files (keeps the bundle lean and dodges the iframe's connect-src 'none').
// The Bevy build dispatches `wallsmash:sfx` events with a sound name; this plays
// a short tone for each. Audio needs a user gesture to start, which the player's
// launch tap/keypress provides.

type SfxName = 'launch' | 'bounce' | 'break' | 'level' | 'win' | 'lose';

export interface Sfx {
  play(name: string): void;
  resume(): void;
  dispose(): void;
}

const SILENT: Sfx = { play() {}, resume() {}, dispose() {} };

export function createSfx(enabled: boolean): Sfx {
  if (!enabled) return SILENT;
  const Ctor: typeof AudioContext | undefined =
    typeof window !== 'undefined'
      ? window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
  if (!Ctor) return SILENT;

  let ctx: AudioContext | null = null;
  const ensure = (): AudioContext => {
    if (!ctx) ctx = new Ctor();
    return ctx;
  };

  function tone(freq: number, dur: number, type: OscillatorType, gain: number, at = 0): void {
    const ac = ensure();
    const t0 = ac.currentTime + at;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function chord(freqs: number[], dur: number, type: OscillatorType, gain: number): void {
    freqs.forEach((f, i) => tone(f, dur, type, gain, i * 0.05));
  }

  const play = (name: string): void => {
    switch (name as SfxName) {
      case 'launch':
        tone(440, 0.1, 'square', 0.14);
        break;
      case 'bounce':
        tone(240, 0.05, 'square', 0.11);
        break;
      case 'break':
        tone(660, 0.06, 'triangle', 0.13);
        break;
      case 'level':
        chord([523, 659, 784], 0.2, 'triangle', 0.1);
        break;
      case 'win':
        chord([523, 659, 784, 1046], 0.45, 'triangle', 0.11);
        break;
      case 'lose':
        tone(150, 0.32, 'sawtooth', 0.1);
        break;
      default:
        break;
    }
  };

  return {
    play,
    resume() {
      const ac = ensure();
      if (ac.state === 'suspended') void ac.resume();
    },
    dispose() {
      if (ctx) void ctx.close();
      ctx = null;
    },
  };
}
