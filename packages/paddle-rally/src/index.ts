// The live (browser) entry. Renders the round with Phaser running REAL Arcade
// physics, captures input, records the per-tick player intent into the trace, and
// reports a pass when the player reaches the target first. The SAME PaddleRallySim
// (src/sim.ts) drives this and the headless replay, and the preset makes Arcade
// deterministic, so the recorded trace re-executes to an identical verdict.
//
// The `@caputchin/preset-phaser/live` side-effect import is FIRST: it overrides
// Math.sin/cos/atan2/... with the same deterministic impl the server uses, so the
// browser and the isolate compute identical floats.
//
// Per-tick logic runs on the Arcade `worldstep` event (once per fixed physics
// sub-step), NOT in update() (once per rendered frame). That is what makes the
// recording frame-rate independent: a 144 Hz and a 60 Hz player record the same
// action sequence, and the server replays it bit-for-bit.
//
// Flow: a start screen (objective + controls) -> play -> win/lose screen. A win
// reports the pass and offers an ungated endless mode; a loss retries the SAME
// gated challenge (same seed + config, fresh trace). The sim only ticks (and the
// trace only records) during play. Every screen, label, and control (including the
// mute button) is drawn in Phaser; the only DOM node is the invisible
// screen-reader live region. Sound is render-side only (watches sim events, never
// part of the trace), so the game is fully playable muted.
//
// Sizing: manual (Scale.NONE + ResizeObserver). The container (#cpt-root in the cap
// iframe) is auto-height, so with the canvas positioned absolute it collapses and its
// clientHeight cannot report the space to fill. The iframe VIEWPORT (documentElement,
// standards mode) IS that space: height="full" makes the iframe 100% tall, a
// preferred/pixel height makes it that many px. So the canvas fills the viewport
// (absolute, top-left); the Arcade world stays a fixed 640x400 and the renderer scales
// it with ONE uniform aspect-preserving factor and CENTRES it, so extra viewport height
// or width becomes letterbox margin (the table never stretches) while the background
// fills the whole canvas.
import '@caputchin/preset-phaser/live';
import { register, type Bridge, type GameContext, type ResolvedSkin, type Seed } from '@caputchin/game-sdk';
import { onWorldStep, createMathRandomTrap } from '@caputchin/preset-phaser';
import Phaser from 'phaser';
import { encode } from './codec.js';
import { buildStrings, type Strings } from './strings.js';
import {
  BALL_R,
  CPU_X,
  FIELD_H,
  FIELD_W,
  PADDLE_H,
  PADDLE_W,
  PLAYER_X,
  PaddleRallySim,
  type Action,
  type PaddleRallyConfig,
} from './sim.js';

const COLOR_TEXT = '#e9f4ee';
const COLOR_MUTED = '#9ec8b4';
const COLOR_SLASH = 0xd96b6b;
const COLOR_ICON = 0xe9f4ee;

const DEFAULT_COLORS = {
  bg: 0x10241c,
  line: 0x2f5d49,
  player: 0x8a5a2b, // capuchin brown
  cpu: 0x6b4f8a, // rival purple
  ball: 0xc9874a, // ball
} as const;

interface Colors {
  bg: number;
  line: number;
  player: number;
  cpu: number;
  ball: number;
}
type Phase = 'start' | 'play' | 'won' | 'lost' | 'endless';

interface LiveDeps {
  container: HTMLElement;
  bridge: Bridge;
  ctx?: GameContext;
}

interface AudioKit {
  resume(): void;
  serve(): void;
  paddle(): void;
  wall(): void;
  score(): void;
}

// Tiny procedural sound: short square-wave blips, no assets. Created lazily on the
// first user gesture (browsers block audio before one). No-ops if AudioContext is
// unavailable (the game is fully playable silent).
function createAudio(): AudioKit {
  type Ctor = typeof AudioContext;
  const AC = (typeof AudioContext !== 'undefined'
    ? AudioContext
    : (globalThis as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext);
  let ctx: AudioContext | null = null;
  const ensure = (): AudioContext | null => {
    if (!ctx && AC) ctx = new AC();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
    return ctx;
  };
  const beep = (freq: number, durMs: number, peak = 0.07, type: OscillatorType = 'square', delayMs = 0): void => {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + delayMs / 1000;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + durMs / 1000 + 0.02);
  };
  return {
    resume: () => { ensure(); },
    // Light, up-beat serve: a soft triangle-wave major arpeggio rising C5-E5-G5,
    // the notes SEQUENCED (delayed), not stacked, so it chimes instead of buzzing.
    serve: () => { beep(523, 70, 0.05, 'triangle', 0); beep(659, 70, 0.05, 'triangle', 70); beep(784, 110, 0.05, 'triangle', 140); },
    paddle: () => beep(520, 55),
    wall: () => beep(300, 45),
    score: () => { beep(680, 90); beep(880, 90); },
  };
}

function hexToNum(hex?: string): number | undefined {
  if (typeof hex !== 'string') return undefined;
  const v = Number.parseInt(hex.replace('#', ''), 16);
  return Number.isNaN(v) ? undefined : v;
}

function resolveColors(skin: ResolvedSkin | null | undefined): Colors {
  return {
    bg: hexToNum(skin?.bg as string) ?? DEFAULT_COLORS.bg,
    line: hexToNum(skin?.line as string) ?? DEFAULT_COLORS.line,
    player: hexToNum(skin?.player as string) ?? DEFAULT_COLORS.player,
    cpu: hexToNum(skin?.cpu as string) ?? DEFAULT_COLORS.cpu,
    ball: hexToNum(skin?.ball as string) ?? DEFAULT_COLORS.ball,
  };
}

interface Ink { text: string; muted: string; icon: number; }

// Pick legible foreground ink from the background luminance, so text + the mute
// glyph stay readable on ANY skin (a light skin would drown light text).
function inkFor(bg: number): Ink {
  const r = (bg >> 16) & 0xff;
  const g = (bg >> 8) & 0xff;
  const b = bg & 0xff;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 140
    ? { text: '#16231d', muted: '#4a5f54', icon: 0x16231d } // dark ink on a light bg
    : { text: COLOR_TEXT, muted: COLOR_MUTED, icon: COLOR_ICON }; // light ink on a dark bg
}

interface Rect { x: number; y: number; w: number; h: number; }

export class PaddleRallyScene extends Phaser.Scene {
  private deps!: LiveDeps;
  private sim!: PaddleRallySim;
  private gfx!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private title!: Phaser.GameObjects.Text;
  private body!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;
  private live!: HTMLElement;
  private actions: Action[] = [];
  private phase: Phase = 'start';
  private keyIntent = 0;
  private pointerTargetY: number | null = null;
  private pointerDown = false;
  private seed: Seed = [1, 2, 3, 4];
  private config: PaddleRallyConfig | null = null;
  private colors: Colors = DEFAULT_COLORS;
  private ink: Ink = inkFor(DEFAULT_COLORS.bg);
  private strings: Strings = buildStrings(null);
  private audio: AudioKit = createAudio();
  private muted = false;
  private muteRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  // Vertical slice of the centred-field transform, snapshot each render for the
  // pointer handlers: field Y = (canvasY - oy) / s (see toLogicalY). Only Y is
  // inverted (pointer X is unused), so only {oy,s} are stored, not the full transform.
  private view = { oy: 0, s: 1 };
  private lastAnnounced = '';
  private lastHits = 0; // sim.paddleHits seen last tick, for the paddle blip
  private lastServes = 0; // sim.serves seen last tick, for the serve blip
  // Seeded Math.random trap, scoped around sim.step, the SAME trap the headless
  // run applies, so any raw Math.random in the step is symmetric live vs replay.
  private readonly trap = createMathRandomTrap();

  init(deps: LiveDeps): void {
    this.deps = deps;
  }

  create(): void {
    const ctx = this.deps.ctx;
    this.seed = ctx?.seed ?? [1, 2, 3, 4];
    this.config = (ctx?.config as PaddleRallyConfig | null) ?? null;
    this.colors = resolveColors(ctx?.skin);
    this.ink = inkFor(this.colors.bg); // legible text/glyph for light OR dark skins
    this.strings = buildStrings(ctx?.locale);
    // `sound: false` in the resolved config starts muted; default is on.
    this.muted = (ctx?.config as { sound?: boolean } | null | undefined)?.sound === false;
    this.spawnSim(this.config);

    this.gfx = this.add.graphics();
    const base = { fontFamily: 'system-ui, sans-serif', color: this.ink.text, align: 'center' as const };
    this.hud = this.add.text(0, 0, '', { ...base, fontSize: '20px' }).setOrigin(0.5, 0);
    this.title = this.add.text(0, 0, '', { ...base, fontSize: '40px', fontStyle: 'bold' }).setOrigin(0.5, 0.5);
    this.body = this.add.text(0, 0, '', { ...base, fontSize: '16px', color: this.ink.muted }).setOrigin(0.5, 0.5);
    this.prompt = this.add.text(0, 0, '', { ...base, fontSize: '16px' }).setOrigin(0.5, 0.5);

    this.installScreenReaderRegion();
    this.installInput();
    // Per-tick sim logic on the fixed physics step (frame-rate independent).
    onWorldStep(this, () => this.tick());
    // Wall blip: the ball is the only body with onWorldBounds, so this fires on a
    // top/bottom bounce (left/right are scoring lines). Render-side only.
    this.physics.world.on('worldbounds', () => {
      if (!this.muted && (this.phase === 'play' || this.phase === 'endless')) this.audio.wall();
    });
    this.updateCursor();
    this.announceScreen();
  }

  // Build (or rebuild) the round's Arcade bodies. Gameplay randomness comes from
  // the sim's seeded Phaser.Math.RandomDataGenerator; the /live import already
  // swapped Math to the deterministic kernels, and Arcade does not read
  // Math.random, so nothing else needs seeding. Bodies are invisible: the
  // responsive renderer draws them scaled to the host.
  private spawnSim(config: PaddleRallyConfig | null): void {
    // Reset the Math.random stream from the round seed at each play start, so the
    // fresh trace the live game records replays from the same trap state on the
    // server (which resets once per run). Same seed -> same stream each play.
    this.trap.reset(this.seed);
    this.sim = new PaddleRallySim(this.seed, config);
    this.sim.create(this);
    this.sim.playerObj.setVisible(false);
    this.sim.cpuObj.setVisible(false);
    this.sim.ballObj.setVisible(false);
    this.lastHits = 0; // fresh sim starts paddleHits at 0
    this.lastServes = 0;
  }

  private installScreenReaderRegion(): void {
    const live = this.deps.container.ownerDocument.createElement('div');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('lang', this.strings.lang);
    live.setAttribute('dir', this.strings.direction);
    live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;';
    this.deps.container.appendChild(live);
    this.live = live;
  }

  private announce(msg: string): void {
    if (msg === this.lastAnnounced) return;
    this.lastAnnounced = msg;
    this.live.textContent = msg;
  }

  private announceScreen(): void {
    if (this.phase === 'start') {
      const objective = this.sim.cfg.mode === 'solo'
        ? this.strings.t('soloObjective', { n: this.sim.cfg.soloSurvive })
        : this.strings.t('startObjective');
      this.announce(`${this.strings.t('ariaGame')} ${objective} ${this.strings.t('startControls')}`);
    }
  }

  private installInput(): void {
    const kb = this.input.keyboard;
    if (kb) {
      const set = (v: number) => () => { this.keyIntent = v; };
      const clear = (v: number) => () => { if (this.keyIntent === v) this.keyIntent = 0; };
      kb.on('keydown-UP', set(-1)); kb.on('keydown-W', set(-1));
      kb.on('keydown-DOWN', set(1)); kb.on('keydown-S', set(1));
      kb.on('keyup-UP', clear(-1)); kb.on('keyup-W', clear(-1));
      kb.on('keyup-DOWN', clear(1)); kb.on('keyup-S', clear(1));
      kb.on('keydown-SPACE', () => this.onConfirm());
      kb.on('keydown-M', () => this.toggleMute());
    }
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.hitMute(p.x, p.y)) { this.toggleMute(); return; }
      if (this.phase === 'start' || this.phase === 'won' || this.phase === 'lost') { this.onConfirm(); return; }
      this.pointerDown = true;
      this.pointerTargetY = this.toLogicalY(p.y);
      this.updateCursor();
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown && (this.phase === 'play' || this.phase === 'endless')) this.pointerTargetY = this.toLogicalY(p.y);
      this.updateHoverCursor(p.x, p.y);
    });
    this.input.on('pointerup', () => { this.pointerDown = false; this.pointerTargetY = null; this.updateCursor(); });
  }

  private hitMute(x: number, y: number): boolean {
    const r = this.muteRect;
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  private updateCursor(): void {
    const playing = this.phase === 'play' || this.phase === 'endless';
    this.input.setDefaultCursor(playing ? (this.pointerDown ? 'grabbing' : 'grab') : 'pointer');
  }

  private updateHoverCursor(x: number, y: number): void {
    if (this.hitMute(x, y)) this.input.setDefaultCursor('pointer');
    else this.updateCursor();
  }

  private toggleMute(): void {
    this.muted = !this.muted;
    if (!this.muted) this.audio.resume();
    this.announce(this.strings.t(this.muted ? 'soundOff' : 'soundOn'));
  }

  private onConfirm(): void {
    if (this.phase === 'start') {
      this.beginPlay();
      this.audio.resume(); // first gesture: unlock audio
    } else if (this.phase === 'won') {
      // Verified already: offer ungated free play.
      this.sim.destroy();
      this.spawnSim({ ...(this.config ?? {}), target: 999 });
      this.phase = 'endless';
      this.keyIntent = 0;
      this.pointerTargetY = null;
      this.updateCursor();
      this.announce(this.strings.t('endless'));
    } else if (this.phase === 'lost') {
      // Retry the SAME gated challenge: same seed + config, fresh trace, must win.
      this.sim.destroy();
      this.spawnSim(this.config);
      this.beginPlay();
    }
  }

  private beginPlay(): void {
    this.phase = 'play';
    this.keyIntent = 0;
    this.pointerTargetY = null;
    this.actions = [];
    this.updateCursor();
    this.announce(this.sim.cfg.mode === 'solo'
      ? this.strings.t('soloProgress', { n: 0, total: this.sim.cfg.soloSurvive })
      : `${this.strings.t('score')} 0 0.`);
  }

  private toLogicalY(canvasY: number): number {
    // Invert the centred-field transform: the playfield occupies [oy, oy+fh] in
    // canvas Y, scaled by s, so a pointer in the letterbox margin maps cleanly past
    // the field edge (the sim clamps the paddle target).
    const { oy, s } = this.view;
    return (canvasY - oy) / (s || 1);
  }

  private currentIntent(): Action {
    if (this.keyIntent !== 0) return this.keyIntent as Action;
    if (this.pointerTargetY !== null) {
      const centre = this.sim.playerCentreY; // paddle body centre (fresh per worldstep)
      const dz = 8;
      if (this.pointerTargetY < centre - dz) return -1;
      if (this.pointerTargetY > centre + dz) return 1;
    }
    return 0;
  }

  // One fixed physics step. The trace records exactly these ticks during play.
  private tick(): void {
    if (this.phase !== 'play' && this.phase !== 'endless') return;
    // Paddle blip: the ball↔paddle collision resolves during the physics
    // integration that follows this handler, so the hit from the PREVIOUS step
    // shows up as an increase in the sim's counter now. (Detecting it via a
    // velocity-sign flip in this same tick would miss it, the flip lands during
    // integration, after this runs.) Wall blips come from the worldbounds event.
    if (!this.muted && this.sim.paddleHits > this.lastHits) this.audio.paddle();
    this.lastHits = this.sim.paddleHits;
    // Serve blip: the ball leaving centre after the serve delay.
    if (!this.muted && this.sim.serves > this.lastServes) this.audio.serve();
    this.lastServes = this.sim.serves;

    const intent = this.currentIntent();
    if (this.phase === 'play') this.actions.push(intent);
    const p0 = this.sim.playerPoints;
    const c0 = this.sim.cpuPoints;
    // Step inside the seeded trap (same as the headless run); input + sound +
    // render stay outside it on real entropy.
    this.trap.run(() => this.sim.step(intent)); // scoring happens here, synchronously
    if (!this.muted && (this.sim.playerPoints !== p0 || this.sim.cpuPoints !== c0)) this.audio.score();
    if (this.phase === 'play' && this.sim.isOver()) this.finishRound();
  }

  update(): void {
    // Endless free play (post-verdict, ungated, local-only): a solo run ends on a miss
    // and a rival run ends at the cap, but endless should never stop, so restart a
    // fresh round when the sim is over. Done on the render frame (not the worldstep
    // handler) so the Arcade bodies are not torn down and rebuilt mid-physics-step.
    if (this.phase === 'endless' && this.sim.isOver()) {
      this.sim.destroy();
      this.spawnSim({ ...(this.config ?? {}), target: 999 });
      this.announce(this.strings.t('endless'));
    }
    this.render();
  }

  private finishRound(): void {
    const { passed } = this.sim.result();
    const solo = this.sim.cfg.mode === 'solo';
    const soloMsg = (): string => this.strings.t('soloProgress', { n: this.sim.rebounds, total: this.sim.cfg.soloSurvive });
    const rivalScore = (): string => `${this.strings.t('score')} ${this.sim.playerPoints} ${this.sim.cpuPoints}.`;
    if (passed) {
      this.phase = 'won';
      this.deps.bridge.pass({ trace: encode(this.actions) });
      this.announce(`${this.strings.t('verified')}. ${solo ? soloMsg() : rivalScore()}`);
    } else {
      this.phase = 'lost';
      this.announce(solo ? soloMsg() : rivalScore());
    }
    this.updateCursor();
  }

  private render(): void {
    const W = this.scale.gameSize.width || FIELD_W;
    const H = this.scale.gameSize.height || FIELD_H;
    // ONE uniform scale (no separate x/y), field centred. Extra host height or width
    // becomes letterbox margin around a fixed-aspect table, never a stretch. Field
    // point (x,y) -> canvas (ox + x*s, oy + y*s); field length L -> L*s.
    const s = Math.min(W / FIELD_W, H / FIELD_H);
    const fw = FIELD_W * s;
    const fh = FIELD_H * s;
    const ox = (W - fw) / 2;
    const oy = (H - fh) / 2;
    this.view = { oy, s }; // only the Y-inverse slice the pointer handlers need
    const sim = this.sim;

    this.cameras.main.setBackgroundColor(this.colors.bg); // fills the whole canvas
    const g = this.gfx;
    g.clear();

    // Court (everything below is field-relative: ox/oy offset + uniform s scale).
    g.fillStyle(this.colors.line, 1);
    // Top + bottom walls: the surfaces the ball bounces off in BOTH modes (the left
    // edge is always an open goal; the right wall is solo-only, drawn below). Thin bars
    // flush to the field edges so the bounce boundary reads instead of being invisible.
    const WALL = 6;
    g.fillRect(ox, oy, fw, WALL * s);
    g.fillRect(ox, oy + (FIELD_H - WALL) * s, fw, WALL * s);
    // Centre net.
    for (let y = 10; y < FIELD_H - 10; y += 28) g.fillRect(ox + (FIELD_W / 2 - 2) * s, oy + y * s, 4 * s, 16 * s);
    g.fillStyle(this.colors.player, 1);
    g.fillRect(ox + PLAYER_X * s, oy + (sim.playerCentreY - PADDLE_H / 2) * s, PADDLE_W * s, PADDLE_H * s);
    if (sim.cfg.mode === 'solo') {
      // Solo: a wall on the right (the ball rebounds off it) instead of a rival paddle.
      g.fillStyle(this.colors.line, 1);
      g.fillRect(ox + (FIELD_W - 6) * s, oy, 6 * s, FIELD_H * s);
    } else {
      g.fillStyle(this.colors.cpu, 1);
      g.fillRect(ox + CPU_X * s, oy + (sim.cpuCentreY - PADDLE_H / 2) * s, PADDLE_W * s, PADDLE_H * s);
    }
    g.fillStyle(this.colors.ball, 1);
    g.fillCircle(ox + sim.ballX * s, oy + sim.ballY * s, BALL_R * s);

    this.hud.setVisible(this.phase !== 'start');
    this.hud.setFontSize(Math.max(14, Math.round(20 * s)));
    this.hud.setPosition(ox + fw / 2, oy + 8 * s);
    this.hud.setText(sim.cfg.mode === 'solo' ? `${sim.rebounds} / ${sim.cfg.soloSurvive}` : `${sim.playerPoints}   ${sim.cpuPoints}`);

    const overlay = this.phase === 'start' || this.phase === 'won' || this.phase === 'lost';
    if (overlay) {
      g.fillStyle(this.colors.bg, 0.82);
      g.fillRect(0, 0, W, H); // dim the full screen, not just the field
    }
    this.drawMuteButton(g, ox + fw, oy, s);
    this.layoutScreen(ox, oy, fw, fh, s);
  }

  // Speaker glyph in the top-right; a red slash when muted. Hit rect cached for
  // pointer + hover handling.
  private drawMuteButton(g: Phaser.GameObjects.Graphics, fieldRight: number, fieldTop: number, s: number): void {
    const size = Math.max(20, Math.round(26 * s));
    const pad = Math.round(10 * s);
    const bx = fieldRight - size - pad; // anchored to the field's top-right, not the screen's
    const by = fieldTop + pad;
    this.muteRect = { x: bx, y: by, w: size, h: size };
    g.fillStyle(0x000000, 0.18);
    g.fillRoundedRect(bx, by, size, size, Math.round(size * 0.2));
    g.fillStyle(this.ink.icon, 1);
    // speaker body + cone (the cone trapezoid drawn as two triangles)
    g.fillRect(bx + size * 0.2, by + size * 0.4, size * 0.16, size * 0.2);
    const ax = bx + size * 0.34;
    const topY = by + size * 0.4;
    const botY = by + size * 0.6;
    const coneX = bx + size * 0.52;
    g.fillTriangle(ax, topY, coneX, by + size * 0.26, coneX, by + size * 0.74);
    g.fillTriangle(ax, topY, coneX, by + size * 0.74, ax, botY);
    if (this.muted) {
      g.lineStyle(Math.max(2, size * 0.09), COLOR_SLASH, 1);
      g.lineBetween(bx + size * 0.58, by + size * 0.3, bx + size * 0.82, by + size * 0.7);
    } else {
      g.lineStyle(Math.max(1.5, size * 0.06), this.ink.icon, 1);
      g.beginPath();
      g.arc(bx + size * 0.5, by + size * 0.5, size * 0.24, -0.6, 0.6);
      g.strokePath();
    }
  }

  private layoutScreen(ox: number, oy: number, fw: number, fh: number, s: number): void {
    let titleText = '';
    let bodyText = '';
    let promptText = '';
    const solo = this.sim.cfg.mode === 'solo';
    if (this.phase === 'start') {
      titleText = 'Paddle Rally';
      const objective = solo
        ? this.strings.t('soloObjective', { n: this.sim.cfg.soloSurvive })
        : this.strings.t('startObjective');
      bodyText = `${objective}\n\n${this.strings.t('startControls')}`;
      promptText = this.strings.t('startPrompt');
    } else if (this.phase === 'won') {
      titleText = this.strings.t('verified');
      bodyText = solo ? `${this.sim.rebounds}` : `${this.sim.playerPoints}  -  ${this.sim.cpuPoints}`;
      promptText = this.strings.t('win');
    } else if (this.phase === 'lost') {
      titleText = solo
        ? `${this.sim.rebounds} / ${this.sim.cfg.soloSurvive}`
        : `${this.sim.playerPoints}  -  ${this.sim.cpuPoints}`;
      bodyText = '';
      promptText = solo ? this.strings.t('soloLose') : this.strings.t('lose');
    }
    const show = titleText !== '' || promptText !== '';
    for (const [t, text, y, size] of [
      [this.title, titleText, 0.34, 40],
      [this.body, bodyText, 0.52, 16],
      [this.prompt, promptText, 0.72, 16],
    ] as [Phaser.GameObjects.Text, string, number, number][]) {
      t.setVisible(show && text !== '');
      if (show && text !== '') {
        t.setText(text);
        t.setFontSize(Math.max(12, Math.round(size * s)));
        t.setWordWrapWidth(fw * 0.82); // wrap to the field, not the full canvas
        t.setPosition(ox + fw / 2, oy + fh * y); // centred on the field (== screen centre)
      }
    }
  }
}

function runPaddleRallyLive(deps: LiveDeps): () => void {
  const host = deps.container;
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  // The iframe's root element: its clientWidth/Height ARE the viewport (the space the
  // game must fill), unlike the auto-height host which collapses under the absolute
  // canvas. Standards mode (<!DOCTYPE html> in the srcdoc) guarantees this.
  const root = host.ownerDocument.documentElement;

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: host,
    width: FIELD_W,
    height: FIELD_H,
    backgroundColor: DEFAULT_COLORS.bg,
    banner: false,
    audio: { noAudio: true },
    scale: { mode: Phaser.Scale.NONE },
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, fixedStep: true, fps: 60, debug: false } },
  });

  const sizeToHost = (): void => {
    const w = Math.max(1, root.clientWidth || host.clientWidth || FIELD_W);
    const vh = root.clientHeight || 0;
    // Fill the iframe viewport; fall back to a width-derived box only if it is
    // unmeasurable (pre-layout) — a later observer fire corrects it.
    const h = vh >= 40 ? vh : Math.round((w * FIELD_H) / FIELD_W);
    // Deliberately do NOT set host.style.height: the canvas is absolute (out of flow)
    // and fills h on its own, while the iframe is widget-sized, so the host needs no
    // height. Writing it would resize an OBSERVED element mid-callback and trip a
    // benign "ResizeObserver loop" console warning. Host stays auto-height.
    game.scale.resize(w, h);
    const c = game.canvas;
    if (c) {
      c.style.position = 'absolute';
      c.style.top = '0';
      c.style.left = '0';
      c.style.display = 'block';
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
    }
  };

  let ro: ResizeObserver | undefined;
  const onReady = (): void => {
    sizeToHost();
    // Observe the viewport root (catches height="full" resizes that never change the
    // auto-height host) AND the host (width / layout changes).
    ro = new ResizeObserver(() => sizeToHost());
    ro.observe(root);
    ro.observe(host);
    game.scene.add('paddle-rally', PaddleRallyScene, true, deps);
  };
  if (game.isBooted) onReady();
  else game.events.once('ready', onReady);

  return () => {
    if (ro) ro.disconnect();
    game.destroy(true);
  };
}

register((container, bridge, ctx) => runPaddleRallyLive({ container, bridge, ctx }));
