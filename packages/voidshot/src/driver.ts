// The live driver. Boots the same wasm the server replays, steps it at a fixed
// dt while recording the input trace, renders each frame with OGL, and on a win
// hands the trace to the widget for server-authoritative verification.
//
// Start gate: the sim does not advance until the player's first input, so the
// recorded trace begins at tick 0 regardless of how long the instructions are
// read. The sim has no wall-clock; it only advances when we step it, so "read
// time" never enters the simulation and replay is unaffected.

import { randomSeed } from '@caputchin/game-sdk';
import type { Bridge, ResolvedLocale, ResolvedSkin, Seed } from '@caputchin/game-sdk';
import { DT_MS, PHASE_PLAYING, PHASE_WON } from './constants.js';
import { configToInts, soundEnabled } from './config.js';
import { LiveSim, type LiveState } from './wasm.js';
import { Renderer3D } from './render.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { Announcer } from './a11y.js';
import { Sfx } from './audio.js';
import { buildStrings, clockBearing, kindName, powerName } from './strings.js';
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

  const hud = new Hud(container, strings, {
    onMute: () => {
      sfx.setMuted(!sfx.isMuted());
      hud.setMuted(sfx.isMuted());
    },
  });
  hud.setMaxShield(shieldHits);
  hud.showStart();
  announcer.say(strings.t('ariaGame'));

  const captchaSeed = seed; // the server-issued seed; Try Again replays the SAME one
  let mode: 'captcha' | 'endless' = 'captcha';
  let sim: LiveSim | null = null;
  let started = false;
  let finished = false;
  let raf = 0;
  let last = 0;
  let acc = 0;
  let prevWave = 0;
  let prevScore = 0;
  let prevShield = shieldHits;
  let prevWeapon = 0;
  let prevInvuln = false;
  let aimX = 0;
  let aimZ = 0;

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

  // (Re)create the sim for a round. `endless` = post-verification play (no win, no
  // trace). `autoStart` skips the tap-to-launch gate for button-driven restarts
  // (the captcha trace still begins at sim tick 0, so replay is unaffected).
  function mount(useSeed: Seed, endless: boolean, autoStart: boolean): void {
    mode = endless ? 'endless' : 'captcha';
    const old = sim;
    sim = null;
    old?.free();
    started = autoStart;
    finished = false;
    acc = 0;
    last = 0;
    prevWave = 0;
    prevScore = 0;
    prevShield = shieldHits;
    prevWeapon = 0;
    prevInvuln = false;
    if (autoStart) hud.hideOverlay();
    else hud.showStart();
    if (endless) announcer.say(strings.t('endlessStart'));
    LiveSim.create(useSeed, cfgInts, endless)
      .then((s) => {
        sim = s;
      })
      .catch((e: unknown) => {
        bridge.error({ code: 'wasm-init', message: String(e) });
      });
  }

  // Parse the inlined 3D models once, then start the render loop and the first
  // (captcha) round. The loop renders nothing until the sim resolves (guarded).
  renderer
    .loadModels()
    .then(() => {
      raf = requestAnimationFrame(loop);
      mount(captchaSeed, false, false);
    })
    .catch((e: unknown) => {
      bridge.error({ code: 'wasm-init', message: String(e) });
    });

  function loop(t: number): void {
    raf = requestAnimationFrame(loop);
    if (!sim) return;

    const inp = input.read();
    aimX = inp.tx;
    aimZ = inp.tz;

    if (started && !finished) {
      if (!last) last = t;
      let dt = t - last;
      last = t;
      if (dt > 250) dt = 250; // clamp tab-out / long frame
      acc += dt;
      const qx = Math.round(inp.tx * 1000);
      const qz = Math.round(inp.tz * 1000);
      let steps = 0;
      while (acc >= DT_MS && steps < 8) {
        sim.step(qx, qz, inp.fire);
        acc -= DT_MS;
        steps += 1;
      }
    }

    const st = sim.state();
    input.setPlayer(st.px, st.pz);
    input.setEnemies(st.enemies);
    renderer.render(st, { x: aimX, z: aimZ }, t);
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
    } else if (st.shield > prevShield) {
      prevShield = st.shield;
      sfx.wave();
      announcer.say(strings.t('announcePower', { name: powerName(strings, 3) })); // heal
    }
    // Powerup pickups (weapon change / invuln gained) - announce for accessibility.
    if (st.weapon !== prevWeapon) {
      if (st.weapon !== 0) {
        sfx.wave();
        announcer.say(strings.t('announcePower', { name: powerName(strings, st.weapon - 1) }));
      }
      prevWeapon = st.weapon;
    }
    const invOn = st.invulnTicksLeft > 0;
    if (invOn && !prevInvuln) {
      sfx.wave();
      announcer.say(strings.t('announcePower', { name: powerName(strings, 4) })); // invuln
    }
    prevInvuln = invOn;
    // Accessible target announcements (only changes in the Tab target-cycle mode).
    if (input.consumeFocusChanged()) {
      const f = input.currentFocus();
      if (f) {
        announcer.say(
          strings.t('announceTarget', {
            kind: kindName(strings, f.kind),
            clock: clockBearing(strings, f.x - st.px, f.z - st.pz),
          }),
        );
      } else {
        announcer.say(strings.t('announceNoTarget'));
      }
    }
  }

  function finish(st: LiveState): void {
    finished = true;

    // Endless (post-verification) play: no captcha submission, just a score + a
    // replay-for-fun button. Endless never reports Won, so reaching here is a loss.
    if (mode === 'endless') {
      sfx.lose();
      announcer.say(`${strings.t('endlessOver')} ${strings.t('finalScore', { n: st.score })}`);
      hud.showResult({
        title: strings.t('endlessOver'),
        sub: strings.t('finalScore', { n: st.score }),
        button: strings.t('playAgain'),
        onAction: () => mount(randomSeed(), true, true),
      });
      return;
    }

    const passed = st.phase === PHASE_WON;
    if (passed) {
      // Submit the winning trace for server-authoritative verification, then offer
      // endless play to anyone who wants to keep going.
      if (sim) bridge.pass({ trace: toBase64(sim.trace()) });
      sfx.win();
      announcer.say(strings.t('announceWin'));
      hud.showResult({
        title: strings.t('win'),
        sub: strings.t('endlessStart'),
        button: strings.t('keepPlaying'),
        onAction: () => mount(randomSeed(), true, true),
      });
    } else {
      // A losing trace would just replay to passed:false; offer a retry of the SAME
      // server seed (the only seed whose trace the server will validate).
      sfx.lose();
      announcer.say(strings.t('announceLose'));
      hud.showResult({
        title: strings.t('lose'),
        button: strings.t('tryAgain'),
        onAction: () => mount(captchaSeed, false, true),
      });
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
