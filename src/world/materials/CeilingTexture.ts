import * as THREE from "three";

import { mulberry32, tileableNoise } from "./ConcreteTexture";

/** Pixels along one side of the (square, seamless) ceiling textures. */
export const CEILING_TEXTURE_SIZE = 512;

/** Metres of ceiling covered by one repeat: eight engraved stripes of 0.5 m. */
export const CEILING_TILE_METRES = 4;

export interface CeilingTextures {
  /** Dark concrete, cooler and flatter than the floor, with the stripes cut in. */
  color: THREE.DataTexture;
  /** Tangent-space normal map: the stripes and panel joints are cut grooves. */
  normal: THREE.DataTexture;
  /** Roughness in the green channel: 0.85 to 0.95. */
  roughness: THREE.DataTexture;
}

/**
 * Dark poured concrete for ceilings and roofs, engraved with parallel stripes:
 * a narrow groove every 0.5 m (with a hair-fine raised lip either side), a
 * wider, deeper panel joint every 2 m, and a faint cross seam at the tile edge.
 * Stained and mottled a little (soft and fine noise), never bright. The grooves
 * are darker in colour and cut in the normal map, so they stay readable in low
 * light. Seamless; generated once, no asset to ship.
 */
export function createCeilingTextures(
  size = CEILING_TEXTURE_SIZE,
  seed = 6131,
): CeilingTextures {
  const random = mulberry32(seed);
  const stain = tileableNoise(size, 6, random);
  const mottle = tileableNoise(size, 40, random);
  const pits = tileableNoise(size, 160, random);
  const pitch = size / 8;
  const color = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    // Distance to the nearest stripe line (a line every `pitch` pixels).
    const along = ((y % pitch) + pitch) % pitch;
    const toLine = Math.min(along, pitch - along);
    const stripeIndex = Math.round(y / pitch) % 8;
    const joint = stripeIndex % 4 === 0;
    const half = joint ? 5.5 : 2.6;

    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const wear = stain[i] * 0.5 + mottle[i] * 0.35 + pits[i] * 0.15;
      // The groove: a smooth-edged channel; a thin lip just outside it.
      const inGroove = Math.max(
        0,
        1 - Math.max(toLine - half * 0.4, 0) / (half * 0.6),
      );
      const groove = toLine <= half ? inGroove : 0;
      const lip = toLine > half && toLine < half + 1.6 ? 0.12 : 0;
      // A faint cross seam where the tile repeats.
      const seam = Math.min(x, size - 1 - x) < 1.5 ? 0.6 : 0;
      let value = 0.235 + wear * 0.075 + (pits[i] - 0.5) * 0.03;

      value *= 1 - 0.58 * groove - 0.25 * seam;
      value *= 1 + lip * 0.4;

      color[i * 4] = Math.round(Math.min(value * 0.97, 1) * 255);
      color[i * 4 + 1] = Math.round(Math.min(value, 1) * 255);
      color[i * 4 + 2] = Math.round(Math.min(value * 1.06, 1) * 255);
      color[i * 4 + 3] = 255;

      const roughness = 0.86 + pits[i] * 0.07 + groove * 0.04;
      const byte = Math.round(Math.min(Math.max(roughness, 0.85), 0.95) * 255);

      rough[i * 4] = byte;
      rough[i * 4 + 1] = byte;
      rough[i * 4 + 2] = byte;
      rough[i * 4 + 3] = 255;
      height[i] =
        0.6 -
        groove * (joint ? 0.5 : 0.36) -
        seam * 0.2 +
        lip +
        (pits[i] - 0.5) * 0.08 +
        (mottle[i] - 0.5) * 0.05;
    }
  }

  const normal = new Uint8Array(size * size * 4);
  const at = (x: number, y: number): number =>
    height[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const strength = 6;
      const nx = -(at(x + 1, y) - at(x - 1, y)) * strength;
      const ny = -(at(x, y + 1) - at(x, y - 1)) * strength;
      const length = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;

      normal[i] = Math.round(((nx / length) * 0.5 + 0.5) * 255);
      normal[i + 1] = Math.round(((ny / length) * 0.5 + 0.5) * 255);
      normal[i + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
      normal[i + 3] = 255;
    }
  }

  const make = (data: Uint8Array, srgb: boolean): THREE.DataTexture => {
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);

    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 8;
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.needsUpdate = true;

    return texture;
  };

  return {
    color: make(color, true),
    normal: make(normal, false),
    roughness: make(rough, false),
  };
}
