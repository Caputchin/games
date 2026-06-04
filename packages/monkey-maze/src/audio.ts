// Live-only sound (never touches the replay verdict, so it is purely cosmetic).
// Default SFX are synthesized with the Web Audio API - no audio files to ship or
// fetch (CSP `connect-src 'none'` forbids fetching). Each cue is skin-overridable
// via an `sfx_<name>` AUDIO data URI (decoded from base64 in-process, no fetch).
//
// The AudioContext is created lazily on the first user gesture (the Play click),
// so there is no autoplay surprise on a customer's page. A mute toggle silences
// everything; `audio: optional` + the live-region announcer keep every cue's
// visual equivalent, so the game stays fully playable muted.

export type SfxName = 'start' | 'eat' | 'power' | 'eaten' | 'caught' | 'win';

const SFX_KEY: Record<SfxName, string> = {
  start: 'sfx_start',
  eat: 'sfx_eat',
  power: 'sfx_power',
  eaten: 'sfx_eaten',
  caught: 'sfx_caught',
  win: 'sfx_win',
};

export interface Sfx {
  /** Unlock / resume the audio on a user gesture (the Play click). */
  resume(): void;
  play(name: SfxName): void;
  setMuted(m: boolean): void;
}

type Win = Window & typeof globalThis;

/** Decode a `data:...;base64,XXX` URI to an ArrayBuffer without fetch (CSP-safe). */
function decodeBase64DataUri(uri: string): ArrayBuffer | null {
  const comma = uri.indexOf(',');
  if (comma < 0 || !/;base64/i.test(uri.slice(0, comma))) return null;
  try {
    const bin = atob(uri.slice(comma + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  } catch {
    return null;
  }
}

export function createSfx(
  view: Win,
  skin: Record<string, unknown> | null | undefined,
  initialMuted: boolean,
): Sfx {
  const g = view as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = initialMuted;
  const overrides: Partial<Record<SfxName, AudioBuffer>> = {};

  function ensure(): AudioContext | null {
    if (ctx || !Ctor) return ctx;
    try {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      if (skin) {
        for (const name of Object.keys(SFX_KEY) as SfxName[]) {
          const src = skin[SFX_KEY[name]];
          if (typeof src === 'string' && src.startsWith('data:')) {
            const buf = decodeBase64DataUri(src);
            if (buf) ctx.decodeAudioData(buf).then((d) => { overrides[name] = d; }).catch(() => { /* keep procedural */ });
          }
        }
      }
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function tone(
    c: AudioContext, dest: AudioNode, type: OscillatorType,
    f0: number, f1: number, dur: number, gain: number, delay: number,
  ): void {
    const t = c.currentTime + delay;
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  function procedural(c: AudioContext, dest: AudioNode, name: SfxName): void {
    switch (name) {
      case 'eat': tone(c, dest, 'square', 760, 990, 0.07, 0.22, 0); break;
      case 'power':
        tone(c, dest, 'sine', 440, 900, 0.2, 0.3, 0);
        tone(c, dest, 'sine', 660, 1320, 0.2, 0.16, 0.05);
        break;
      case 'eaten': tone(c, dest, 'square', 720, 300, 0.14, 0.26, 0); break;
      case 'caught': tone(c, dest, 'sawtooth', 240, 80, 0.36, 0.3, 0); break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => tone(c, dest, 'triangle', f, f, 0.13, 0.26, i * 0.1));
        break;
      case 'start':
        tone(c, dest, 'triangle', 523, 523, 0.1, 0.24, 0);
        tone(c, dest, 'triangle', 784, 784, 0.14, 0.24, 0.1);
        break;
      default: break;
    }
  }

  return {
    resume(): void {
      const c = ensure();
      if (c && c.state === 'suspended') void c.resume();
    },
    play(name: SfxName): void {
      if (muted) return;
      const c = ensure();
      if (!c || !master) return;
      if (c.state === 'suspended') void c.resume();
      const ov = overrides[name];
      if (ov) {
        const src = c.createBufferSource();
        src.buffer = ov;
        src.connect(master);
        src.start();
      } else {
        procedural(c, master, name);
      }
    },
    setMuted(m: boolean): void {
      muted = m;
    },
  };
}
