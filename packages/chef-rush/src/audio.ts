// Minimal procedural audio (browser only). Short WebAudio blips for serve /
// spoiled / verified cues - pure enhancement: the game is fully playable muted
// (every cue has a visual equivalent: station flashes + the ARIA live region).
// Site owners disable it via the `sound` config; declared `audio: "optional"`.
//
// No AudioContext at module top level (this module is in the headless import
// graph via render -> game -> run); the context is created lazily on the first
// cue, after a user gesture, matching browser autoplay policy.

type Cue = 'serve' | 'spoiled' | 'verified' | 'miss';

export interface GameAudio {
  play(cue: Cue): void;
}

const SILENT: GameAudio = { play: () => {} };

export function createGameAudio(enabled: boolean): GameAudio {
  if (!enabled) return SILENT;
  const Ctor: typeof AudioContext | undefined =
    typeof AudioContext !== 'undefined'
      ? AudioContext
      : (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return SILENT;

  let ctx: AudioContext | null = null;
  const ensure = (): AudioContext | null => {
    try {
      if (!ctx) ctx = new Ctor();
      if (ctx.state === 'suspended') void ctx.resume();
      return ctx;
    } catch {
      return null;
    }
  };

  const blip = (freq: number, durS: number, type: OscillatorType, gain: number): void => {
    const ac = ensure();
    if (!ac) return;
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + durS);
    osc.connect(g).connect(ac.destination);
    osc.start(t);
    osc.stop(t + durS + 0.02);
  };

  return {
    play(cue: Cue): void {
      switch (cue) {
        case 'serve':
          blip(660, 0.12, 'triangle', 0.18);
          break;
        case 'verified':
          blip(880, 0.22, 'triangle', 0.2);
          break;
        case 'spoiled':
          blip(140, 0.25, 'sawtooth', 0.16);
          break;
        case 'miss':
          blip(220, 0.14, 'square', 0.12);
          break;
      }
    },
  };
}
