import * as THREE from "three";

import type { FuelState } from "../combat/FuelHazard";
import type { FuelSpillDefinition } from "../world/ArenaLayout";

/** A small repeatable generator, so the pool is the same every run. */
function hash(seed: number, index: number): number {
  const x = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;

  return x - Math.floor(x);
}

/**
 * A pool of spilled fuel as it lies on the floor: an irregular dark pool of
 * overlapping blobs and a trail of smaller ones running back to the leak. The
 * surface is glossy (a clear coat), so a lamp shows in it as a soft highlight.
 * When it burns it glows a little; when it has burnt it is a dull black scorch.
 */
const SIZE = 256;

/** Distance from (px, pz) to the segment a-b. */
function segmentDistance(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { d: number; t: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.min(
    Math.max(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0),
    1,
  );

  return { d: Math.hypot(px - (ax + dx * t), pz - (az + dz * t)), t };
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);

  return t * t * (3 - 2 * t);
};

/**
 * A pool of spilled fuel as it lies on the floor: one irregular pool with a
 * wavering edge, a trail that thins towards the leak, and a few drops, all
 * drawn into one texture on a flat quad (soft, wet-dark, with a slightly
 * lighter rim where the film is thin). The surface is glossy (a clear coat),
 * so a lamp shows in it as a soft highlight. When it burns it glows a little;
 * when it has burnt it is a dull black scorch.
 */
export class FuelSpillView {
  public readonly group = new THREE.Group();

  private readonly spills: readonly FuelSpillDefinition[];
  private readonly textures: THREE.Texture[] = [];
  private readonly material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.06,
    metalness: 0.1,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  private readonly meshes = new Map<string, THREE.Mesh>();

  constructor(spills: readonly FuelSpillDefinition[]) {
    this.spills = spills;
    this.group.name = "FuelSpills";

    for (const spill of spills) {
      const { geometry, texture } = this.build(spill);
      const mesh = new THREE.Mesh(
        geometry,
        // One material per pool (each has its own picture).
        this.material.clone(),
      );

      (mesh.material as THREE.MeshPhysicalMaterial).map = texture;
      mesh.name = spill.id;
      this.textures.push(texture);
      this.meshes.set(spill.id, mesh);
      this.group.add(mesh);
    }
  }

  private build(spill: FuelSpillDefinition): {
    geometry: THREE.BufferGeometry;
    texture: THREE.DataTexture;
  } {
    const seed = spill.x * 3.1 + spill.z * 1.7;
    const margin = 1.1;
    const minX = Math.min(spill.x, spill.source.x) - margin;
    const maxX = Math.max(spill.x, spill.source.x) + margin;
    const minZ = Math.min(spill.z, spill.source.z) - margin;
    const maxZ = Math.max(spill.z, spill.source.z) + margin;
    const data = new Uint8Array(SIZE * SIZE * 4);
    const radius = 0.78;
    const a = hash(seed, 1) * 6;
    const b = hash(seed, 2) * 6;
    const c = hash(seed, 3) * 6;
    // A few drops thrown out of the pool.
    const drops = [0, 1, 2, 3, 4].map((k) => {
      const ang = hash(seed, 10 + k) * Math.PI * 2;
      const far = radius * (1.15 + 0.5 * hash(seed, 20 + k));

      return {
        x: spill.x + Math.cos(ang) * far,
        z: spill.z + Math.sin(ang) * far,
        r: 0.03 + 0.05 * hash(seed, 30 + k),
      };
    });

    for (let j = 0; j < SIZE; j++) {
      for (let i = 0; i < SIZE; i++) {
        const x = minX + ((i + 0.5) / SIZE) * (maxX - minX);
        // Texture row 0 is the bottom of the picture: the +z edge of the quad.
        const z = maxZ - ((j + 0.5) / SIZE) * (maxZ - minZ);
        const angle = Math.atan2(z - spill.z, x - spill.x);
        const edge =
          radius *
          (1 +
            0.08 * Math.sin(2 * angle + a) +
            0.07 * Math.sin(4 * angle + b) +
            0.05 * Math.sin(9 * angle + c));
        let sd = Math.hypot(x - spill.x, z - spill.z) - edge;
        const trail = segmentDistance(
          x,
          z,
          spill.source.x,
          spill.source.z,
          spill.x,
          spill.z,
        );
        const width =
          0.035 + 0.1 * trail.t * trail.t + 0.012 * Math.sin(trail.t * 17 + a);
        // Where the trail meets the pool the two run together.
        const sdTrail = trail.d - width;

        sd = Math.min(sd, sdTrail);

        for (const drop of drops) {
          sd = Math.min(sd, Math.hypot(x - drop.x, z - drop.z) - drop.r);
        }

        const alpha = 1 - smooth(-0.015, 0.025, sd);
        // Thin film at the rim a little lighter and bluer; the middle near black.
        const rim = 1 - smooth(0.0, 0.18, -sd);
        const o = (j * SIZE + i) * 4;

        data[o] = Math.round(255 * (0.035 + 0.05 * rim));
        data[o + 1] = Math.round(255 * (0.035 + 0.055 * rim));
        data[o + 2] = Math.round(255 * (0.045 + 0.08 * rim));
        data[o + 3] = Math.round(255 * alpha * 0.96);
      }
    }

    const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);

    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;

    const geometry = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ);

    geometry.rotateX(-Math.PI / 2);
    geometry.translate((minX + maxX) / 2, spill.y + 0.008, (minZ + maxZ) / 2);

    return { geometry, texture };
  }

  /** Shows each pool as it is: wet, burning or scorched. */
  public update(stateOf: (id: string) => FuelState, time: number): void {
    for (const spill of this.spills) {
      const mesh = this.meshes.get(spill.id);

      if (!mesh) {
        continue;
      }

      const material = mesh.material as THREE.MeshPhysicalMaterial;
      const state = stateOf(spill.id);

      if (state === "burning") {
        material.color.setRGB(1, 0.6, 0.45);
        material.emissive.setRGB(0.5 + 0.2 * Math.sin(time * 13), 0.16, 0.02);
        material.roughness = 0.3;
        material.clearcoat = 0.4;
      } else if (state === "spent") {
        material.color.setRGB(0.3, 0.3, 0.3);
        material.emissive.setRGB(0, 0, 0);
        material.roughness = 0.9;
        material.clearcoat = 0;
      } else {
        material.color.setRGB(1, 1, 1);
        material.emissive.setRGB(0, 0, 0);
        material.roughness = 0.05;
        material.clearcoat = 1;
      }
    }
  }

  public dispose(): void {
    for (const mesh of this.meshes.values()) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }

    for (const texture of this.textures) {
      texture.dispose();
    }

    this.material.dispose();
    this.group.removeFromParent();
  }
}
