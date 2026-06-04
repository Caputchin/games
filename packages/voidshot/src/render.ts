// OGL renderer. RENDER-ONLY: it draws the sim's state buffer and never feeds the
// sim, so its look (and the non-deterministic VFX) cannot affect the verdict.
//
// Real CC-BY low-poly models (vendored .glb, inlined - see model.ts) give the player
// gunship + enemy drones their multi-material silhouettes; a PBR-lite shader (three
// view-space lights + blinn specular + fresnel rim + emissive) lights them so they
// read as solid 3D craft, not flat chrome. A per-instance rim color signals the
// enemy type / player, set per-draw via a single shared program + onBeforeRender.
// A tilted 3/4 camera + gradient arena + starfield backdrop give depth and mood.
// Fully responsive: the canvas fills the container; the camera reframes any aspect.
// If a model ever fails to parse, a procedural fallback template keeps it playable.

import {
  Camera,
  Color,
  Cylinder,
  Mesh,
  Box,
  Mat4,
  Program,
  Renderer,
  Sphere,
  Torus,
  Transform,
  Vec3,
} from 'ogl';
import { ARENA_R, KIND_SPLITTER, KIND_WEAVER } from './constants.js';
import { enemyColor, hexToRgb, type RenderSkin } from './skin.js';
import type { Viewport } from './input.js';
import type { LiveState } from './wasm.js';
import { loadModelParts, partsBounds, type ModelPart } from './model.js';
import droneGlb from './assets/drone.glb';
import shipGlb from './assets/ship.glb';

const FOV = 45;
const ELEV = (57 * Math.PI) / 180; // camera elevation from the ground plane
const FIT = 1.2; // arena bounding radius (* ARENA_R) the camera must frame
const BOLT_POOL = 48;
const BURST_POOL = 24;
const BURST_LIFE = 0.4; // seconds
const PLAYER_TARGET_R = 1.6; // model bounding radius -> world units
const ENEMY_TARGET_R = 1.25;
const ASTEROID_HIGH_Y = 13; // spawn height, mirrors sim.rs ASTEROID_HIGH_Y
const ASTEROID_BLAST_R = 2.7; // warning-ring radius, mirrors sim.rs ASTEROID_BLAST_R
const ASTEROID_KIND = 3; // deaths kind code for the impact blast (mirrors sim.rs)
const POWERUP_KIND = 4; // deaths kind code for the pickup sparkle (mirrors sim.rs)
const ROCKET_KIND = 5; // deaths kind code for the rocket blast (mirrors sim.rs)
const LASER_RANGE = 20; // beam length, mirrors sim.rs LASER_RANGE
const WEAPON_LASER = 1; // weapon code (mirrors sim.rs Weapon::Laser)
// Powerup colors by kind: laser, split, rockets, heal, invuln.
const POWERUP_COLORS = ['#36f0ff', '#9d7bff', '#ff8a3c', '#5dff8a', '#ffd23d'];

const VERT = /* glsl */ `
  attribute vec3 position;
  attribute vec3 normal;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform mat3 normalMatrix;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

// PBR-lite: 3 view-space lights, blinn specular sharpened by 1-roughness and tinted
// by metalness, hemisphere ambient, emissive, and a fresnel rim in the instance's
// signal color. Enough sheen + shaping to read as a real 3D craft.
const FRAG_PBR = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform vec3 uEmissive;
  uniform float uMetal;
  uniform float uRough;
  uniform vec3 uRim;
  uniform float uRimAmt;
  varying vec3 vNormal;
  varying vec3 vViewPos;

  const vec3 L1 = vec3(0.35, 0.55, 0.75);   // key (upper front)
  const vec3 L2 = vec3(-0.6, 0.2, 0.3);     // fill (left)
  const vec3 L3 = vec3(0.1, -0.4, -0.7);    // back/under rim
  const vec3 C1 = vec3(1.0, 0.96, 0.9);
  const vec3 C2 = vec3(0.45, 0.6, 0.95);
  const vec3 C3 = vec3(0.9, 0.5, 0.7);

  float spec(vec3 n, vec3 l, vec3 v, float shin) {
    vec3 h = normalize(l + v);
    return pow(max(dot(n, h), 0.0), shin);
  }
  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(-vViewPos);
    float shin = mix(8.0, 90.0, 1.0 - uRough);
    float specK = mix(0.04, 1.0, uMetal);
    vec3 specTint = mix(vec3(1.0), uColor, uMetal);

    vec3 diff = C1 * max(dot(n, normalize(L1)), 0.0)
              + C2 * max(dot(n, normalize(L2)), 0.0) * 0.6
              + C3 * max(dot(n, normalize(L3)), 0.0) * 0.4;
    float s = spec(n, normalize(L1), v, shin) * 1.0
            + spec(n, normalize(L2), v, shin) * 0.5;

    // hemisphere ambient (sky cool / ground dark)
    float hemi = 0.5 + 0.5 * n.y;
    vec3 amb = mix(vec3(0.05, 0.06, 0.1), vec3(0.16, 0.2, 0.28), hemi);

    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    vec3 rim = uRim * fres * uRimAmt;

    vec3 col = uColor * (amb + diff) + specTint * s * specK + uEmissive + rim;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const FRAG_EMISSIVE = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uAlpha;
  void main() { gl_FragColor = vec4(uColor, uAlpha); }
`;

// Arena floor: radial gradient + soft edge fade, lit subtly by normal.
const FRAG_GROUND = /* glsl */ `
  precision highp float;
  uniform vec3 uInner;
  uniform vec3 uOuter;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main() {
    float r = clamp(length(vViewPos.xz) / ${(ARENA_R).toFixed(1)}, 0.0, 1.0);
    vec3 c = mix(uInner, uOuter, r);
    gl_FragColor = vec4(c, 1.0);
  }
`;

// Starfield backdrop on a large inverted sphere: vertical gradient + hashed stars.
const VERT_BG = /* glsl */ `
  attribute vec3 position;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  varying vec3 vP;
  void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const FRAG_BG = /* glsl */ `
  precision highp float;
  uniform vec3 uTop;
  uniform vec3 uBottom;
  varying vec3 vP;
  float hash(vec3 p){ p = fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  void main() {
    vec3 d = normalize(vP);
    vec3 grad = mix(uBottom, uTop, clamp(d.y*0.5+0.5, 0.0, 1.0));
    // small point stars: high-frequency cell, round falloff toward the cell center
    vec3 cell = floor(d * 240.0);
    float h = hash(cell);
    if (h > 0.985) {
      vec3 c = (cell + 0.5) / 240.0;
      float dist = length(normalize(c) - d) * 240.0;
      float dot = max(0.0, 1.0 - dist) * (0.5 + 0.5 * hash(cell + 3.0));
      grad += dot;
    }
    gl_FragColor = vec4(grad, 1.0);
  }
`;

interface PartMesh extends Mesh {
  __mat?: { color: Color; emissive: Color; metal: number; rough: number };
  __rim?: { color: Color; amt: number };
}

interface Instance {
  pivot: Transform;
  rim: { color: Color; amt: number };
}

interface Template {
  parts: ModelPart[];
  scale: number;
  center: Vec3;
}

interface BoltNode {
  group: Transform;
  mesh: Mesh;
  rocket: boolean;
}

interface AsteroidNode {
  group: Transform;
  rock: Transform;
  ring: { alpha: number };
}

interface PowerupNode {
  group: Transform;
  color: Color; // set per frame from the powerup's kind
}

interface Burst {
  group: Transform;
  prog: Program;
  active: boolean;
  life: number;
  scaleMul: number;
}

export class Renderer3D implements Viewport {
  private readonly renderer: Renderer;
  private readonly gl: Renderer['gl'];
  private readonly camera: Camera;
  private readonly scene: Transform;
  private readonly pbr: Program;
  private readonly emissive = new Map<string, Program>();

  private player: Instance | null = null;
  private playerThruster: Mesh | null = null;
  private readonly enemies: Instance[] = [];
  private enemyTemplate: Template | null = null;
  private readonly bolts: BoltNode[] = [];
  private readonly asteroids: AsteroidNode[] = [];
  private readonly powerups: PowerupNode[] = [];
  private readonly bursts: Burst[] = [];
  private readonly reticle: Transform;
  private beam: Mesh | null = null; // laser beam, shown while the laser weapon is up
  private invulnBubble: Mesh | null = null; // shield bubble while invulnerable
  private loaded = false;

  private spin = 0;
  private prevTime = 0;

  constructor(
    private readonly container: HTMLElement,
    private skin: RenderSkin,
  ) {
    const canvas = document.createElement('canvas');
    canvas.className = 'vs-canvas';
    container.appendChild(canvas);

    this.renderer = new Renderer({
      canvas,
      alpha: true,
      antialias: true,
      dpr: Math.min(2, globalThis.devicePixelRatio || 1),
    });
    this.gl = this.renderer.gl;
    const bg = hexToRgb(skin.background);
    this.gl.clearColor(bg[0], bg[1], bg[2], 1);

    this.camera = new Camera(this.gl, { fov: FOV, near: 0.1, far: 600 });
    this.scene = new Transform();

    this.pbr = new Program(this.gl, {
      vertex: VERT,
      fragment: FRAG_PBR,
      uniforms: {
        uColor: { value: new Color(0.8, 0.8, 0.8) },
        uEmissive: { value: new Color(0, 0, 0) },
        uMetal: { value: 0.2 },
        uRough: { value: 0.6 },
        uRim: { value: new Color(0.2, 0.9, 1) },
        uRimAmt: { value: 0.6 },
      },
    });

    this.buildBackdrop();
    this.buildGround();
    this.reticle = this.buildReticle();
    this.reticle.setParent(this.scene);
    for (let i = 0; i < BOLT_POOL; i += 1) this.bolts.push(this.buildBolt());
    for (let i = 0; i < BURST_POOL; i += 1) this.bursts.push(this.buildBurst());

    this.resize();
  }

  /** Whether the models have finished loading (driver waits before stepping). */
  isLoaded(): boolean {
    return this.loaded;
  }

  // --- model loading ---------------------------------------------------------
  async loadModels(): Promise<void> {
    let shipParts: ModelPart[];
    let droneParts: ModelPart[];
    try {
      [shipParts, droneParts] = await Promise.all([
        loadModelParts(this.gl, shipGlb),
        loadModelParts(this.gl, droneGlb),
      ]);
    } catch {
      shipParts = this.fallbackParts();
      droneParts = this.fallbackParts();
    }
    const shipTpl = this.makeTemplate(shipParts, PLAYER_TARGET_R);
    this.enemyTemplate = this.makeTemplate(droneParts, ENEMY_TARGET_R);

    this.player = this.buildInstance(shipTpl, hexToRgb(this.skin.player), hexToRgb(this.skin.player));
    this.player.pivot.visible = false;
    // thruster glow behind the gunship
    this.playerThruster = new Mesh(this.gl, {
      geometry: new Sphere(this.gl, { radius: 0.3, widthSegments: 12, heightSegments: 8 }),
      program: this.emissiveProg(this.skin.player, 0.5),
    });
    this.playerThruster.position.set(0, 0, 0.7);
    this.playerThruster.setParent(this.player.pivot);

    // Laser beam: a forward bar (the model faces -Z), shown while the laser is up.
    this.beam = new Mesh(this.gl, {
      geometry: new Box(this.gl, { width: 0.5, height: 0.35, depth: LASER_RANGE }),
      program: this.emissiveProg(this.skin.player, 0.55),
    });
    this.beam.position.set(0, 0.3, -LASER_RANGE / 2);
    this.beam.visible = false;
    this.beam.setParent(this.player.pivot);

    // Invulnerability bubble around the gunship.
    this.invulnBubble = new Mesh(this.gl, {
      geometry: new Sphere(this.gl, { radius: 1.7, widthSegments: 18, heightSegments: 14 }),
      program: this.emissiveProg('#9fe8ff', 0.12),
    });
    this.invulnBubble.visible = false;
    this.invulnBubble.setParent(this.player.pivot);

    this.ensureEnemies(8);
    this.loaded = true;
  }

  private makeTemplate(parts: ModelPart[], targetR: number): Template {
    const { center, radius } = partsBounds(parts);
    return { parts, scale: targetR / radius, center };
  }

  private fallbackParts(): ModelPart[] {
    // A simple lit craft if a model fails to parse: body + two fins.
    const mk = (geo: ModelPart['geometry'], color: [number, number, number]): ModelPart => ({
      geometry: geo,
      matrix: new Mat4(),
      color,
      emissive: [0, 0, 0],
      alpha: 1,
      metallic: 0.3,
      roughness: 0.5,
    });
    return [
      mk(new Box(this.gl, { width: 0.6, height: 0.4, depth: 1.4 }), [0.7, 0.75, 0.8]),
      mk(new Box(this.gl, { width: 1.4, height: 0.12, depth: 0.5 }), [0.5, 0.55, 0.62]),
    ];
  }

  private buildInstance(
    tpl: Template,
    rimColor: [number, number, number],
    recolor?: [number, number, number],
  ): Instance {
    const pivot = new Transform();
    pivot.setParent(this.scene);
    pivot.visible = false;

    // normalize: recenter (centerer) -> scale (root)
    const root = new Transform();
    root.scale.set(tpl.scale, tpl.scale, tpl.scale);
    root.setParent(pivot);
    const centerer = new Transform();
    centerer.position.set(-tpl.center.x, -tpl.center.y, -tpl.center.z);
    centerer.setParent(root);

    const rim = { color: new Color(rimColor[0], rimColor[1], rimColor[2]), amt: 0.6 };
    for (const part of tpl.parts) {
      const mesh = new Mesh(this.gl, { geometry: part.geometry, program: this.pbr }) as PartMesh;
      mesh.matrix.copy(part.matrix);
      mesh.matrixAutoUpdate = false;
      // Optional recolor: map each part to a single hue by its luminance, keeping
      // the model's light/dark structure (used to make the player unmistakably
      // its own color, distinct from the same-palette enemy drones).
      let col = part.color;
      if (recolor) {
        // Map each part to the tint by luminance, with a brightness FLOOR so even
        // the model's darkest parts stay clearly visible against the arena.
        const lum = 0.299 * col[0] + 0.587 * col[1] + 0.114 * col[2];
        const k = 0.4 + 0.6 * lum;
        col = [Math.min(1, k * recolor[0]), Math.min(1, k * recolor[1]), Math.min(1, k * recolor[2])];
      }
      mesh.__mat = {
        color: new Color(col[0], col[1], col[2]),
        emissive: new Color(part.emissive[0], part.emissive[1], part.emissive[2]),
        metal: part.metallic,
        rough: part.roughness,
      };
      mesh.__rim = rim;
      mesh.onBeforeRender(() => this.applyPbr(mesh));
      mesh.setParent(centerer);
    }
    return { pivot, rim };
  }

  /** Push a PartMesh's stored material + its instance rim into the shared PBR
   *  program just before that mesh draws (one program, per-mesh uniforms). */
  private applyPbr(mesh: PartMesh): void {
    const u = this.pbr.uniforms;
    const m = mesh.__mat!;
    (u.uColor.value as Color).copy(m.color);
    (u.uEmissive.value as Color).copy(m.emissive);
    u.uMetal.value = m.metal;
    u.uRough.value = m.rough;
    (u.uRim.value as Color).copy(mesh.__rim!.color);
    u.uRimAmt.value = mesh.__rim!.amt;
  }

  private buildAsteroid(): AsteroidNode {
    const group = new Transform();
    group.visible = false;
    group.setParent(this.scene);

    // faceted rock lit by the PBR shader
    const rock = new Transform();
    rock.setParent(group);
    const rockMesh = new Mesh(this.gl, {
      geometry: new Sphere(this.gl, { radius: 0.85, widthSegments: 6, heightSegments: 5 }),
      program: this.pbr,
    }) as PartMesh;
    rockMesh.__mat = {
      color: new Color(0.42, 0.4, 0.46),
      emissive: new Color(0.04, 0.02, 0.0),
      metal: 0.0,
      rough: 0.95,
    };
    rockMesh.__rim = { color: new Color(1.0, 0.5, 0.2), amt: 0.5 };
    rockMesh.onBeforeRender(() => this.applyPbr(rockMesh));
    rockMesh.setParent(rock);

    // warning ring on the plane (the blast zone); alpha grows as the rock nears
    const ringState = { alpha: 0 };
    const ring = new Mesh(this.gl, {
      geometry: new Torus(this.gl, {
        radius: ASTEROID_BLAST_R,
        tube: 0.14,
        radialSegments: 8,
        tubularSegments: 56,
      }),
      program: this.emissiveProg('#ff7a2a', 1),
    });
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0.04, 0);
    ring.onBeforeRender(() => {
      ring.program.uniforms.uAlpha.value = ringState.alpha;
    });
    ring.setParent(group);
    return { group, rock, ring: ringState };
  }

  private ensureAsteroids(n: number): void {
    while (this.asteroids.length < n) this.asteroids.push(this.buildAsteroid());
  }

  private ensureEnemies(n: number): void {
    if (!this.enemyTemplate) return;
    while (this.enemies.length < n) {
      // Recolor the drone hull to the skin's grey `drone` color (visible on the
      // arena); the per-type glow/rim color is set per frame in render().
      const inst = this.buildInstance(
        this.enemyTemplate,
        hexToRgb(this.skin.chaser),
        hexToRgb(this.skin.drone),
      );
      inst.pivot.visible = false;
      // subtle colored aura per drone (small + faint so the model detail shows)
      const halo = new Mesh(this.gl, {
        geometry: new Sphere(this.gl, { radius: 0.5, widthSegments: 14, heightSegments: 10 }),
        program: this.emissiveProg('#ffffff', 0.06),
      });
      (halo as PartMesh).__rim = inst.rim;
      halo.onBeforeRender(() => {
        (halo.program.uniforms.uColor.value as Color).copy(inst.rim.color);
      });
      halo.setParent(inst.pivot);
      this.enemies.push(inst);
    }
  }

  // --- programs / primitives -------------------------------------------------
  private emissiveProg(hex: string, alpha: number): Program {
    const key = `${hex}@${alpha}`;
    let p = this.emissive.get(key);
    if (!p) {
      const [r, g, b] = hexToRgb(hex);
      p = new Program(this.gl, {
        vertex: VERT,
        fragment: FRAG_EMISSIVE,
        uniforms: { uColor: { value: new Color(r, g, b) }, uAlpha: { value: alpha } },
        transparent: true,
        depthWrite: false,
        cullFace: false,
      });
      p.setBlendFunc(this.gl.SRC_ALPHA, this.gl.ONE);
      this.emissive.set(key, p);
    }
    return p;
  }

  private buildBackdrop(): void {
    const sky = new Mesh(this.gl, {
      geometry: new Sphere(this.gl, { radius: 220, widthSegments: 32, heightSegments: 24 }),
      program: new Program(this.gl, {
        vertex: VERT_BG,
        fragment: FRAG_BG,
        uniforms: {
          uTop: { value: new Color(...hexToRgb(this.skin.background)) },
          uBottom: { value: new Color(...hexToRgb(shade(this.skin.background, 1.4))) },
        },
        cullFace: false,
        depthWrite: false,
      }),
    });
    sky.setParent(this.scene);
  }

  private buildGround(): void {
    const disc = new Cylinder(this.gl, {
      radiusTop: ARENA_R,
      radiusBottom: ARENA_R,
      height: 0.2,
      radialSegments: 90,
    });
    const floor = new Mesh(this.gl, {
      geometry: disc,
      program: new Program(this.gl, {
        vertex: VERT,
        fragment: FRAG_GROUND,
        uniforms: {
          uInner: { value: new Color(...hexToRgb(shade(this.skin.arena, 0.55))) },
          uOuter: { value: new Color(...hexToRgb(this.skin.arena)) },
        },
      }),
    });
    floor.position.set(0, -0.12, 0);
    floor.setParent(this.scene);

    for (const [r, a] of [
      [ARENA_R, 0.8],
      [ARENA_R * 0.66, 0.22],
      [ARENA_R * 0.33, 0.16],
    ] as const) {
      const ring = new Torus(this.gl, {
        radius: r,
        tube: r > ARENA_R - 0.01 ? 0.13 : 0.05,
        radialSegments: 8,
        tubularSegments: 130,
      });
      const m = new Mesh(this.gl, { geometry: ring, program: this.emissiveProg(this.skin.grid, a) });
      m.rotation.x = Math.PI / 2;
      m.position.set(0, 0.01, 0);
      m.setParent(this.scene);
    }
  }

  private buildBolt(): BoltNode {
    const group = new Transform();
    group.visible = false;
    group.setParent(this.scene);
    const mesh = new Mesh(this.gl, {
      geometry: new Box(this.gl, { width: 0.14, height: 0.14, depth: 1.0 }),
      program: this.emissiveProg(this.skin.accent, 0.95),
    });
    mesh.setParent(group);
    const node: BoltNode = { group, mesh, rocket: false };
    const accent = new Color(...hexToRgb(this.skin.accent));
    const rocketCol = new Color(...hexToRgb('#ff8a3c'));
    mesh.onBeforeRender(() => {
      (mesh.program.uniforms.uColor.value as Color).copy(node.rocket ? rocketCol : accent);
    });
    return node;
  }

  private buildPowerup(): PowerupNode {
    const group = new Transform();
    group.visible = false;
    group.setParent(this.scene);
    const color = new Color(1, 1, 1);
    const ring = new Mesh(this.gl, {
      geometry: new Torus(this.gl, { radius: 0.5, tube: 0.11, radialSegments: 10, tubularSegments: 28 }),
      program: this.emissiveProg('#ffffff', 0.9),
    });
    ring.onBeforeRender(() => {
      (ring.program.uniforms.uColor.value as Color).copy(color);
    });
    ring.setParent(group);
    const core = new Mesh(this.gl, {
      geometry: new Sphere(this.gl, { radius: 0.24, widthSegments: 12, heightSegments: 9 }),
      program: this.emissiveProg('#ffffff', 0.95),
    });
    core.onBeforeRender(() => {
      (core.program.uniforms.uColor.value as Color).copy(color);
    });
    core.setParent(group);
    return { group, color };
  }

  private ensurePowerups(n: number): void {
    while (this.powerups.length < n) this.powerups.push(this.buildPowerup());
  }

  private buildReticle(): Transform {
    const group = new Transform();
    const ring = new Mesh(this.gl, {
      geometry: new Torus(this.gl, { radius: 0.55, tube: 0.08, radialSegments: 8, tubularSegments: 36 }),
      program: this.emissiveProg(this.skin.accent, 0.7),
    });
    ring.rotation.x = Math.PI / 2;
    ring.setParent(group);
    return group;
  }

  private buildBurst(): Burst {
    const group = new Transform();
    group.visible = false;
    group.setParent(this.scene);
    const own = new Program(this.gl, {
      vertex: VERT,
      fragment: FRAG_EMISSIVE,
      uniforms: { uColor: { value: new Color(1, 1, 1) }, uAlpha: { value: 1 } },
      transparent: true,
      depthWrite: false,
      cullFace: false,
    });
    own.setBlendFunc(this.gl.SRC_ALPHA, this.gl.ONE);
    const shell = new Mesh(this.gl, {
      geometry: new Sphere(this.gl, { radius: 0.5, widthSegments: 14, heightSegments: 10 }),
      program: own,
    });
    shell.setParent(group);
    return { group, prog: own, active: false, life: 0, scaleMul: 1 };
  }

  setSkin(skin: RenderSkin): void {
    this.skin = skin;
    const bg = hexToRgb(skin.background);
    this.gl.clearColor(bg[0], bg[1], bg[2], 1);
  }

  // --- Viewport: screen -> arena-plane world coordinates ---------------------
  toWorld(clientX: number, clientY: number): { x: number; z: number } {
    const rect = this.gl.canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((clientY - rect.top) / rect.height) * 2 - 1);
    const near = new Vec3(nx, ny, -1);
    const far = new Vec3(nx, ny, 1);
    this.camera.unproject(near);
    this.camera.unproject(far);
    const dy = far.y - near.y;
    const t = Math.abs(dy) > 1e-6 ? -near.y / dy : 0;
    return { x: near.x + (far.x - near.x) * t, z: near.z + (far.z - near.z) * t };
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h);
    const aspect = w / h;
    this.camera.perspective({ aspect });
    const halfFov = (FOV * Math.PI) / 180 / 2;
    let dist = (ARENA_R * FIT) / Math.sin(halfFov);
    if (aspect < 1) dist /= aspect;
    this.camera.position.set(0, dist * Math.sin(ELEV), dist * Math.cos(ELEV));
    this.camera.lookAt([0, 0, 0]);
    this.camera.updateMatrixWorld();
  }

  render(s: LiveState, aim: { x: number; z: number }, timeMs: number): void {
    const dt = this.prevTime ? Math.min(0.05, (timeMs - this.prevTime) / 1000) : 0;
    this.prevTime = timeMs;
    this.spin += dt;

    if (this.player) {
      this.player.pivot.position.set(s.px, 0, s.pz);
      this.player.pivot.rotation.y = yaw(s.fx, s.fz);
      this.player.pivot.visible = true;
      this.player.rim.amt = 0.7 + 0.3 * Math.sin(timeMs * 0.006);
      if (this.playerThruster) {
        const p = 0.6 + 0.4 * Math.sin(timeMs * 0.02);
        this.playerThruster.scale.set(p, p, p * 1.6);
      }
    }

    this.reticle.position.set(aim.x, 0.06, aim.z);
    this.reticle.rotation.y += dt * 1.5;
    this.reticle.visible = s.phase === 0;

    this.ensureEnemies(s.enemies.length);
    for (let i = 0; i < this.enemies.length; i += 1) {
      const inst = this.enemies[i]!;
      const e = s.enemies[i];
      if (!e) {
        if (inst.pivot.visible) inst.pivot.visible = false;
        continue;
      }
      inst.pivot.visible = true;
      inst.pivot.position.set(e.x, 0, e.z);
      inst.pivot.rotation.y = yaw(s.px - e.x, s.pz - e.z) + Math.sin(this.spin * 2 + i) * 0.08;
      const [r, g, b] = hexToRgb(enemyColor(this.skin, e.kind));
      inst.rim.color.set(r, g, b);
      inst.rim.amt = e.kind === KIND_WEAVER ? 0.9 : e.kind === KIND_SPLITTER ? 0.8 : 0.65;
    }

    for (let i = 0; i < BOLT_POOL; i += 1) {
      const node = this.bolts[i]!;
      const b = s.bolts[i];
      if (!b) {
        if (node.group.visible) node.group.visible = false;
        continue;
      }
      node.group.visible = true;
      node.group.position.set(b.x, 0.05, b.z);
      node.group.rotation.y = yaw(b.dx, b.dz);
      node.rocket = b.rocket;
      const bs = b.rocket ? 1.8 : 1;
      node.mesh.scale.set(bs, bs, b.rocket ? 1.5 : 1);
    }

    // Powerups: bobbing, spinning, color-coded by kind.
    this.ensurePowerups(s.powerups.length);
    for (let i = 0; i < this.powerups.length; i += 1) {
      const node = this.powerups[i]!;
      const p = s.powerups[i];
      if (!p) {
        if (node.group.visible) node.group.visible = false;
        continue;
      }
      node.group.visible = true;
      node.group.position.set(p.x, 0.7 + Math.sin(timeMs * 0.004 + i) * 0.18, p.z);
      node.group.rotation.y += dt * 2.2;
      node.color.set(...hexToRgb(POWERUP_COLORS[p.kind] ?? '#ffffff'));
    }

    // Laser beam + invuln bubble track the active weapon / shield state.
    if (this.beam) {
      this.beam.visible = s.weapon === WEAPON_LASER;
      if (this.beam.visible) {
        const w = 0.8 + 0.4 * Math.sin(timeMs * 0.03);
        this.beam.scale.set(w, w, 1);
      }
    }
    if (this.invulnBubble) {
      this.invulnBubble.visible = s.invulnTicksLeft > 0;
      if (this.invulnBubble.visible) {
        const p = 1 + 0.06 * Math.sin(timeMs * 0.01);
        this.invulnBubble.scale.set(p, p, p);
      }
    }

    // Asteroids: tumbling rock descending + a warning ring that intensifies as it nears.
    this.ensureAsteroids(s.asteroids.length);
    for (let i = 0; i < this.asteroids.length; i += 1) {
      const node = this.asteroids[i]!;
      const a = s.asteroids[i];
      if (!a) {
        if (node.group.visible) node.group.visible = false;
        continue;
      }
      node.group.visible = true;
      node.group.position.set(a.x, 0, a.z);
      node.rock.position.y = a.y + 0.6;
      node.rock.rotation.x += dt * 2.2;
      node.rock.rotation.y += dt * 1.5;
      // warning ring visible from the spawn (min floor) and brightening to impact
      node.ring.alpha = Math.min(0.9, 0.35 + 0.55 * (1 - a.y / ASTEROID_HIGH_Y));
    }

    for (const d of s.deaths) {
      if (d.kind === ASTEROID_KIND) this.spawnBurst(d.x, d.z, '#ff7a2a', 3.6);
      else if (d.kind === ROCKET_KIND) this.spawnBurst(d.x, d.z, '#ff8a3c', 3.0);
      else if (d.kind === POWERUP_KIND) this.spawnBurst(d.x, d.z, '#ffffff', 1.6);
      else this.spawnBurst(d.x, d.z, enemyColor(this.skin, d.kind));
    }
    this.updateBursts(dt);

    this.renderer.render({ scene: this.scene, camera: this.camera });
  }

  private spawnBurst(x: number, z: number, hex: string, scaleMul = 1): void {
    const b = this.bursts.find((q) => !q.active);
    if (!b) return;
    (b.prog.uniforms.uColor.value as Color).set(...hexToRgb(hex));
    b.prog.uniforms.uAlpha.value = 1;
    b.group.position.set(x, 0.2, z);
    b.group.scale.set(0.4, 0.4, 0.4);
    b.group.visible = true;
    b.active = true;
    b.life = 0;
    b.scaleMul = scaleMul;
  }

  private updateBursts(dt: number): void {
    for (const b of this.bursts) {
      if (!b.active) continue;
      b.life += dt;
      const t = b.life / BURST_LIFE;
      if (t >= 1) {
        b.active = false;
        b.group.visible = false;
        continue;
      }
      const sc = (0.4 + t * 2.4) * b.scaleMul;
      b.group.scale.set(sc, sc, sc);
      b.prog.uniforms.uAlpha.value = (1 - t) * 0.85;
    }
  }

  dispose(): void {
    const ext = this.gl.getExtension('WEBGL_lose_context');
    ext?.loseContext();
    this.gl.canvas.remove();
  }
}

/** Y rotation so a -Z-facing model points along (dx, dz). */
function yaw(dx: number, dz: number): number {
  if (dx * dx + dz * dz < 1e-8) return 0;
  return Math.atan2(-dx, -dz);
}

/** Darken (>1) or lighten (<1) a hex color by a factor, for gradients. */
function shade(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (v: number): string =>
    Math.round(Math.max(0, Math.min(255, (v / factor) * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${f(r)}${f(g)}${f(b)}`;
}
