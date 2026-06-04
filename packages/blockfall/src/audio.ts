// Browser-only synthesized sound effects (Web Audio). No asset files, so it is
// CSP-safe (the game iframe CSP forbids fetch and only allows `data:` media).
// Never runs headless; nothing here touches the verdict. The SDK iframe runtime
// wraps AudioContext and suspends it when the tab is hidden, so sounds pause
// with the tab. A live mute toggle is a local audio preference only; it is not
// recorded in the trace, so it cannot affect determinism.

export interface Audio {
  /** A piece locked. */
  lock(): void;
  /** `lines` rows cleared (richer cue for a bigger clear). */
  clear(lines: number): void;
  /** The round was verified. */
  pass(): void;
  /** Topped out. */
  fail(): void;
  /** Flip mute; returns the new muted state. */
  toggleMute(): boolean;
  /** Whether sound is muted right now (true also when sound is disabled). */
  readonly muted: boolean;
  /** Whether the site enabled sound at all (drives the toggle's visibility). */
  readonly enabled: boolean;
}

const SILENT: Audio = {
  lock() {},
  clear() {},
  pass() {},
  fail() {},
  toggleMute() {
    return true;
  },
  get muted() {
    return true;
  },
  get enabled() {
    return false;
  },
};

type ACtor = new () => AudioContext;

/** Create the SFX player. `enabled` is the site's sound default (config). */
export function createAudio(enabled: boolean): Audio {
  const g = globalThis as unknown as { AudioContext?: ACtor; webkitAudioContext?: ACtor };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!enabled || !Ctor) return SILENT;

  let ctx: AudioContext | null = null;
  let muted = false;

  // Lazily create the context (browsers require a user gesture; the game always
  // has one before any sound) and resume it if the runtime suspended it.
  function out(): AudioContext | null {
    if (muted) return null;
    if (!ctx) {
      try {
        ctx = new Ctor!();
      } catch {
        return null;
      }
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  }

  function tone(freq: number, dur: number, type: OscillatorType, gain: number, delay: number): void {
    const c = out();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(gain, t0 + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env);
    env.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  return {
    lock() {
      tone(130, 0.09, 'square', 0.06, 0);
    },
    clear(lines: number) {
      const n = Math.min(4, Math.max(1, lines));
      for (let i = 0; i <= n; i++) tone(440 * Math.pow(1.2, i), 0.13, 'triangle', 0.09, i * 0.055);
    },
    pass() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'triangle', 0.1, i * 0.09));
    },
    fail() {
      [330, 262, 196].forEach((f, i) => tone(f, 0.18, 'sawtooth', 0.07, i * 0.085));
    },
    toggleMute() {
      muted = !muted;
      if (muted && ctx && ctx.state === 'running') void ctx.suspend();
      return muted;
    },
    get muted() {
      return muted;
    },
    get enabled() {
      return true;
    },
  };
}
