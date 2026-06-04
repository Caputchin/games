// Inlined-glb loader. The vendored .glb models (drone, ship) are bundled into the
// IIFE as Uint8Array (esbuild binary loader); the sandbox CSP forbids fetch, so we
// parse the bytes directly: OGL's GLTFLoader.unpackGLB reads the self-contained
// binary chunk (no network), then we flatten the node tree into positioned
// geometry + material parts. The renderer instances these (a shared geometry per
// part across the whole enemy pool) and draws them with its own PBR-lite shader,
// so the model's multi-material color survives but the lighting is ours.
//
// RENDER-ONLY: models never touch the sim, so they cannot affect the verdict.

import { GLTFLoader, Mat4, Quat, Renderer, Vec3 } from 'ogl';
import type { Geometry } from 'ogl';

export interface ModelPart {
  geometry: Geometry;
  /** The part's model-space local matrix (applied to the instance node directly). */
  matrix: Mat4;
  /** Material base color (linear 0..1). */
  color: [number, number, number];
  emissive: [number, number, number];
  alpha: number;
  metallic: number;
  roughness: number;
}

interface GltfNode {
  mesh?: number;
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  children?: number[];
}

function nodeLocalMatrix(node: GltfNode): Mat4 {
  const m = new Mat4();
  if (node.matrix) {
    for (let i = 0; i < 16; i += 1) m[i] = node.matrix[i]!;
    return m;
  }
  const t = node.translation ?? [0, 0, 0];
  const r = node.rotation ?? [0, 0, 0, 1];
  const s = node.scale ?? [1, 1, 1];
  m.compose(new Quat(r[0], r[1], r[2], r[3]), new Vec3(t[0], t[1], t[2]), new Vec3(s[0], s[1], s[2]));
  return m;
}

/** Parse an inlined .glb into flattened, world-positioned geometry + material
 *  parts. The model's local axes/scale are preserved; the renderer normalizes
 *  size + orientation when it instances the parts. */
export async function loadModelParts(
  gl: Renderer['gl'],
  bytes: Uint8Array,
): Promise<ModelPart[]> {
  // Own a tight ArrayBuffer (the bundled view may be a window into a larger one).
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const desc = GLTFLoader.unpackGLB(buffer) as {
    nodes: GltfNode[];
    meshes: { primitives: { material?: number }[] }[];
    scenes: { nodes: number[] }[];
    scene?: number;
  };
  const gltf = await GLTFLoader.parse(gl, desc as never, '');
  const oglMeshes = gltf.meshes as unknown as { primitives: { geometry: Geometry }[] }[];
  const materials = (gltf.materials ?? []) as unknown as {
    baseColorFactor?: number[];
    emissiveFactor?: number[];
    metallicFactor?: number;
    roughnessFactor?: number;
  }[];

  const parts: ModelPart[] = [];

  const walk = (nodeIndex: number, parent: Mat4): void => {
    const node = desc.nodes[nodeIndex];
    if (!node) return;
    const world = new Mat4().multiply(parent, nodeLocalMatrix(node));
    if (node.mesh !== undefined && oglMeshes[node.mesh]) {
      const descPrims = desc.meshes[node.mesh]!.primitives;
      oglMeshes[node.mesh]!.primitives.forEach((prim, k) => {
        const matIdx = descPrims[k]?.material;
        const m = matIdx != null ? materials[matIdx] : undefined;
        const base = m?.baseColorFactor ?? [0.8, 0.8, 0.8, 1];
        const emi = m?.emissiveFactor ?? [0, 0, 0];
        parts.push({
          geometry: prim.geometry,
          matrix: new Mat4().copy(world),
          color: [base[0]!, base[1]!, base[2]!],
          alpha: base[3] ?? 1,
          emissive: [emi[0]!, emi[1]!, emi[2]!],
          metallic: m?.metallicFactor ?? 0,
          roughness: m?.roughnessFactor ?? 1,
        });
      });
    }
    for (const c of node.children ?? []) walk(c, world);
  };

  const scene = desc.scenes[desc.scene ?? 0]!;
  for (const n of scene.nodes) walk(n, new Mat4());
  return parts;
}

/** Model-space bounds (center + radius) across all parts, for normalizing the
 *  instance to a target size. Transforms each geometry's local AABB corners by the
 *  part matrix. */
export function partsBounds(parts: ModelPart[]): { center: Vec3; radius: number } {
  const min = new Vec3(Infinity, Infinity, Infinity);
  const max = new Vec3(-Infinity, -Infinity, -Infinity);
  const v = new Vec3();
  for (const p of parts) {
    const g = p.geometry;
    if (!g.bounds) g.computeBoundingBox();
    const lo = g.bounds.min;
    const hi = g.bounds.max;
    for (const cx of [lo.x, hi.x]) {
      for (const cy of [lo.y, hi.y]) {
        for (const cz of [lo.z, hi.z]) {
          v.set(cx, cy, cz).applyMatrix4(p.matrix);
          min.x = Math.min(min.x, v.x);
          min.y = Math.min(min.y, v.y);
          min.z = Math.min(min.z, v.z);
          max.x = Math.max(max.x, v.x);
          max.y = Math.max(max.y, v.y);
          max.z = Math.max(max.z, v.z);
        }
      }
    }
  }
  const center = new Vec3((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
  const radius = Math.max(max.x - min.x, max.y - min.y, max.z - min.z) / 2 || 1;
  return { center, radius };
}
