// The Paddle Rally simulation, built on REAL Phaser Arcade Physics. The preset
// (@caputchin/preset-phaser) makes Arcade deterministic (fixed step + seeded RNG
// + deterministic transcendentals on both ends), so this same class runs the
// live game and the headless server replay and they agree bit-for-bit. No
// hand-rolled physics: bodies, velocities, colliders, and world bounds are all
// Phaser's.
//
// Velocities are Arcade px/second; at the fixed 60 fps step that is px/60 per
// tick. Config knobs are authored in tick-units (small numbers) and scaled here.
import type Phaser from 'phaser';
import type { Seed } from '@caputchin/replay-contract';
import { seedFromPlatform } from '@caputchin/preset-phaser';

export type Action = -1 | 0 | 1;

/** Game mode (site-owner config knob):
 *  - `rival`: classic Pong vs a CPU paddle, first to `target` points (flick-based
 *    english lets a human out-skill the rival; held-key/idle bots lose by construction).
 *  - `solo`: no rival. The right side is a wall; keep the ball alive and survive a
 *    target number of returns. The ball can be FAST here because there is no rival to
 *    outrun, so speed only raises HUMAN difficulty and never hands a bot the gate
 *    (surviving N returns is luck^N for a non-tracking bot). */
export type Mode = 'rival' | 'solo';

export const FIELD_W = 640;
export const FIELD_H = 400;
export const PADDLE_W = 14;
export const PADDLE_H = 80;
export const PLAYER_X = 28; // left edge of the player paddle
export const CPU_X = FIELD_W - 28 - PADDLE_W; // left edge of the rival paddle
export const BALL_R = 8;
export const STEP_MS = 1000 / 60;
export const MAX_TICKS = 60 * 120; // ~120s hard ceiling
export const SERVE_DELAY = 60; // ticks the ball holds at centre before firing
const TICK = 60; // tick-units -> px/second
const BALL_SPEED = 6; // FIXED ball speed (tick-units); see resolve() for why it is not a knob
// FLICK english: the player's shot power scales with how FRESH the paddle's motion
// is, not its raw speed. A held-key bot and a human both move at full speed, so raw
// speed cannot tell them apart, that is why a rival fast enough to stop the bot also
// stopped the human. Instead, shot power = how recently the paddle's motion started
// or reversed: a sharp, varied, just-flicked input lands a hard, aimed shot that
// beats the rival; a steady held key (one direction for many ticks) decays to a soft,
// near-flat shot the rival always returns. A held-key bot can never flick, so it
// stays soft (loses); a human who jabs the paddle into the ball wins by skill.
const FLICK_FLOOR = 0.35; // shot-power factor for a long-held steady direction (bot-like)
const FLICK_PEAK = 1.5; // shot-power factor right after a flick / direction change (skilled)
const FLICK_DECAY = 45; // ticks of unbroken same-direction motion to decay PEAK -> FLOOR
// SOLO mode: no rival, so the ball is free to be fast (speed only raises HUMAN
// difficulty, never a bot windfall). The ball keeps a steep SWEEP angle so it ranges
// the full height, meaning a still/held paddle is left behind and misses; only active
// tracking keeps it alive. Surviving `target` returns is luck^N for a non-tracking
// bot, so the bot floor is multiplicative, not a single lucky point.
const SOLO_RALLY_CAP = 1.3; // solo ball accelerates over the run (vx = speed, the difficulty)
const SOLO_SWEEP = 0.5; // solo |vy| = |vx| * this, CAPPED at paddleSpeed. Tying vy to vx (not a
// fixed value) keeps the ball ranging the full court even as it accelerates: a fixed vy goes flat
// at high speed and returns near centre, letting a STILL paddle catch it. The paddleSpeed cap keeps
// it reachable by a tracking player. vx is capped (ballSpeed * SOLO_RALLY_CAP) so vy = paddleSpeed
// still sweeps past the field height each round trip, so a non-tracking paddle is always left behind.
// solo returns-to-survive is the `target` knob directly; a fast ball keeps the bot floor low even
// at a short count (a non-tracking bot survives N returns with prob ~luck^N).

export interface PaddleRallyConfig {
  mode?: Mode;
  target?: number;
  paddle_speed?: number;
  cpu_difficulty?: number;
}

interface Rng {
  between(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
}

interface ResolvedConfig {
  mode: Mode;
  target: number;
  paddleSpeed: number; // px/s
  ballSpeed: number; // px/s (horizontal magnitude)
  cpuDifficulty: number; // 5..10
  soloSurvive: number; // solo: returns to survive to pass
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

function resolve(config: PaddleRallyConfig | null | undefined): ResolvedConfig {
  const c = config ?? {};
  const mode: Mode = c.mode === 'solo' ? 'solo' : 'rival';
  // target is floored at 3 (not 1): in rival mode a single lucky point would let
  // residual random-bot luck through, but luck does not compound over 3 points; in
  // solo the same knob IS the returns-to-survive count. The floor holds the bots-lose
  // invariant even if a config bypasses the UI.
  const target = clamp(Math.trunc(c.target ?? 3), 3, 99);
  // difficulty is floored at 5: in rival, below it a held-key bot's english resonates
  // into stray points; in solo it scales the ball speed. At d5..10 the bot floor holds.
  const cpuDifficulty = clamp(Math.trunc(c.cpu_difficulty ?? 5), 5, 10);
  // Rival ball speed is FIXED at the resonance-free value (a faster ball outruns the
  // rival and lets bots score on its misses, measured ~20% at speed 8). Solo has no
  // rival to outrun, so it runs faster and scales with difficulty, speed there is pure
  // human challenge, never a bot windfall.
  const ballSpeed = (mode === 'solo' ? 5 + cpuDifficulty * 0.4 : BALL_SPEED) * TICK;
  return {
    mode,
    target,
    paddleSpeed: clamp(Math.trunc(c.paddle_speed ?? 6), 1, 20) * TICK,
    ballSpeed,
    cpuDifficulty,
    soloSurvive: target, // solo: the target knob IS the returns-to-survive count
  };
}

type Body = Phaser.Physics.Arcade.Body;

/** The Arcade sim. `create(scene)` builds the world; `step(action)` advances one
 *  tick of intent (the physics integration is Phaser's, run by the scene step). */
export class PaddleRallySim {
  readonly cfg: ResolvedConfig;
  private rng: Rng;
  private player!: Phaser.GameObjects.Rectangle;
  private cpu?: Phaser.GameObjects.Rectangle; // rival mode only; absent in solo
  private ball!: Phaser.GameObjects.Arc;
  private colliders: Phaser.Physics.Arcade.Collider[] = [];
  playerPoints = 0;
  cpuPoints = 0;
  /** Solo mode: successful returns this run, and whether the survive target was met. */
  rebounds = 0;
  private soloPassed = false;
  /** Count of ball↔paddle collisions. Render-side only (the live scene plays a
   *  blip when it increases); never read by the verdict, so it stays in the
   *  deterministic sim harmlessly. */
  paddleHits = 0;
  /** Count of serves fired (the ball leaving centre after the serve delay). Render-side
   *  only, like paddleHits: the live scene blips when it increases. */
  serves = 0;
  private over = false;
  private serveTimer = 0;
  /** Player paddle speed (px/s) = paddle_speed config. */
  private readonly paddleSpeed: number;
  /** Rival vertical tracking speed (px/s); difficulty is the dial. */
  private readonly cpuSpeed: number;
  /** How much vertical spin the PLAYER paddle can impart (= its own speed). */
  private readonly playerSpinCap: number;
  /** How much spin the RIVAL imparts, below its tracking speed so it returns its
   *  own shots. */
  private readonly cpuSpinCap: number;
  /** Each paddle's INTENDED vertical velocity this tick. The english reads this,
   *  not the body velocity, which Arcade zeroes when the paddle is wall-blocked. */
  private playerIntentVy = 0;
  private cpuIntentVy = 0;

  constructor(seed: Seed, config: PaddleRallyConfig | null | undefined) {
    this.cfg = resolve(config);
    this.rng = seedFromPlatform(seed) as unknown as Rng;
    // Ball speed is fixed (see resolve), so paddle/rival speeds need no ball-speed
    // scaling: difficulty alone sets the rival's tracking speed, and the player paddle
    // out-speeds the rival in the lower difficulty band (so the slower rival is the
    // one that misses the accelerating ball, and the human scores).
    this.paddleSpeed = this.cfg.paddleSpeed;
    this.cpuSpeed = 150 + this.cfg.cpuDifficulty * 32; // d5=310 .. d10=470 px/s
    // The player's spin caps at a FLICKED shot (peak factor), well above the rival's
    // tracking speed, so a well-timed flick beats the rival; a soft (held-key) shot
    // lands far under this and is returned. The rival's spin stays inside its own
    // tracking reach so it always returns its own shots.
    this.playerSpinCap = this.paddleSpeed * FLICK_PEAK;
    this.cpuSpinCap = this.cpuSpeed * 0.35;
  }

  private body(obj: Phaser.GameObjects.GameObject): Body {
    return (obj as unknown as { body: Body }).body;
  }

  /** Build the world. Call from the scene's create() with the scene. */
  create(scene: Phaser.Scene): void {
    scene.physics.world.setBounds(0, 0, FIELD_W, FIELD_H);
    // Top + bottom are always walls. The LEFT edge is the player's miss / scoring line
    // (ball passes through). The RIGHT edge is a scoring line in rival mode (passes
    // through, past the rival) but a WALL in solo (the ball rebounds off it, since
    // there is no rival there). checkCollision lives on the WORLD (the body-level flag
    // does not gate world bounds in Arcade).
    scene.physics.world.checkCollision.left = false;
    scene.physics.world.checkCollision.right = this.cfg.mode === 'solo';

    const mkPaddle = (x: number, color: number): Phaser.GameObjects.Rectangle => {
      const p = scene.add.rectangle(x + PADDLE_W / 2, FIELD_H / 2, PADDLE_W, PADDLE_H, color);
      scene.physics.add.existing(p);
      const b = this.body(p);
      b.setImmovable(true);
      b.setAllowGravity(false);
      b.setCollideWorldBounds(true);
      return p;
    };
    this.player = mkPaddle(PLAYER_X, 0x8a5a2b);
    if (this.cfg.mode === 'rival') this.cpu = mkPaddle(CPU_X, 0x6b4f8a); // no rival in solo

    this.ball = scene.add.circle(FIELD_W / 2, FIELD_H / 2, BALL_R, 0xc9874a);
    scene.physics.add.existing(this.ball);
    const bb = this.body(this.ball);
    bb.setAllowGravity(false);
    bb.setBounce(1, 1);
    // 4th arg enables the `worldbounds` event on THIS body (the paddles get plain
    // collideWorldBounds, no event), so the live scene can blip on a wall bounce. The
    // event only fires for listeners; physics (the bounce) is unchanged, so it is
    // render-side and determinism-neutral (the headless run registers no listener).
    bb.setCollideWorldBounds(true, 1, 1, true);
    // Left/right are scoring lines, not walls: disabled at the WORLD level (above)
    // so the ball passes them. The ball's OWN checkCollision stays all-true, those
    // flags gate body-vs-body separation too, so disabling left/right here would
    // make the ball pass straight THROUGH the paddles.

    const onHit = (isPlayer: boolean): void => {
      this.paddleHits += 1;
      const bb = this.body(this.ball);
      if (this.cfg.mode === 'solo') {
        // SOLO: only the player hits (no rival collider). Count the return, accelerate
        // to a higher ceiling (safe: no rival to outrun), and re-impose a steep SWEEP
        // so the ball ranges the full court and a still/held paddle is left behind. A
        // small flick adds player control; the sweep keeps a floor on |vy| so an idle
        // paddle can never flatten the ball into a centred loop. Survive the target
        // number of returns to pass.
        this.rebounds += 1;
        this.rallyMul = Math.min(this.rallyMul * 1.05, SOLO_RALLY_CAP);
        const dirSolo = bb.velocity.x >= 0 ? 1 : -1; // after a left-paddle hit the ball goes right
        bb.velocity.x = dirSolo * this.cfg.ballSpeed * this.rallyMul;
        const sign = bb.velocity.y >= 0 ? 1 : -1; // keep the ball's current vertical heading
        const flickSolo = FLICK_FLOOR + (FLICK_PEAK - FLICK_FLOOR) * Math.max(0, 1 - this.playerStreak / FLICK_DECAY);
        // vy scales with the (accelerating) ball speed so the ball keeps ranging the
        // full court, capped at the paddle's own speed so a tracking player can reach
        // it; a small flick adds control. A still paddle is left behind by the sweep.
        bb.velocity.y = clamp(sign * Math.abs(bb.velocity.x) * SOLO_SWEEP + this.playerIntentVy * flickSolo * 0.4, -this.paddleSpeed, this.paddleSpeed);
        // The pass decision is NOT made here: this is an Arcade collision callback
        // that fires during integration, after the worldstep tick bump, so deciding
        // here makes record (loops to isOver) and replay (loops to trace length)
        // evaluate the final rebound at different tick boundaries -> divergence. Only
        // COUNT here; step() reads the count on the synchronous tick path and decides.
        return;
      }
      // Per-hit horizontal acceleration (classic Pong), modest ceiling: a fast ball
      // gives the rival little reposition time, and past this a bot's stray english
      // slips past more often, so the ceiling holds the bots-lose floor. Raising the
      // start speed or this ceiling was measured to spike the random-bot bypass (bs8
      // hit ~20%), because a fast ball outruns the rival and bots score on its misses.
      this.rallyMul = Math.min(this.rallyMul * 1.05, 1.6);
      const dir = bb.velocity.x >= 0 ? 1 : -1; // post-bounce horizontal direction
      bb.velocity.x = dir * this.cfg.ballSpeed * this.rallyMul;
      // Spin = PADDLE ENGLISH from the paddle's INTENDED vertical motion (its action /
      // tracking decision), NOT where the ball struck it. Using INTENT, not body
      // velocity, matters at the walls: a paddle pressed into the top/bottom wall has
      // its body velocity zeroed by Arcade (the "stuck on the top" bug); the intent
      // stays non-zero, so a player pressing up at the wall still angles the ball up
      // and out. An idle paddle's intent is 0: no spin at any flick, so it can never
      // launch a shot the rival can't track.
      if (isPlayer) {
        // FLICK: the player's shot power scales with how FRESH the motion is. A sharp
        // or just-reversed input (short streak) lands a hard shot above the rival's
        // tracking speed and scores; a held key (long streak) decays toward FLICK_FLOOR
        // (a soft, near-flat shot the rival always returns). This is the human-vs-bot
        // separator: both move at full speed, but only deliberate, varied motion earns
        // a winning shot. Serve delay (60t) > FLICK_DECAY (45t) so a held-key bot has
        // already decayed to the floor by its first contact.
        const flick = FLICK_FLOOR + (FLICK_PEAK - FLICK_FLOOR) * Math.max(0, 1 - this.playerStreak / FLICK_DECAY);
        bb.velocity.y = clamp(this.playerIntentVy * flick, -this.playerSpinCap, this.playerSpinCap);
      } else {
        // The rival's spin stays inside cpuSpinCap (< its tracking speed) so it always
        // returns its own shots; it is not flick-scaled (it is not a player).
        bb.velocity.y = clamp(this.cpuIntentVy, -this.cpuSpinCap, this.cpuSpinCap);
      }
    };
    this.colliders.push(scene.physics.add.collider(this.ball, this.player, () => onHit(true)));
    if (this.cpu) {
      this.colliders.push(scene.physics.add.collider(this.ball, this.cpu, () => onHit(false)));
    }

    // Solo serves toward the right wall (the ball rebounds back to the player to start
    // the rally); rival serves toward a random side.
    this.serve(this.cfg.mode === 'solo' ? 1 : this.rng.pick([-1, 1]));
  }

  /** Tear down this round's bodies + colliders (for live retry / endless reset). */
  destroy(): void {
    for (const c of this.colliders) c.destroy();
    this.colliders = [];
    this.player?.destroy();
    this.cpu?.destroy();
    this.ball?.destroy();
  }

  private serve(dir: number): void {
    const bb = this.body(this.ball);
    this.ball.setPosition(FIELD_W / 2, FIELD_H / 2);
    bb.reset(FIELD_W / 2, FIELD_H / 2);
    bb.setVelocity(0, 0);
    this.rallyMul = 1; // reset per-hit acceleration each serve
    // playerStreak is NOT reset here: it tracks paddle-motion continuity, which the
    // serve does not interrupt.
    // remember the pending serve velocity; fired when the delay elapses. The serve
    // vy is held below the slowest rival's tracking speed (d5 = 310 px/s) so the
    // rival always reaches the serve, the serve alone can never beat it.
    this.pendingVx = dir * this.cfg.ballSpeed;
    this.pendingVy = this.cfg.mode === 'solo'
      ? this.rng.pick([-1, 1]) * clamp(Math.abs(this.pendingVx) * SOLO_SWEEP, 0, this.paddleSpeed) // sweeps the court, trackable
      : this.rng.between(1, 2) * this.rng.pick([-1, 1]) * TICK; // rival: ±60..120 px/s (below tracking speed)
    this.serveTimer = SERVE_DELAY;
  }
  private pendingVx = 0;
  private pendingVy = 0;
  private rallyMul = 1;
  /** Consecutive ticks the player has held the SAME non-zero action. Drives the
   *  flick factor: a long streak (held key) decays the shot toward FLICK_FLOOR. */
  private playerStreak = 0;
  private playerPrevAction: Action = 0;

  /** Advance one tick of intent. Physics integration happens in the scene step. */
  step(action: Action): void {
    if (this.over) return;
    const pb = this.body(this.player);
    // Track motion-continuity for the flick factor: a sustained same-direction hold
    // grows the streak (decaying the next shot toward FLICK_FLOOR); any reversal,
    // stop, or fresh start resets it (a flick, near FLICK_PEAK).
    if (action !== 0 && action === this.playerPrevAction) this.playerStreak += 1;
    else this.playerStreak = 0;
    this.playerPrevAction = action;
    this.playerIntentVy = action * this.paddleSpeed;
    pb.setVelocityY(this.playerIntentVy);

    // Read BODY centres, NEVER the GameObject (this.ball.x / this.cpu.y): the body
    // integrates once per fixed worldstep, but Phaser syncs the GameObject only
    // once per rendered frame. On a frame that runs several worldsteps (high
    // refresh / catch-up), the GameObject is stale, so reading it would make the
    // live game's CPU + scoring diverge from the one-step-per-call server replay.
    const ballC = this.body(this.ball).center;

    // Rival tracker (RIVAL MODE ONLY): while the ball comes toward the rival it chases
    // the ball's y at cpuSpeed; otherwise it eases back to centre. A small deadzone
    // stops the 1px jitter at the target. There is no rival in solo, so this is skipped.
    if (this.cpu) {
      const cb = this.body(this.cpu);
      const approaching = this.body(this.ball).velocity.x > 0; // cpu is on the right
      const target = approaching ? ballC.y : FIELD_H / 2;
      const diff = target - cb.center.y;
      this.cpuIntentVy = diff > 6 ? this.cpuSpeed : diff < -6 ? -this.cpuSpeed : 0;
      cb.setVelocityY(this.cpuIntentVy);
    }

    // Serve delay: ball frozen at centre, paddles still move.
    if (this.serveTimer > 0) {
      this.serveTimer -= 1;
      if (this.serveTimer === 0) {
        this.body(this.ball).setVelocity(this.pendingVx, this.pendingVy);
        this.serves += 1; // ball leaves centre -> serve blip (render-side only)
      }
      return;
    }

    if (this.cfg.mode === 'solo') {
      // Decide pass/fail on the SYNCHRONOUS step path (NOT in the collision callback),
      // so record and replay evaluate it at the identical tick: the rebound counted in
      // the prior integration is visible here. Surviving the target returns -> pass;
      // the ball past the left edge (a miss) -> fail. (Right edge is a wall in solo.)
      if (this.rebounds >= this.cfg.soloSurvive) {
        this.over = true;
        this.soloPassed = true;
      } else if (ballC.x < -BALL_R) {
        this.over = true;
      }
      return;
    }
    // Rival scoring: ball fully past a scoring line.
    if (ballC.x < -BALL_R) {
      this.cpuPoints += 1;
      if (this.reachedTarget()) this.over = true;
      else this.serve(1);
    } else if (ballC.x > FIELD_W + BALL_R) {
      this.playerPoints += 1;
      if (this.reachedTarget()) this.over = true;
      else this.serve(-1);
    }
  }

  private reachedTarget(): boolean {
    return this.playerPoints >= this.cfg.target || this.cpuPoints >= this.cfg.target;
  }

  isOver(): boolean {
    return this.over;
  }

  result(): { score: number; passed: boolean } {
    // Solo: pass = survived the target returns; score = returns made. Rival: pass =
    // reached the points target; score = player points.
    if (this.cfg.mode === 'solo') return { score: this.rebounds, passed: this.soloPassed };
    return { score: this.playerPoints, passed: this.playerPoints >= this.cfg.target };
  }

  // The GameObjects, for the live scene to hide (rendering reads the body-centre
  // positions below instead, so visuals match the physics the sim sees). In solo
  // there is no rival, so cpuObj/cpuCentreY fall back to the player (the live scene
  // does not render a rival in solo).
  get playerObj(): Phaser.GameObjects.Rectangle { return this.player; }
  get cpuObj(): Phaser.GameObjects.Rectangle { return this.cpu ?? this.player; }
  get ballObj(): Phaser.GameObjects.Arc { return this.ball; }

  // Body-centre positions (fresh every worldstep). Use these for logic, input,
  // and rendering, never the GameObject, which lags on multi-worldstep frames.
  get ballX(): number { return this.body(this.ball).center.x; }
  get ballY(): number { return this.body(this.ball).center.y; }
  get playerCentreY(): number { return this.body(this.player).center.y; }
  get cpuCentreY(): number { return this.body(this.cpu ?? this.player).center.y; }
}
