// Obstacle definitions + spawner, ported from the Chrome dino. Three types:
// two ground cacti (which can clump 1-3 wide once the run is fast enough) and
// a flying bird that appears only past a speed gate and animates its wings.
// All collision boxes are the original's verbatim (see collision.ts for the
// box model). Spawning is pure logic over world units with an injectable RNG
// so the spacing / type-selection rules are unit-testable.

import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  BOTTOM_PAD,
  MS_PER_FRAME,
  ANIM_MS,
  MAX_OBSTACLE_LENGTH,
  MAX_OBSTACLE_DUPLICATION,
} from './constants.js';
import type { Box } from './collision.js';
import type { SpriteId } from './sprites.js';
import type { DinoConfig } from './config.js';

export type ObstacleTypeId = 'cactus-small' | 'cactus-large' | 'bird';

interface ObstacleType {
  id: ObstacleTypeId;
  width: number;
  height: number;
  /** Single ground Y, or a set of flight altitudes for the bird. */
  yPos: number | readonly number[];
  boxes: readonly Box[];
  minGap: number;
  /** Run speed below which this type never spawns. */
  minSpeed: number;
  /** Cacti may clump; birds never do. */
  groupable: boolean;
  /** Speed above which clumping is allowed (groupable types only). */
  groupSpeed: number;
}

const GROUND_BASELINE = WORLD_HEIGHT - BOTTOM_PAD; // 140

export const OBSTACLE_TYPES: Record<ObstacleTypeId, ObstacleType> = {
  'cactus-small': {
    id: 'cactus-small',
    width: 17,
    height: 35,
    yPos: 105,
    minGap: 120,
    minSpeed: 0,
    groupable: true,
    groupSpeed: 4,
    boxes: [
      { x: 0, y: 7, width: 5, height: 27 },
      { x: 4, y: 0, width: 6, height: 34 },
      { x: 10, y: 4, width: 7, height: 14 },
    ],
  },
  'cactus-large': {
    id: 'cactus-large',
    width: 25,
    height: 50,
    yPos: 90,
    minGap: 120,
    minSpeed: 0,
    groupable: true,
    groupSpeed: 7,
    boxes: [
      { x: 0, y: 12, width: 7, height: 38 },
      { x: 8, y: 0, width: 7, height: 49 },
      { x: 13, y: 10, width: 10, height: 38 },
    ],
  },
  bird: {
    id: 'bird',
    width: 46,
    height: 40,
    yPos: [100, 75, 50],
    minGap: 150,
    minSpeed: 8.5,
    groupable: false,
    groupSpeed: Infinity,
    boxes: [
      { x: 15, y: 15, width: 16, height: 5 },
      { x: 18, y: 21, width: 24, height: 6 },
      { x: 2, y: 14, width: 4, height: 3 },
      { x: 6, y: 10, width: 4, height: 7 },
      { x: 10, y: 8, width: 6, height: 9 },
    ],
  },
};

/** Bird drifts slightly faster than the ground speed, like the original. */
const BIRD_SPEED_OFFSET = 0.8;

export interface ActiveObstacle {
  typeId: ObstacleTypeId;
  /** World X of the obstacle's left edge. */
  x: number;
  /** World Y of the obstacle's top edge (its collision origin). */
  y: number;
  /** Total width including any clump. */
  width: number;
  height: number;
  /** Clump count (1 for birds + single cacti). */
  size: number;
  /** Collision boxes in obstacle space, clump-expanded. */
  boxes: Box[];
  /** Trailing empty space before the next obstacle may spawn. */
  gap: number;
  /** Extra per-obstacle speed (birds only). */
  speedOffset: number;
  /** Bird wing-flap frame index + its timer. */
  frame: number;
  animTimer: number;
}

/** One render tile: a sprite drawn at `dx` from the obstacle's left edge. */
export interface ObstacleTile {
  sprite: SpriteId;
  dx: number;
  width: number;
  height: number;
}

/** The sprite tiles to draw for an obstacle (clump-expanded; bird picks its
 *  current wing frame). */
export function obstacleTiles(o: ActiveObstacle): ObstacleTile[] {
  if (o.typeId === 'bird') {
    return [
      { sprite: o.frame === 0 ? 'bird-1' : 'bird-2', dx: 0, width: o.width, height: o.height },
    ];
  }
  const type = OBSTACLE_TYPES[o.typeId];
  const sprite: SpriteId = o.typeId;
  const tiles: ObstacleTile[] = [];
  for (let k = 0; k < o.size; k += 1) {
    tiles.push({ sprite, dx: k * type.width, width: type.width, height: o.height });
  }
  return tiles;
}

function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export class ObstacleManager {
  readonly obstacles: ActiveObstacle[] = [];

  constructor(private readonly rng: () => number = Math.random) {}

  reset(): void {
    this.obstacles.length = 0;
  }

  /** Advance every obstacle, recycle off-screen ones, and spawn new ones to
   *  keep the right edge fed. Returns nothing; read `this.obstacles` for
   *  collision + rendering. */
  update(dtMs: number, speed: number, cfg: DinoConfig): void {
    const frames = dtMs / MS_PER_FRAME;

    for (const o of this.obstacles) {
      o.x -= (speed + o.speedOffset) * frames;
      if (o.typeId === 'bird') {
        o.animTimer += dtMs;
        if (o.animTimer >= ANIM_MS.bird) {
          o.animTimer = 0;
          o.frame ^= 1;
        }
      }
    }

    // Drop anything fully past the left edge.
    while (this.obstacles.length > 0 && this.obstacles[0]!.x + this.obstacles[0]!.width < 0) {
      this.obstacles.shift();
    }

    const last = this.obstacles[this.obstacles.length - 1];
    const needsSpawn = !last || last.x + last.width + last.gap <= WORLD_WIDTH;
    if (needsSpawn) this.spawn(speed, cfg);
  }

  private spawn(speed: number, cfg: DinoConfig): void {
    const type = this.pickType(speed, cfg);
    if (!type) return;

    const size =
      type.groupable && speed > type.groupSpeed ? randInt(this.rng, 1, MAX_OBSTACLE_LENGTH) : 1;
    const width = type.width * size;

    let y: number;
    let speedOffset = 0;
    if (type.id === 'bird') {
      const heights = type.yPos as readonly number[];
      y = heights[randInt(this.rng, 0, heights.length - 1)]!;
      speedOffset = this.rng() > 0.5 ? BIRD_SPEED_OFFSET : -BIRD_SPEED_OFFSET;
    } else {
      y = type.yPos as number;
    }

    const boxes: Box[] = [];
    for (let k = 0; k < size; k += 1) {
      for (const b of type.boxes) {
        boxes.push({ x: b.x + k * type.width, y: b.y, width: b.width, height: b.height });
      }
    }

    this.obstacles.push({
      typeId: type.id,
      x: WORLD_WIDTH,
      y,
      width,
      height: type.height,
      size,
      boxes,
      gap: this.computeGap(type, width, speed, cfg.gapCoefficient),
      speedOffset,
      frame: 0,
      animTimer: 0,
    });
  }

  /** Choose a spawnable type at this speed, honoring the bird gate + the
   *  back-to-back duplication cap. Returns null if nothing is eligible. */
  private pickType(speed: number, cfg: DinoConfig): ObstacleType | null {
    const candidates: ObstacleType[] = [OBSTACLE_TYPES['cactus-small'], OBSTACLE_TYPES['cactus-large']];
    if (cfg.birdsEnabled && speed >= cfg.birdMinSpeed) candidates.push(OBSTACLE_TYPES.bird);

    const eligible = candidates.filter((t) => speed >= t.minSpeed);
    const allowed = eligible.filter((t) => !this.wouldOverduplicate(t.id));
    const pool = allowed.length > 0 ? allowed : eligible;
    if (pool.length === 0) return null;
    return pool[randInt(this.rng, 0, pool.length - 1)]!;
  }

  /** True if the last MAX_OBSTACLE_DUPLICATION obstacles are all this type. */
  private wouldOverduplicate(id: ObstacleTypeId): boolean {
    if (this.obstacles.length < MAX_OBSTACLE_DUPLICATION) return false;
    const tail = this.obstacles.slice(-MAX_OBSTACLE_DUPLICATION);
    return tail.every((o) => o.typeId === id);
  }

  private computeGap(type: ObstacleType, width: number, speed: number, gapCoefficient: number): number {
    // Wider obstacles + faster runs need more trailing room to stay fair.
    const minGap = Math.round((width * speed) / 6 + type.minGap * gapCoefficient);
    const maxGap = Math.round(minGap * 1.5);
    return randInt(this.rng, minGap, maxGap);
  }
}

/** Exported for tests / sanity: the world baseline the ground obstacles sit
 *  on (their yPos + height equals this). */
export const OBSTACLE_BASELINE = GROUND_BASELINE;
