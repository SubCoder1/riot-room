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
    roughness: 0.14,
    metalness: 0.1,
    clearcoat: 1,
    clearcoatRoughness: 0.14,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  private readonly meshes = new Map<string, THREE.Mesh>();
  private readonly signs: THREE.Mesh[] = [];

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

      if ((spill.signs ?? []).length > 0) {
        const texture = this.createSign();

        if (texture) {
          this.textures.push(texture);

          for (const sign of spill.signs ?? []) {
            const board = new THREE.Mesh(
              new THREE.PlaneGeometry(0.8, 0.5),
              new THREE.MeshStandardMaterial({
                map: texture,
                roughness: 0.7,
                metalness: 0.2,
                emissive: 0xffffff,
                emissiveMap: texture,
                // Faded paint: it can be read in the dark, but not glowing.
                emissiveIntensity: 0.1,
              }),
            );

            board.position.set(
              sign.x + sign.nx * 0.012,
              spill.y + sign.y,
              sign.z + sign.nz * 0.012,
            );
            board.rotation.y = Math.atan2(sign.nx, sign.nz);
            board.name = spill.id + "-sign";
            this.signs.push(board);
            this.group.add(board);
          }
        }
      }
    }
  }

  /**
   * The notice on the wall: a yellow plate with a black border, a flame
   * pictogram and the warning, drawn once into a texture.
   */
  private createSign(): THREE.Texture | null {
    if (typeof document === "undefined") {
      return null;
    }

    const canvas = document.createElement("canvas");

    canvas.width = 512;
    canvas.height = 320;

    const g = canvas.getContext("2d");

    if (!g) {
      return null;
    }

    g.fillStyle = "#c9a227";
    g.fillRect(0, 0, 512, 320);
    g.strokeStyle = "#16130c";
    g.lineWidth = 14;
    g.strokeRect(10, 10, 492, 300);

    // A black band across the top with the word, and a flame in a triangle.
    g.fillStyle = "#16130c";
    g.fillRect(10, 10, 492, 84);
    g.fillStyle = "#e6c34a";
    g.font = "bold 62px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("DANGER", 256, 54);

    g.fillStyle = "#16130c";
    g.beginPath();
    g.moveTo(92, 118);
    g.lineTo(162, 240);
    g.lineTo(22, 240);
    g.closePath();
    g.fill();
    g.fillStyle = "#c9a227";
    g.beginPath();
    g.moveTo(92, 150);
    g.bezierCurveTo(122, 190, 120, 214, 92, 226);
    g.bezierCurveTo(64, 214, 64, 190, 92, 150);
    g.closePath();
    g.fill();

    g.fillStyle = "#16130c";
    g.textAlign = "left";
    g.font = "bold 40px sans-serif";
    g.fillText("OIL SPILLAGE", 182, 140);
    g.font = "bold 30px sans-serif";
    g.fillText("FLAMMABLE: FIRE", 182, 188);
    g.fillText("MAY CATCH FAST", 182, 228);
    g.font = "bold 26px sans-serif";
    g.fillText("NO FLAMES. KEEP CLEAR.", 30, 282);

    const texture = new THREE.CanvasTexture(canvas);

    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;

    return texture;
  }

  private build(spill: FuelSpillDefinition): {
    geometry: THREE.BufferGeometry;
    texture: THREE.DataTexture;
  } {
    const seed = spill.x * 3.1 + spill.z * 1.7;
    const path =
      spill.path && spill.path.length > 1
        ? spill.path
        : [spill.source, { x: spill.x, z: spill.z }];
    const margin = 1.3;
    const around = [
      ...path.map((q) => ({ x: q.x, z: q.z, r: 0 })),
      { x: spill.x, z: spill.z, r: spill.radius * 0.8 },
      ...(spill.lobes ?? []),
    ];
    const minX = Math.min(...around.map((q) => q.x - q.r)) - margin;
    const maxX = Math.max(...around.map((q) => q.x + q.r)) + margin;
    const minZ = Math.min(...around.map((q) => q.z - q.r)) - margin;
    const maxZ = Math.max(...around.map((q) => q.z + q.r)) + margin;
    // About 2.5 cm to a texel along the longer side.
    const cols = Math.min(
      1024,
      Math.max(128, Math.round((maxX - minX) / 0.025)),
    );
    const rows = Math.min(
      1024,
      Math.max(128, Math.round((maxZ - minZ) / 0.025)),
    );
    const data = new Uint8Array(cols * rows * 4);
    const radius = spill.radius * 0.8;
    const a = hash(seed, 1) * 6;
    const b = hash(seed, 2) * 6;
    const c = hash(seed, 3) * 6;
    // A wide puddle runs into several lobes.
    const lobes = spill.lobes ?? [];
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
    const pool = (
      x: number,
      z: number,
      cx: number,
      cz: number,
      r: number,
      phase: number,
    ): number => {
      const angle = Math.atan2(z - cz, x - cx);
      const edge =
        r *
        (1 +
          0.08 * Math.sin(2 * angle + a + phase) +
          0.07 * Math.sin(4 * angle + b + phase) +
          0.05 * Math.sin(9 * angle + c + phase));

      return Math.hypot(x - cx, z - cz) - edge;
    };

    // Total length of the trail, so its width can follow how far it has run.
    const lengths: number[] = [0];

    for (let i = 1; i < path.length; i++) {
      lengths.push(
        lengths[i - 1] +
          Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z),
      );
    }

    const total = lengths[lengths.length - 1];

    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = minX + ((i + 0.5) / cols) * (maxX - minX);
        // Texture row 0 is the bottom of the picture: the +z edge of the quad.
        const z = maxZ - ((j + 0.5) / rows) * (maxZ - minZ);
        let sd = pool(x, z, spill.x, spill.z, radius, 0);

        lobes.forEach((lobe, n) => {
          sd = Math.min(sd, pool(x, z, lobe.x, lobe.z, lobe.r, 2 + n));
        });

        // The trail: a ribbon along the path, thin at the leak, widest where
        // it runs into the pools, wavering a little.
        for (let k = 1; k < path.length; k++) {
          const seg = segmentDistance(
            x,
            z,
            path[k - 1].x,
            path[k - 1].z,
            path[k].x,
            path[k].z,
          );
          const along =
            (lengths[k - 1] + (lengths[k] - lengths[k - 1]) * seg.t) / total;
          const width =
            0.05 +
            0.07 * Math.sin(Math.PI * Math.min(along * 1.6, 1)) +
            0.015 * Math.sin(along * 90 + a);

          sd = Math.min(sd, seg.d - width);
        }

        for (const drop of drops) {
          sd = Math.min(sd, Math.hypot(x - drop.x, z - drop.z) - drop.r);
        }

        const alpha = 1 - smooth(-0.015, 0.025, sd);
        // Thin film at the rim lighter and bluer, a faint rainbow of oil on
        // the surface, the middle near black.
        const rim = 1 - smooth(0.0, 0.2, -sd);
        const sheen =
          0.5 +
          0.5 * Math.sin(x * 7.3 + z * 5.1 + 4 * Math.sin(x * 2.1 - z * 3.3));
        const o = (j * cols + i) * 4;

        data[o] = Math.round(255 * (0.032 + 0.045 * rim + 0.012 * sheen));
        data[o + 1] = Math.round(255 * (0.032 + 0.05 * rim + 0.01 * sheen));
        data[o + 2] = Math.round(255 * (0.04 + 0.075 * rim + 0.025 * sheen));
        data[o + 3] = Math.round(255 * alpha * 0.97);
      }
    }

    const texture = new THREE.DataTexture(data, cols, rows, THREE.RGBAFormat);

    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.needsUpdate = true;

    const geometry = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ);

    geometry.rotateX(-Math.PI / 2);
    geometry.translate((minX + maxX) / 2, spill.y + 0.008, (minZ + maxZ) / 2);

    return { geometry, texture };
  }

  /** Shows each pool as it is: wet, burning or scorched. */
  public update(stateOf: (id: string) => FuelState): void {
    for (const spill of this.spills) {
      const mesh = this.meshes.get(spill.id);

      if (!mesh) {
        continue;
      }

      const material = mesh.material as THREE.MeshPhysicalMaterial;
      const state = stateOf(spill.id);

      // The oil burns off: it darkens under the fire (no shine, no glow) and is
      // left as a dull scorch. It burns once.
      if (state === "burning") {
        material.color.setRGB(0.35, 0.3, 0.28);
        material.emissive.setRGB(0.06, 0.02, 0.0);
        material.roughness = 0.7;
        material.clearcoat = 0;
        material.opacity = 1;
      } else if (state === "spent") {
        material.color.setRGB(0.22, 0.2, 0.2);
        material.emissive.setRGB(0, 0, 0);
        material.roughness = 0.95;
        material.clearcoat = 0;
        material.opacity = 0.8;
      } else {
        material.color.setRGB(1, 1, 1);
        // Wet: the lamps show in it as soft highlights.
        material.emissive.setRGB(0, 0, 0);
        material.roughness = 0.14;
        material.clearcoat = 1;
        material.opacity = 1;
      }
    }
  }

  public dispose(): void {
    for (const mesh of this.meshes.values()) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }

    for (const sign of this.signs) {
      sign.geometry.dispose();
      (sign.material as THREE.Material).dispose();
    }

    for (const texture of this.textures) {
      texture.dispose();
    }

    this.material.dispose();
    this.group.removeFromParent();
  }
}
