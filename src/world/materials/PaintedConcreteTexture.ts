import * as THREE from "three";

import { mulberry32, tileableNoise } from "./ConcreteTexture";

/** Pixels along one side of the (square, seamless) painted-concrete textures. */
export const PAINTED_TEXTURE_SIZE = 512;

/** Metres of wall covered by one repeat. */
export const PAINTED_TILE_METRES = 5;

export interface PaintedConcreteTextures {
  /** Near-neutral light grey (the material colour tints it dark blue-grey). */
  color: THREE.DataTexture;
  /** Very soft orange-peel normals, so light rolls over the paint a little. */
  normal: THREE.DataTexture;
  /** Roughness in the green channel, 0.82 to 0.93. */
  roughness: THREE.DataTexture;
}

/**
 * A quiet painted-concrete surface: soft large blotches, a fine paint stipple,
 * and faint vertical streaks where paint has run. No cracks, stains or joints:
 * it only breaks up a flat colour, and tiles seamlessly.
 */
export function createPaintedConcreteTextures(
  size = PAINTED_TEXTURE_SIZE,
  seed = 77,
): PaintedConcreteTextures {
  const random = mulberry32(seed);
  const soft = tileableNoise(size, 3, random);
  const blotch = tileableNoise(size, 10, random);
  const fine = tileableNoise(size, 64, random);
  const runs = tileableNoise(size, 2, random);

  // One smooth random value per column, for the faint vertical streaks.
  const columns = tileableNoise(size, 40, random).subarray(0, size);
  const color = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const grain = random();
      // Streaks fade in and out down the wall.
      const streak = (columns[x] - 0.5) * (0.3 + runs[i] * 0.7);
      const value =
        0.8 +
        (soft[i] - 0.5) * 0.1 +
        (blotch[i] - 0.5) * 0.05 +
        streak * 0.06 +
        (grain - 0.5) * 0.03;
      const byte = Math.round(Math.min(Math.max(value, 0), 1) * 255);

      color[i * 4] = Math.round(byte * 0.985);
      color[i * 4 + 1] = byte;
      color[i * 4 + 2] = Math.min(255, Math.round(byte * 1.02));
      color[i * 4 + 3] = 255;

      const roughness =
        0.88 + (blotch[i] - 0.5) * 0.08 + (fine[i] - 0.5) * 0.06;
      const r = Math.round(Math.min(Math.max(roughness, 0.82), 0.93) * 255);

      rough[i * 4] = r;
      rough[i * 4 + 1] = r;
      rough[i * 4 + 2] = r;
      rough[i * 4 + 3] = 255;
      height[i] = fine[i] * 0.7 + grain * 0.3 + blotch[i] * 0.2;
    }
  }

  const normal = new Uint8Array(size * size * 4);
  const at = (x: number, y: number): number =>
    height[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const strength = 1.6;
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
