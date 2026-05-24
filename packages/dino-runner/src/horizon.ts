// Background scenery: the scrolling ground plus decorative parallax (clouds
// by day, moon + stars by night). Pure position logic over world units;
// game.ts maps the exposed state onto DOM nodes each frame. Decorative drift
// (clouds, moon, stars) freezes under prefers-reduced-motion; the ground
// keeps scrolling because that motion IS the gameplay.

import {
  WORLD_WIDTH,
  MS_PER_FRAME,
  CLOUD_SPEED_RATIO,
  STAR_SPEED_RATIO,
  MOON_SPEED_RATIO,
  MAX_CLOUDS,
} from './constants.js';

export interface ScenerySprite {
  x: number;
  y: number;
}

const CLOUD_WIDTH = 46;
// Must equal the moon's render-box width in game.ts (sizeEntity(moonEl,...));
// this is the off-screen wrap threshold, so a mismatch makes the moon pop back
// to the right edge while still partly visible. Repo pattern: box == wrap width.
const MOON_WIDTH = 40;
const STAR_WIDTH = 9;
const STAR_COUNT = 6;

export class Horizon {
  /** Ground scroll offset in (-WORLD_WIDTH, 0]; two tiles render at this and
   *  this + WORLD_WIDTH for a seamless loop. */
  groundX = 0;
  readonly clouds: ScenerySprite[] = [];
  readonly stars: ScenerySprite[] = [];
  moon: ScenerySprite;

  private nextCloudGap: number;

  constructor(private readonly rng: () => number = Math.random) {
    this.moon = { x: WORLD_WIDTH * 0.75, y: 24 };
    for (let i = 0; i < STAR_COUNT; i += 1) {
      this.stars.push({ x: this.rng() * WORLD_WIDTH, y: 8 + this.rng() * 40 });
    }
    this.nextCloudGap = this.randomCloudGap();
  }

  reset(): void {
    this.groundX = 0;
    this.clouds.length = 0;
    this.nextCloudGap = this.randomCloudGap();
  }

  update(dtMs: number, speed: number, reducedMotion: boolean): void {
    const frames = dtMs / MS_PER_FRAME;

    // Ground: always scrolls (this is the run).
    this.groundX -= speed * frames;
    while (this.groundX <= -WORLD_WIDTH) this.groundX += WORLD_WIDTH;

    if (reducedMotion) return;

    this.updateClouds(speed * CLOUD_SPEED_RATIO * frames);
    this.drift(this.stars, speed * STAR_SPEED_RATIO * frames, STAR_WIDTH);
    this.driftOne(this.moon, speed * MOON_SPEED_RATIO * frames, MOON_WIDTH);
  }

  private updateClouds(dx: number): void {
    for (const c of this.clouds) c.x -= dx;
    while (this.clouds.length > 0 && this.clouds[0]!.x + CLOUD_WIDTH < 0) this.clouds.shift();

    const last = this.clouds[this.clouds.length - 1];
    const room = !last || last.x < WORLD_WIDTH - this.nextCloudGap;
    if (this.clouds.length < MAX_CLOUDS && room) {
      this.clouds.push({ x: WORLD_WIDTH, y: 8 + this.rng() * 48 });
      this.nextCloudGap = this.randomCloudGap();
    }
  }

  /** Scroll a set of scenery sprites left, wrapping each to the right edge. */
  private drift(items: ScenerySprite[], dx: number, width: number): void {
    for (const it of items) this.driftOne(it, dx, width);
  }

  private driftOne(item: ScenerySprite, dx: number, width: number): void {
    item.x -= dx;
    if (item.x + width < 0) item.x = WORLD_WIDTH;
  }

  private randomCloudGap(): number {
    return 100 + this.rng() * 300;
  }
}
