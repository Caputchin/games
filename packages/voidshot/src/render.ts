// OGL renderer. RENDER-ONLY: it draws the sim's state buffer and never feeds the
// sim, so its look (and any non-deterministic VFX) cannot affect the verdict.
//
// A near-straight-down perspective camera keeps the cursor -> arena-plane mapping
// a clean uniform scale (so `toWorld` is exact) while still reading as 3D
// (foreshortening, top-lighting, glow). Geometry is procedural primitives only;
// the neon look is emissive cores plus additive glow halos. Enemies are drawn
// from a fixed mesh pool. Responsive on both axes: the arena fits the smaller
// dimension in any aspect.

import { Camera, Color, Cylinder, Mesh, Program, Renderer, Sphere, Transform } from 'ogl';
import { ARENA_R } from './constants.js';
import { enemyColor, hexToRgb, type RenderSkin } from './skin.js';
import type { Viewport } from './input.js';
import type { LiveState } from './wasm.js';

const POOL = 64;
const FOV = 40;
const FIT = 0.86; // arena occupies this fraction of the smaller screen dimension

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

const FRAG_SOLID = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  varying vec3 vNormal;
  void main() {
    float l = 0.55 + 0.45 * max(vNormal.y, 0.0);
    gl_FragColor = vec4(uColor * l, 1.0);
  }
`;

const FRAG_HALO = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  void main() { gl_FragColor = vec4(uColor, 0.33); }
`;

const FRAG_FLAT = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  void main() { gl_FragColor = vec4(uColor, 1.0); }
`;

export class Renderer3D implements Viewport {
  private readonly renderer: Renderer;
  private readonly gl: Renderer['gl'];
  private readonly camera: Camera;
  private readonly scene: Transform;
  private readonly player: Mesh;
  private readonly playerHalo: Mesh;
  private readonly enemyCores: Mesh[] = [];
  private readonly enemyHalos: Mesh[] = [];
  private worldPerPixel = 0.05;

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

    const sphere = new Sphere(this.gl, { radius: 1, widthSegments: 18, heightSegments: 14 });
    const disc = new Cylinder(this.gl, {
      radiusTop: ARENA_R,
      radiusBottom: ARENA_R,
      height: 0.2,
      radialSegments: 72,
    });
    const ring = new Cylinder(this.gl, {
      radiusTop: ARENA_R,
      radiusBottom: ARENA_R,
      height: 0.05,
      radialSegments: 72,
      openEnded: true,
    });

    const arena = new Mesh(this.gl, { geometry: disc, program: this.flat(skin.arena) });
    arena.position.set(0, -0.2, 0);
    arena.setParent(this.scene);
    const rim = new Mesh(this.gl, { geometry: ring, program: this.flat(skin.grid) });
    rim.position.set(0, 0.0, 0);
    rim.scale.set(1.002, 1, 1.002);
    rim.setParent(this.scene);

    this.player = new Mesh(this.gl, { geometry: sphere, program: this.solid(skin.player) });
    this.player.scale.set(0.5, 0.5, 0.5);
    this.player.setParent(this.scene);
    this.playerHalo = new Mesh(this.gl, { geometry: sphere, program: this.halo(skin.player) });
    this.playerHalo.scale.set(0.95, 0.95, 0.95);
    this.playerHalo.setParent(this.scene);

    for (let i = 0; i < POOL; i += 1) {
      const core = new Mesh(this.gl, { geometry: sphere, program: this.solid('#ffffff') });
      core.scale.set(0.45, 0.45, 0.45);
      core.visible = false;
      core.setParent(this.scene);
      this.enemyCores.push(core);
      const h = new Mesh(this.gl, { geometry: sphere, program: this.halo('#ffffff') });
      h.scale.set(0.85, 0.85, 0.85);
      h.visible = false;
      h.setParent(this.scene);
      this.enemyHalos.push(h);
    }

    this.resize();
  }

  private program(fragment: string, hex: string): Program {
    const [r, g, b] = hexToRgb(hex);
    return new Program(this.gl, {
      vertex: VERT,
      fragment,
      uniforms: { uColor: { value: new Color(r, g, b) } },
    });
  }
  private solid(hex: string): Program {
    return this.program(FRAG_SOLID, hex);
  }
  private flat(hex: string): Program {
    return this.program(FRAG_FLAT, hex);
  }
  private halo(hex: string): Program {
    const p = this.program(FRAG_HALO, hex);
    p.transparent = true;
    p.depthWrite = false;
    p.setBlendFunc(this.gl.SRC_ALPHA, this.gl.ONE);
    return p;
  }

  setSkin(skin: RenderSkin): void {
    this.skin = skin;
    const bg = hexToRgb(skin.background);
    this.gl.clearColor(bg[0], bg[1], bg[2], 1);
    setColor(this.player, hexToRgb(skin.player));
    setColor(this.playerHalo, hexToRgb(skin.player));
  }

  // --- Viewport: screen -> arena-plane world coordinates --------------------
  toWorld(clientX: number, clientY: number): { x: number; z: number } {
    const rect = this.gl.canvas.getBoundingClientRect();
    const sx = clientX - (rect.left + rect.width / 2);
    const sy = clientY - (rect.top + rect.height / 2);
    return { x: sx * this.worldPerPixel, z: sy * this.worldPerPixel };
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h);
    this.camera.perspective({ aspect: w / h });

    const aspect = w / h;
    const tan = Math.tan((FOV * Math.PI) / 180 / 2);
    const height = ARENA_R / (FIT * tan * Math.min(1, aspect));
    this.camera.position.set(0, height, height * 0.02);
    this.camera.lookAt([0, 0, 0]);

    this.worldPerPixel = (2 * ARENA_R) / (FIT * Math.min(w, h));
  }

  render(s: LiveState): void {
    this.player.position.set(s.px, 0, s.pz);
    this.playerHalo.position.set(s.px, 0, s.pz);

    for (let i = 0; i < POOL; i += 1) {
      const core = this.enemyCores[i]!;
      const h = this.enemyHalos[i]!;
      const e = s.enemies[i];
      if (e) {
        const col = hexToRgb(enemyColor(this.skin, e.kind));
        core.visible = true;
        h.visible = true;
        core.position.set(e.x, 0, e.z);
        h.position.set(e.x, 0, e.z);
        setColor(core, col);
        setColor(h, col);
      } else {
        core.visible = false;
        h.visible = false;
      }
    }

    this.renderer.render({ scene: this.scene, camera: this.camera });
  }

  dispose(): void {
    const ext = this.gl.getExtension('WEBGL_lose_context');
    ext?.loseContext();
    this.gl.canvas.remove();
  }
}

function setColor(mesh: Mesh, col: [number, number, number]): void {
  (mesh.program.uniforms.uColor.value as Color).set(col[0], col[1], col[2]);
}
