// The live driver. Boots the same wasm the server replays, steps it at a fixed
// dt while recording the input trace, renders each frame with OGL, and on a win
// hands the trace to the widget for server-authoritative verification.
//
// Start gate: the sim does not advance until the player's first input, so the
// recorded trace begins at tick 0 regardless of how long the instructions are
// read. The sim has no wall-clock; it only advances when we step it, so "read
// time" never enters the simulation and replay is unaffected.

import type { Bridge, ResolvedLocale, ResolvedSkin, Seed } from '@caputchin/game-sdk';
import { DT_MS, PHASE_PLAYING, PHASE_WON } from './constants.js';
import { configToInts, soundEnabled } from './config.js';
import { LiveSim, type LiveState } from './wasm.js';
import { Renderer3D } from './render.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { Announcer } from './a11y.js';
import { Sfx } from './audio.js';
import { buildStrings } from './strings.js';
import { resolveSkin } from './skin.js';
import { styleSheet } from './styles.js';

export interface GameOpts {
  container: HTMLElement;
  bridge: Bridge;
  seed: Seed;
  config: Record<string, unknown> | null;
  skin: ResolvedSkin | null;
  locale: ResolvedLocale | null;
}

export function startGame(opts: GameOpts): { dispose(): void } {
  const { container, bridge, seed, config, skin, locale } = opts;
  const strings = buildStrings(locale);
  const renderSkin = resolveSkin(skin);
  const cfgInts = configToInts(config);
  const shieldHits = cfgInts[3] ?? 3;

  container.classList.add('vs-root');
  container.dir = strings.dir;
  container.setAttribute('role', 'application');
  container.setAttribute('aria-label', strings.t('ariaGame'));

  const styleEl = document.createElement('style');
  styleEl.textContent = styleSheet(renderSkin.accent);
  container.appendChild(styleEl);

  const renderer = new Renderer3D(container, renderSkin);
  const input = new Input(container, renderer);
  const announcer = new Announcer(container);
  const sfx = new Sfx(soundEnabled(config));
  let pulseFromButton = false;

  const hud = new Hud(container, strings, {
    onMute: () => {
      sfx.setMuted(!sfx.isMuted());
      hud.setMuted(sfx.isMuted());
    },
    onPulseDown: () => {
      pulseFromButton = true;
      markStarted();
    },
    onPulseUp: () => {
      pulseFromButton = false;
    },
  });
  hud.setMaxShield(shieldHits);
  hud.showStart();
  announcer.say(strings.t('ariaGame'));

  let sim: LiveSim | null = null;
  let started = false;
  let finished = false;
  let raf = 0;
  let last = 0;
  let acc = 0;
  let prevWave = 0;
  let prevScore = 0;
  let prevShield = shieldHits;

  function markStarted(): void {
    if (!started) {
      started = true;
      last = 0;
      hud.hideOverlay();
    }
  }
  const startOnInput = (): void => markStarted();
  container.addEventListener('pointerdown', startOnInput);
  window.addEventListener('keydown', startOnInput);

  const ro = new ResizeObserver(() => renderer.resize());
  ro.observe(container);

  LiveSim.create(seed, cfgInts)
    .then((s) => {
      sim = s;
      const st = s.state();
      renderer.render(st);
      hud.update(st);
      raf = requestAnimationFrame(loop);
    })
    .catch((e: unknown) => {
      bridge.error({ code: 'wasm-init', message: String(e) });
    });

  function loop(t: number): void {
    raf = requestAnimationFrame(loop);
    if (!sim) return;

    if (started && !finished) {
      if (!last) last = t;
      let dt = t - last;
      last = t;
      if (dt > 250) dt = 250; // clamp tab-out / long frame
      acc += dt;
      const inp = input.read();
      const qx = Math.round(inp.tx * 1000);
      const qz = Math.round(inp.tz * 1000);
      const pulse = inp.pulse || pulseFromButton;
      let steps = 0;
      while (acc >= DT_MS && steps < 8) {
        sim.step(qx, qz, pulse);
        acc -= DT_MS;
        steps += 1;
      }
    }

    const st = sim.state();
    input.setPlayer(st.px, st.pz);
    renderer.render(st);
    hud.update(st);
    react(st);

    if (started && !finished && st.phase !== PHASE_PLAYING) finish(st);
  }

  function react(st: LiveState): void {
    if (st.wave > prevWave) {
      prevWave = st.wave;
      sfx.wave();
      announcer.say(strings.t('announceWave', { n: st.wave, count: st.enemies.length }));
    }
    if (st.score > prevScore) {
      prevScore = st.score;
      sfx.shoot();
    }
    if (st.shield < prevShield) {
      prevShield = st.shield;
      sfx.hit();
      announcer.say(strings.t('announceShield', { n: Math.max(0, st.shield) }));
    }
  }

  function finish(st: LiveState): void {
    finished = true;
    const passed = st.phase === PHASE_WON;
    hud.showResult(passed);
    announcer.say(strings.t(passed ? 'announceWin' : 'announceLose'));
    if (passed) sfx.win();
    else sfx.lose();
    // Only a winning trace is submitted: a losing trace would just replay to
    // passed:false. The widget reissues a fresh seed for the next attempt.
    if (sim && passed) {
      bridge.pass({ trace: toBase64(sim.trace()) });
    }
  }

  function dispose(): void {
    cancelAnimationFrame(raf);
    ro.disconnect();
    container.removeEventListener('pointerdown', startOnInput);
    window.removeEventListener('keydown', startOnInput);
    input.dispose();
    hud.dispose();
    announcer.dispose();
    sfx.dispose();
    renderer.dispose();
    sim?.free();
    styleEl.remove();
  }

  return { dispose };
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}
