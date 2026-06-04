// OGL renderer. RENDER-ONLY: it draws the sim's state buffer and never feeds the
// sim, so its look (and the non-deterministic VFX: rotor spin, explosions) cannot
// affect the verdict.
//
// A tilted 3/4 perspective camera gives real depth (foreshortening, a lit swarm,
// glow) while a cursor->arena-plane ray (Camera.unproject) keeps steering exact.
// Geometry is procedural: enemies are quad-drones (hub + four booms + spinning
// rotors), the player is an arrow gunship oriented to its facing, bolts are
// forward tracers, and the reticle marks where the stream will sweep. Fully
// responsive: the canvas fills the container on both axes and the camera reframes
// the arena for any aspect (portrait or landscape).

import {
  Box,
  Camera,
  Color,
  Cylinder,
  Mesh,
  Program,
  Renderer,
  Sphere,
  Torus,
  Transform,
  Vec3,
} from 'ogl';
import { ARENA_R, KIND_WEAVER } from './constants.js';
import { enemyColor, hexToRgb, type RenderSkin } from './skin.js';
import type { Viewport } from './input.js';
import type { LiveState } from './wasm.js';

const FOV = 45;
const ELEV = (61 * Math.PI) / 180; // camera elevation from the ground plane
const FIT = 1.18; // arena bounding radius (* ARENA_R) the camera must frame
const ENEMY_POOL = 64;
const BOLT_POOL = 48;
const BURST_POOL = 24;
const BURST_LIFE = 0.36; // seconds

const VERT = /* glsl */ `
  attribute vec3 position;
  attribute vec3 normal;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform mat3 normalMatrix;
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Lit: view-space lambert + ambient + a camera-facing rim, so rotating drones read
// as solid 3D bodies.
const FRAG_LIT = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  varying vec3 vNormal;
  void main() {
    vec3 n = normalize(vNormal);
    vec3 L = normalize(vec3(0.35, 0.65, 0.7));
    float diff = max(dot(n, L), 0.0);
    float rim = pow(1.0 - max(n.z, 0.0), 2.5) * 0.5;
    vec3 c = uColor * (0.32 + 0.8 * diff) + uColor * rim;
    gl_FragColor = vec4(c, 1.0);
  }
`;

// Emissive: flat bright color at a fixed alpha (halos, bolts, reticle, bursts).
const FRAG_EMISSIVE = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uAlpha;
  void main() { gl_FragColor = vec4(uColor, uAlpha); }
`;

interface EnemyNode {
  group: Transform;
  body: Mesh;
  arms: Mesh[];
  rotors: Transform[];
  halo: Mesh;
}

interface BoltNode {
  group: Transform;
  mesh: Mesh;
}

interface Burst {
  group: Transform;
  prog: Program;
  active: boolean;
  life: number;
}

export class Renderer3D implements Viewport {
  private readonly renderer: Renderer;
  private readonly gl: Renderer['gl'];
  private readonly camera: Camera;
  private readonly scene: Transform;

  private readonly player: Transform;
  private readonly enemies: EnemyNode[] = [];
  private readonly bolts: BoltNode[] = [];
  private readonly bursts: Burst[] = [];
  private readonly reticle: Transform;

  // Cached lit programs keyed by hex (per drone color); emissive cache likewise.
  private readonly lit = new Map<string, Program>();
  private readonly emissive = new Map<string, Program>();

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

    this.camera = new Camera(this.gl, { fov: FOV, near: 0.1, far: 400 });
    this.scene = new Transform();

    this.buildGround();
    this.player = this.buildPlayer();
    this.player.setParent(this.scene);
    for (let i = 0; i < ENEMY_POOL; i += 1) this.enemies.push(this.buildEnemy());
    for (let i = 0; i < BOLT_POOL; i += 1) this.bolts.push(this.buildBolt());
    for (let i = 0; i < BURST_POOL; i += 1) this.bursts.push(this.buildBurst());
    this.reticle = this.buildReticle();
    this.reticle.setParent(this.scene);

    this.resize();
  }

  // --- program caches --------------------------------------------------------
  private litProg(hex: string): Program {
    let p = this.lit.get(hex);
    if (!p) {
      const [r, g, b] = hexToRgb(hex);
      p = new Program(this.gl, {
        vertex: VERT,
        fragment: FRAG_LIT,
        uniforms: { uColor: { value: new Color(r, g, b) } },
      });
      this.lit.set(hex, p);
    }
    return p;
  }

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
      p.setBlendFunc(this.gl.SRC_ALPHA, this.gl.ONE); // additive glow
      this.emissive.set(key, p);
    }
    return p;
  }

  // --- geometry --------------------------------------------------------------
  private buildGround(): void {
    const disc = new Cylinder(this.gl, {
      radiusTop: ARENA_R,
      radiusBottom: ARENA_R,
      height: 0.2,
      radialSegments: 80,
    });
    const floor = new Mesh(this.gl, { geometry: disc, program: this.litProg(this.skin.arena) });
    floor.position.set(0, -0.12, 0);
    floor.setParent(this.scene);

    // Boundary rim + two inner rings as depth cues (emissive, flat on the plane).
    for (const [r, a] of [
      [ARENA_R, 0.7],
      [ARENA_R * 0.66, 0.18],
      [ARENA_R * 0.33, 0.14],
    ] as const) {
      const ring = new Torus(this.gl, {
        radius: r,
        tube: r > ARENA_R - 0.01 ? 0.12 : 0.05,
        radialSegments: 8,
        tubularSegments: 120,
      });
      const m = new Mesh(this.gl, { geometry: ring, program: this.emissiveProg(this.skin.grid, a) });
      m.rotation.x = Math.PI / 2; // lay the ring flat in XZ
      m.position.set(0, 0.01, 0);
      m.setParent(this.scene);
    }
  }

  /** Grow the enemy node pool to at least `n` (default play stays under the
   *  initial pool; only an extreme config triggers a one-time growth). */
  private ensureEnemies(n: number): void {
    while (this.enemies.length < n) this.enemies.push(this.buildEnemy());
  }

  private buildEnemy(): EnemyNode {
    const group = new Transform();
    group.visible = false;
    group.setParent(this.scene);

    const hub = new Box(this.gl, { width: 0.46, height: 0.2, depth: 0.46 });
    const body = new Mesh(this.gl, { geometry: hub, program: this.litProg(this.skin.chaser) });
    body.setParent(group);

    const armGeo = new Box(this.gl, { width: 0.62, height: 0.07, depth: 0.12 });
    const rotorGeo = new Cylinder(this.gl, {
      radiusTop: 0.2,
      radiusBottom: 0.2,
      height: 0.04,
      radialSegments: 14,
    });
    const arms: Mesh[] = [];
    const rotors: Transform[] = [];
    for (let k = 0; k < 4; k += 1) {
      const yaw = (k * Math.PI) / 2 + Math.PI / 4;
      const arm = new Mesh(this.gl, { geometry: armGeo, program: this.litProg(this.skin.chaser) });
      arm.rotation.y = yaw;
      arm.setParent(group);
      arms.push(arm);
      // rotor sits at the boom tip and spins about Y
      const tip = new Transform();
      tip.position.set(Math.cos(yaw) * 0.32, 0.06, Math.sin(yaw) * 0.32);
      tip.setParent(group);
      const rotor = new Mesh(this.gl, {
        geometry: rotorGeo,
        program: this.litProg(this.skin.chaser),
      });
      rotor.setParent(tip);
      rotors.push(tip);
    }

    const halo = new Mesh(this.gl, {
      geometry: new Sphere(this.gl, { radius: 0.72, widthSegments: 16, heightSegments: 12 }),
      program: this.emissiveProg(this.skin.chaser, 0.16),
    });
    halo.setParent(group);

    return { group, body, arms, rotors, halo };
  }

  private buildPlayer(): Transform {
    const group = new Transform();
    const lit = this.litProg(this.skin.player);

    // Arrow fuselage (nose toward -Z), two swept wings, a thruster pod.
    const fuse = new Mesh(this.gl, {
      geometry: new Box(this.gl, { width: 0.28, height: 0.16, depth: 0.8 }),
      program: lit,
    });
    fuse.setParent(group);
    const nose = new Mesh(this.gl, {
      geometry: new Cylinder(this.gl, {
        radiusTop: 0.0,
        radiusBottom: 0.16,
        height: 0.4,
        radialSegments: 4,
      }),
      program: lit,
    });
    nose.rotation.x = -Math.PI / 2; // point the cone along -Z
    nose.position.set(0, 0, -0.5);
    nose.setParent(group);
    for (const s of [-1, 1]) {
      const wing = new Mesh(this.gl, {
        geometry: new Box(this.gl, { width: 0.5, height: 0.06, depth: 0.34 }),
        program: lit,
      });
      wing.position.set(s * 0.36, 0, 0.12);
      wing.rotation.y = s * 0.5;
      wing.setParent(group);
    }
    const halo = new Mesh(this.gl, {
      geometry: new Sphere(this.gl, { radius: 0.8, widthSegments: 16, heightSegments: 12 }),
      program: this.emissiveProg(this.skin.player, 0.18),
    });
    halo.setParent(group);
    return group;
  }

  private buildBolt(): BoltNode {
    const group = new Transform();
    group.visible = false;
    group.setParent(this.scene);
    const mesh = new Mesh(this.gl, {
      geometry: new Box(this.gl, { width: 0.12, height: 0.12, depth: 0.9 }),
      program: this.emissiveProg(this.skin.accent, 0.95),
    });
    mesh.setParent(group);
    return { group, mesh };
  }

  private buildReticle(): Transform {
    const group = new Transform();
    const ring = new Mesh(this.gl, {
      geometry: new Torus(this.gl, {
        radius: 0.55,
        tube: 0.08,
        radialSegments: 8,
        tubularSegments: 36,
      }),
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
    // each burst owns its program (per-node alpha + color fade)
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
    return { group, prog: own, active: false, life: 0 };
  }

  setSkin(skin: RenderSkin): void {
    this.skin = skin;
    const bg = hexToRgb(skin.background);
    this.gl.clearColor(bg[0], bg[1], bg[2], 1);
  }

  // --- Viewport: screen -> arena-plane world coordinates ---------------------
  // Unproject the cursor to a near + far world point, then intersect the ray with
  // the y=0 plane. Exact for any camera tilt.
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
    const x = near.x + (far.x - near.x) * t;
    const z = near.z + (far.z - near.z) * t;
    return { x, z };
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h);
    const aspect = w / h;
    this.camera.perspective({ aspect });

    // Frame the arena bounding radius for either aspect (portrait pulls back).
    const halfFov = (FOV * Math.PI) / 180 / 2;
    const fitR = ARENA_R * FIT;
    let dist = fitR / Math.sin(halfFov);
    if (aspect < 1) dist /= aspect;
    this.camera.position.set(0, dist * Math.sin(ELEV), dist * Math.cos(ELEV));
    this.camera.lookAt([0, 0, 0]);
    this.camera.updateMatrixWorld(); // refresh worldMatrix for unproject
  }

  /** Render a frame. `aim` is the live cursor target (world), for the reticle. */
  render(s: LiveState, aim: { x: number; z: number }, timeMs: number): void {
    const dt = this.prevTime ? Math.min(0.05, (timeMs - this.prevTime) / 1000) : 0;
    this.prevTime = timeMs;
    this.spin += dt * 22; // rotor spin (render-only)

    // Player
    this.player.position.set(s.px, 0, s.pz);
    this.player.rotation.y = yaw(s.fx, s.fz);

    // Reticle on the steer point
    this.reticle.position.set(aim.x, 0.06, aim.z);
    this.reticle.rotation.y += dt * 1.5;

    // Enemies. Grow the pool on demand so an extreme (non-default) config that
    // spawns more concurrent drones than the initial pool never silently caps the
    // render - the sim already simulates them all.
    this.ensureEnemies(s.enemies.length);
    for (let i = 0; i < this.enemies.length; i += 1) {
      const node = this.enemies[i]!;
      const e = s.enemies[i];
      if (!e) {
        if (node.group.visible) node.group.visible = false;
        continue;
      }
      node.group.visible = true;
      node.group.position.set(e.x, 0, e.z);
      node.group.rotation.y = yaw(s.px - e.x, s.pz - e.z); // face the player
      const hex = enemyColor(this.skin, e.kind);
      const lit = this.litProg(hex);
      node.body.program = lit;
      for (const arm of node.arms) arm.program = lit;
      for (const tip of node.rotors) {
        tip.rotation.y = this.spin * (e.kind === KIND_WEAVER ? -1.3 : 1);
        (tip.children[0] as Mesh).program = lit;
      }
      node.halo.program = this.emissiveProg(hex, 0.16);
    }

    // Bolts
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
    }

    // Spawn bursts for this window's deaths
    for (const d of s.deaths) this.spawnBurst(d.x, d.z, enemyColor(this.skin, d.kind));
    this.updateBursts(dt);

    this.renderer.render({ scene: this.scene, camera: this.camera });
  }

  private spawnBurst(x: number, z: number, hex: string): void {
    const b = this.bursts.find((q) => !q.active);
    if (!b) return;
    const [r, g, bl] = hexToRgb(hex);
    (b.prog.uniforms.uColor.value as Color).set(r, g, bl);
    b.prog.uniforms.uAlpha.value = 1;
    b.group.position.set(x, 0.2, z);
    b.group.scale.set(0.4, 0.4, 0.4);
    b.group.visible = true;
    b.active = true;
    b.life = 0;
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
      const s = 0.4 + t * 2.2;
      b.group.scale.set(s, s, s);
      b.prog.uniforms.uAlpha.value = (1 - t) * 0.8;
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
