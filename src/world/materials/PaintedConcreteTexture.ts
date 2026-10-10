import * as THREE from "three";

import { mulberry32, tileableNoise } from "./ConcreteTexture";

/** Pixels along one side of the (square, seamless) painted-concrete textures. */
export const PAINTED_TEXTURE_SIZE = 768;

/** Metres of wall covered by one repeat. */
export const PAINTED_TILE_METRES = 7.5;

export interface PaintedConcreteTextures {
  /** Metres of wall covered by one repeat of this set. */
  tileMetres: number;
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
  options: { tileMetres?: number; cracks?: number; damp?: number } = {},
): PaintedConcreteTextures {
  const tileMetres = options.tileMetres ?? PAINTED_TILE_METRES;
  // Features keep their size in metres whatever the tile (a bigger tile holds
  // more of them and repeats less).
  const k = tileMetres / 5;
  const random = mulberry32(seed);
  const soft = tileableNoise(size, Math.round(3 * k), random);
  const blotch = tileableNoise(size, Math.round(10 * k), random);
  const fine = tileableNoise(size, Math.round(64 * k), random);
  const runs = tileableNoise(size, Math.round(2 * k), random);

  // One smooth random value per column, for the faint vertical streaks.
  const columns = tileableNoise(size, Math.round(40 * k), random).subarray(
    0,
    size,
  );
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

  // Weathering on top of the paint: a few water runs, damp patches and chips
  // where the paint has come off and the grey concrete shows.
  const damp = tileableNoise(size, Math.round(4 * k), random);
  const stamp = (
    cx: number,
    cy: number,
    radius: number,
    value: number,
    dent: number,
  ): void => {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const d = Math.hypot(dx, dy) / radius;

        if (d > 1 || random() < d * d * 0.5) {
          continue;
        }

        const x = (((Math.round(cx + dx) % size) + size) % size) | 0;
        const y = (((Math.round(cy + dy) % size) + size) % size) | 0;
        const i = y * size + x;
        const k = 1 - d * d;

        for (let c = 0; c < 3; c++) {
          color[i * 4 + c] = Math.max(0, color[i * 4 + c] + value * k * 255);
        }

        height[i] += dent * k;
      }
    }
  };

  for (let i = 0; i < size * size; i++) {
    const wet =
      Math.min(Math.max((damp[i] - 0.62) / 0.2, 0), 1) * (options.damp ?? 1);

    if (wet > 0) {
      for (let c = 0; c < 3; c++) {
        color[i * 4 + c] *= 1 - 0.1 * wet;
      }
    }
  }

  // Runs: a thin streak down from a point, darker at its head and fading.
  for (let n = 0; n < Math.round(12 * k * k); n++) {
    const x0 = Math.floor(random() * size);
    const y0 = Math.floor(random() * size);
    const length = 50 + Math.floor(random() * 150);
    const strength = 0.05 + random() * 0.05;
    const wide = random() < 0.4 ? 2 : 1;

    for (let t = 0; t < length; t++) {
      const fade = 1 - t / length;
      const wander = Math.round(Math.sin(t * 0.07 + n) * 1.5);

      for (let w = 0; w < wide; w++) {
        const x = (((x0 + wander + w) % size) + size) % size;
        const y = (y0 + t) % size;
        const i = y * size + x;

        for (let c = 0; c < 3; c++) {
          color[i * 4 + c] = Math.max(
            0,
            color[i * 4 + c] - strength * fade * 255,
          );
        }
      }
    }
  }

  // Chips: small ragged bare patches, a little darker than the paint, dented.
  for (let n = 0; n < Math.round(24 * k * k); n++) {
    stamp(
      random() * size,
      random() * size,
      2 + Math.floor(random() * 4),
      -0.2,
      -0.5,
    );
  }

  // Hairline cracks: thin dark wandering lines.
  const crackCount = Math.round((options.cracks ?? 0) * k * k);

  for (let n = 0; n < crackCount; n++) {
    let x = random() * size;
    let y = random() * size;
    let angle = random() * Math.PI * 2;
    const length = 40 + random() * 140;

    for (let t = 0; t < length; t++) {
      angle += (random() - 0.5) * 0.45;
      x += Math.cos(angle);
      y += Math.sin(angle);

      const i =
        (((Math.round(y) % size) + size) % size) * size +
        (((Math.round(x) % size) + size) % size);

      for (let c = 0; c < 3; c++) {
        color[i * 4 + c] = Math.max(0, color[i * 4 + c] - 0.13 * 255);
      }

      height[i] -= 0.5;
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
    tileMetres,
    color: make(color, true),
    normal: make(normal, false),
    roughness: make(rough, false),
  };
}
