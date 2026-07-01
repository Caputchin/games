// PaddleRallySim behaviour over the real Arcade physics, run through the headless
// recorder (the same physics the live game and the server replay execute).
//
// SECURITY POSTURE (honest, not aspirational). Paddle Rally is a SKILL gate: it filters
// non-playing input, not all automation. Two distinct guarantees, asserted apart:
//   - idle and constant-input (held-key) bots win 0 BY CONSTRUCTION: shot power comes
//     from a FLICK (fresh / reversed motion), so a still or steadily-held paddle
//     decays to a soft, near-flat shot the rival always returns. This is what lets a
//     human beat the rival (a deliberate flick lands a hard, aimed shot) while a
//     held-key bot, which hits at the same raw speed, cannot.
//   - a random/erratic bot is filtered PROBABILISTICALLY, not absolutely: it jerks
//     the paddle, so it sometimes earns flick power and, when it happens to be in
//     position, scores by luck. This residual is TARGET-DEPENDENT: at the security-grade
//     band (target >= 3) it is a few percent (~2-3% rival, <1% solo, falling toward 0 by
//     difficulty 10 / higher targets); at the LOW-FRICTION floor the site owner can opt
//     into (target 1-2) it climbs sharply (measured rival ~9% / solo ~37% at target 1),
//     because a single point / a couple of returns is a much shorter luck window. That
//     residual is the deliberate cost of making the game human-winnable at low friction
//     (accept-residual posture, not a false zero). A TRACKING bot beats Paddle Rally like
//     a human does, inherent to every skill game; the platform layers other signals. See
//     the README "Security model" section.
// `./install` (via the recorder's imports) stubs the DOM before Phaser.
import '@caputchin/preset-phaser/install';
import { describe, expect, it } from 'vitest';
import { FIELD_W, MAX_TICKS, SERVE_DELAY, type Action, type Mode } from '../src/sim.js';
import { recordRun, trackBall, idle, holdUp, holdDown, type IntentContext } from './harness.js';

const SEEDS: ReadonlyArray<readonly [number, number, number, number]> = [
  [11, 22, 33, 44], [7, 7, 7, 7], [3, 1, 4, 1], [42, 42, 42, 42], [5, 6, 7, 8], [99, 1, 99, 1],
  [2524885248, 1221791727, 2524885255, 962031360], [4294967295, 4294967295, 1, 2],
];

const DIFFICULTIES = [5, 6, 7, 8, 9, 10] as const; // the enforced schema floor..max
// The enforced target range: floor (1), default (3), ceiling (10). The bot-resistance
// claims are asserted at BOTH extremes: target 1 (the single-point concern) and target
// 10 (a long game gives an erratic bot the most chances to fluke a point).
const TARGETS = [1, 3, 10] as const;

// A reproducible random-input bot: a non-tracking paddle jerking up/down/still from a
// seeded stream. It is the erratic adversary the pinned ball speed + multi-point target
// defend against; it cannot sustain a tracking paddle-rally. Its bypass is target-
// dependent: within the documented ceiling at the security-grade band (target >= 3),
// climbing at the low-friction floor (target 1-2). See the posture note above.
function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randomBot = (n: number): ((c: IntentContext) => Action) => {
  const r = mulberry32(n >>> 0);
  return () => {
    const v = r();
    return (v < 0.4 ? -1 : v < 0.8 ? 1 : 0) as Action;
  };
};

// Random-bot bypass fraction for one (mode, target), swept over the difficulty band x
// `iters` generated seeds. Shared by the rival + solo empirical bound tests so both
// assert against the SAME measurement path the posture notes quote.
async function randomBotBypass(mode: Mode, target: number, iters: number): Promise<number> {
  let runs = 0;
  let wins = 0;
  for (let i = 1; i <= iters; i++) {
    const seed = [
      Math.imul(i, 2654435761) >>> 0, Math.imul(i, 40503) >>> 0,
      Math.imul(i, 2246822519) >>> 0, (Math.imul(i, 3266489917) + 1) >>> 0,
    ] as const;
    for (const cpu_difficulty of DIFFICULTIES) {
      const rec = await recordRun({ seed, config: { mode, target, cpu_difficulty }, intent: randomBot(i * 31 + cpu_difficulty), maxTicks: 6000 });
      runs += 1;
      if (rec.passed) wins += 1;
    }
  }
  return wins / runs;
}

describe('PaddleRallySim (Arcade physics)', () => {
  it('holds the ball at centre for the serve delay, then fires it', async () => {
    const rec = await recordRun({ seed: [1, 2, 3, 4], config: { target: 3 }, intent: idle, maxTicks: SERVE_DELAY + 30 });
    for (let i = 0; i < SERVE_DELAY - 1; i++) expect(rec.ballSamples[i]!.x).toBe(FIELD_W / 2);
    const last = rec.ballSamples[rec.ballSamples.length - 1]!;
    expect(last.x).not.toBe(FIELD_W / 2);
  });

  // BY-CONSTRUCTION guarantee: idle and held-key bots impart no / flat english, so
  // the rival returns them and they never score. Swept across the whole reachable
  // difficulty band (ball speed is fixed in the sim) x seeds. This is the claim
  // Paddle Rally actually upholds absolutely.
  it('idle and constant-input bots NEVER win (by construction), across difficulty 5..10 x target 1..10', async () => {
    const wins: string[] = [];
    for (const [label, intent] of [['idle', idle], ['up', holdUp], ['down', holdDown]] as const) {
      for (const cpu_difficulty of DIFFICULTIES) {
        for (const target of TARGETS) {
          for (const seed of SEEDS) {
            const rec = await recordRun({ seed, config: { target, cpu_difficulty }, intent, maxTicks: 6000 });
            if (rec.passed) wins.push(`${label} d${cpu_difficulty} t${target} seed ${seed.join('.')}`);
          }
        }
      }
    }
    expect(wins).toEqual([]);
  });

  // The flick-score gate: a held/idle paddle imparts only the decayed floor, so
  // even a shot that slips past the rival on a miss does not convert. Stronger
  // than "never wins": a held/idle bot never scores a SINGLE point.
  it('a held/idle bot never scores a point (flick-score gate), across difficulty 5..10 x target 1..10', async () => {
    const scored: string[] = [];
    for (const [label, intent] of [['idle', idle], ['up', holdUp], ['down', holdDown]] as const) {
      for (const cpu_difficulty of DIFFICULTIES) {
        // The longest game (target 10) gives the bot the most chances to fluke a point,
        // so it is the tightest test of the flick-score gate; the floor (1) is swept too.
        for (const target of TARGETS) {
          for (const seed of SEEDS) {
            const rec = await recordRun({ seed, config: { target, cpu_difficulty }, intent, maxTicks: 6000 });
            if (rec.score > 0) scored.push(`${label} d${cpu_difficulty} t${target} seed ${seed.join('.')} -> ${rec.score}`);
          }
        }
      }
    }
    expect(scored).toEqual([]);
  });

  // EMPIRICAL guarantee: a random/erratic bot is filtered to a small bound (~3% at
  // the easier difficulties, ~0 by 10), NOT to zero. Property check over generated
  // seeds x the difficulty band; the bypass is explicitly a probabilistic ceiling
  // (see the posture note), the deliberate cost of a flick that a human can win with.
  // EMPIRICAL guarantee, TARGET-DEPENDENT. The random-bot bypass is a probabilistic
  // ceiling, not a false zero, and its height depends on how long the game is:
  //   - SECURITY-GRADE band (target >= 3, incl. the default): under the 5% ceiling
  //     (measured ~2.3% at target 3, falling toward 0 by target 10).
  //   - LOW-FRICTION band (target 1-2), which the site owner deliberately opts into for
  //     a quicker check: a much shorter luck window, so the bypass climbs (measured
  //     rival ~9.3% at target 1, ~3.0% at target 2). Asserted against honest, headroomed
  //     ceilings so a REGRESSION (rival weakening past these measured rates) still trips.
  it('a random/erratic bot bypass stays within the documented, target-dependent ceiling', async () => {
    for (const target of [3, 5, 10]) {
      expect(await randomBotBypass('rival', target, 50), `rival security-grade target ${target}`).toBeLessThan(0.05);
    }
    expect(await randomBotBypass('rival', 1, 50), 'rival low-friction target 1').toBeLessThan(0.15);
    expect(await randomBotBypass('rival', 2, 50), 'rival low-friction target 2').toBeLessThan(0.07);
  });

  it('a tracking player wins the easiest (floor difficulty 5) default', async () => {
    let wins = 0;
    for (const seed of SEEDS) {
      const rec = await recordRun({ seed, config: { target: 3, cpu_difficulty: 5 }, intent: trackBall });
      if (rec.passed) wins += 1;
    }
    // The chase is a weak human model (jitters, never aims) but it MOVES, so it earns
    // flick power and wins the default outright. A real player who flicks deliberately
    // does strictly better. (Pre-flick the rival tip-caught everything and only a long
    // grind won; the flick lets a moving player score by skill, early.)
    expect(wins).toBe(SEEDS.length);
  });

  // HUMAN-WINNABLE across the whole target range: the widened floor (1) and ceiling
  // (10) must both stay winnable by a moving player inside the tick ceiling, else the
  // config exposes an unbeatable setting. A tracking player clears every seed at both
  // ends (measured max ~2900 ticks at target 10, well under MAX_TICKS).
  it('a tracking player wins across the target range (floor 1 to ceiling 10), d5', async () => {
    for (const target of TARGETS) {
      let wins = 0;
      for (const seed of SEEDS) {
        const rec = await recordRun({ seed, config: { target, cpu_difficulty: 5 }, intent: trackBall, maxTicks: 6000 });
        if (rec.passed) wins += 1;
      }
      expect(wins, `rival target ${target}`).toBe(SEEDS.length);
    }
  });

  // RESOLUTION INVARIANT. A moving player's flick lands a hard shot that beats the
  // rival, so rallies resolve instead of stalling; a passive flat exchange ends when
  // the rival's own english walks the ball off the passive side. Every round must
  // terminate within the ceiling across the full difficulty band.
  it('every round terminates (no perpetual rally) across difficulty 5..10', async () => {
    for (const cpu_difficulty of DIFFICULTIES) {
      for (const seed of SEEDS.slice(0, 4)) {
        const rec = await recordRun({ seed, config: { target: 3, cpu_difficulty }, intent: trackBall });
        expect(rec.ticks).toBeLessThan(MAX_TICKS);
      }
    }
  });

  // The headless run seeds Math.random but the live game does not (Phaser owns its
  // sub-step loop, so the per-step withDeterministicEnv trap is not adoptable). That
  // asymmetry is safe ONLY if the verdict never depends on Math.random. Assert it:
  // the same play under three different Math.random streams must produce the same
  // trace + verdict. If a future Phaser version reads Math.random in the stepped
  // path, this fails loudly instead of silently diverging live vs server.
  it('verdict is invariant to the Math.random stream', async () => {
    const config = { target: 3, cpu_difficulty: 5 };
    const seed: readonly [number, number, number, number] = [11, 22, 33, 44];
    let s = 0x9e3779b9;
    const streams: Array<() => number> = [
      () => 0,
      () => 0.9999999,
      () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; },
    ];
    const real = Math.random;
    const out: string[] = [];
    try {
      for (const stream of streams) {
        Math.random = stream;
        const rec = await recordRun({ seed, config, intent: trackBall });
        out.push(`${rec.actions.join('')}|${rec.score}|${rec.passed}|${rec.ticks}`);
      }
    } finally {
      Math.random = real;
    }
    expect(out[1]).toBe(out[0]);
    expect(out[2]).toBe(out[0]);
  });
});

// SOLO MODE: no rival. The right edge is a wall; the player keeps the (fast) ball
// alive and must survive `target` returns. Same honest split as rival: idle/held-key
// lose BY CONSTRUCTION (the ball's sweep ranges the full court, leaving a still paddle
// behind), while a random/erratic bot is filtered to a small documented bound (it can
// luck through a few short returns), NOT to zero.
describe('PaddleRallySim (solo mode)', () => {
  // BY CONSTRUCTION: idle and held-key never survive. vy scales with vx (capped at
  // paddle speed) so the ball keeps ranging the full court at any speed; a still or
  // wall-pinned paddle is always left behind. Swept across the whole difficulty band x
  // seeds x the target range, including the SHORTEST reachable survival (target 1),
  // where luck has the best shot.
  it('no idle or held-key bot survives solo, across difficulty 5..10 x target 1..10', async () => {
    const survivors: string[] = [];
    for (const cpu_difficulty of DIFFICULTIES) {
      for (const target of TARGETS) {
        for (const seed of SEEDS) {
          for (const [label, intent] of [['idle', idle], ['up', holdUp], ['down', holdDown]] as const) {
            const rec = await recordRun({ seed, config: { mode: 'solo', target, cpu_difficulty }, intent, maxTicks: 6000 });
            if (rec.passed) survivors.push(`${label} d${cpu_difficulty} t${target} seed ${seed.join('.')}`);
          }
        }
      }
    }
    expect(survivors).toEqual([]);
  });

  // EMPIRICAL, TARGET-DEPENDENT (same posture as rival, but the drop-off is steeper).
  // Surviving a target number of returns is luck^target for a non-tracking bot, so:
  //   - SECURITY-GRADE band (target >= 3, incl. the presets at 5): well under the 5%
  //     ceiling (measured ~0.8% at target 3, ~0 by target 5).
  //   - LOW-FRICTION band (target 1-2): a single / double return is a wide luck window,
  //     so the bypass is high (measured ~37.5% at target 1, ~8.8% at target 2). This is
  //     the deliberate cost of a one-return solo check; asserted against honest ceilings
  //     so a regression past the measured rates still trips.
  it('a random bot bypass stays within the documented, target-dependent ceiling (solo)', async () => {
    for (const target of [3, 5, 10]) {
      expect(await randomBotBypass('solo', target, 40), `solo security-grade target ${target}`).toBeLessThan(0.05);
    }
    expect(await randomBotBypass('solo', 1, 40), 'solo low-friction target 1').toBeLessThan(0.45);
    expect(await randomBotBypass('solo', 2, 40), 'solo low-friction target 2').toBeLessThan(0.14);
  });

  it('a tracking player survives solo across the target range (floor 1 to ceiling 10)', async () => {
    for (const target of TARGETS) {
      let passed = 0;
      for (const seed of SEEDS) {
        const rec = await recordRun({ seed, config: { mode: 'solo', target, cpu_difficulty: 5 }, intent: trackBall, maxTicks: 6000 });
        if (rec.passed) passed += 1;
      }
      expect(passed, `solo target ${target}`).toBe(SEEDS.length);
    }
  });

  // Determinism: the solo verdict must not depend on Math.random (same asymmetry as
  // rival, see the note in the rival suite).
  it('solo verdict is invariant to the Math.random stream', async () => {
    const config = { mode: 'solo' as const, target: 3, cpu_difficulty: 5 };
    const seed: readonly [number, number, number, number] = [11, 22, 33, 44];
    let s = 0x9e3779b9;
    const streams: Array<() => number> = [() => 0, () => 0.9999999, () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; }];
    const real = Math.random;
    const out: string[] = [];
    try {
      for (const stream of streams) {
        Math.random = stream;
        const rec = await recordRun({ seed, config, intent: trackBall, maxTicks: 6000 });
        out.push(`${rec.actions.join('')}|${rec.score}|${rec.passed}|${rec.ticks}`);
      }
    } finally {
      Math.random = real;
    }
    expect(out[1]).toBe(out[0]);
    expect(out[2]).toBe(out[0]);
  });
});
