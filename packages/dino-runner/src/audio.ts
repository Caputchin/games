// Sound effects via the Web Audio API. We play the original game's three Ogg
// clips (sounds.ts): jump, milestone, crash. The clips are decoded once into
// AudioBuffers and played through short-lived BufferSources - the same
// low-latency path the original uses, and entirely inside the iframe CSP
// (decoding a `data:` URI needs no network; playback needs no media-src).
//
// Every entry point is a no-op when audio is disabled, when the Web Audio API
// is unavailable (e.g. the test DOM), or after dispose, so callers never have
// to guard. Browsers start an AudioContext suspended until a user gesture, so
// game.ts calls resume() on the first input.

import type { SoundClips } from './sounds.js';

export interface Sfx {
  /** Resume the (initially suspended) context. Call from a user gesture. */
  resume(): void;
  jump(): void;
  /** Score-milestone chime. */
  score(): void;
  /** Crash. */
  hit(): void;
  /** Runtime mute toggle (the in-game sound button). */
  setMuted(muted: boolean): void;
  dispose(): void;
}

const SILENT: Sfx = {
  resume() {},
  jump() {},
  score() {},
  hit() {},
  setMuted() {},
  dispose() {},
};

type AudioCtor = new () => AudioContext;
type ClipName = keyof SoundClips;

/** Decode a `data:…;base64,…` URI to an ArrayBuffer, or null if malformed. */
function dataUriToArrayBuffer(uri: string): ArrayBuffer | null {
  const marker = uri.indexOf('base64,');
  if (marker < 0) return null;
  try {
    const binary = atob(uri.slice(marker + 'base64,'.length));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  } catch {
    return null;
  }
}

export function createSfx(view: Window, enabled: boolean, clips: SoundClips): Sfx {
  if (!enabled) return SILENT;
  // AudioContext is a global ctor, not on the Window interface, and older
  // Safari exposes it prefixed - reach for both through a cast.
  const w = view as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (typeof Ctor !== 'function') return SILENT;

  let ctx: AudioContext;
  try {
    ctx = new Ctor();
  } catch {
    return SILENT;
  }

  const buffers: Partial<Record<ClipName, AudioBuffer>> = {};
  // Decode eagerly (works on a suspended context) so the first jump is audible
  // the moment the context resumes.
  (Object.keys(clips) as ClipName[]).forEach((name) => {
    const data = dataUriToArrayBuffer(clips[name]);
    if (!data) return;
    try {
      // Some implementations detach the passed buffer, so hand over a copy.
      const result = ctx.decodeAudioData(data.slice(0));
      if (result && typeof result.then === 'function') {
        result.then((decoded) => {
          buffers[name] = decoded;
        }).catch(() => {
          /* unsupported codec - that clip stays silent */
        });
      }
    } catch {
      /* decodeAudioData unavailable - clip stays silent */
    }
  });

  let muted = false;

  function play(name: ClipName): void {
    const buffer = buffers[name];
    if (muted || !buffer || ctx.state === 'closed') return;
    try {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch {
      /* context closed / interrupted */
    }
  }

  return {
    resume() {
      if (ctx.state === 'suspended') void ctx.resume();
    },
    jump() {
      play('jump');
    },
    score() {
      play('score');
    },
    hit() {
      play('hit');
    },
    setMuted(next: boolean) {
      muted = next;
    },
    dispose() {
      try {
        void ctx.close();
      } catch {
        /* already closed */
      }
    },
  };
}
