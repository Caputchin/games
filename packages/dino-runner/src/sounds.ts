// The original Chrome offline-game sound effects (Ogg/Vorbis), used verbatim
// from the Chromium offline-resources bundle and inlined as data URIs by
// tsup's dataurl loader. Chromium BSD-3; see THIRD-PARTY-NOTICES.md.
//
//   jump  = the original "button press" blip (played on every jump)
//   score = the original "score reached" chime (milestone)
//   hit   = the original "hit" buzz (crash)

import jump from './assets/sounds/jump.ogg';
import hit from './assets/sounds/hit.ogg';
import score from './assets/sounds/score.ogg';

export interface SoundClips {
  jump: string;
  hit: string;
  score: string;
}

export const SOUND_CLIPS: SoundClips = { jump, hit, score };
