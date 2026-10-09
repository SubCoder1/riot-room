import * as THREE from "three";

/** Pixels along one side of the (square, seamless) concrete textures. */
export const CONCRETE_TEXTURE_SIZE = 512;

/** Metres of floor covered by one repeat of the concrete textures. */
export const CONCRETE_TILE_METRES = 4;

export interface ConcreteTextures {
  /** Greyscale albedo (the material colour tints it). */
  color: THREE.DataTexture;
  /** Tangent-space normal map from the same surface. */
  normal: THREE.DataTexture;
}

export function mulberry32(seed: number): () => number {
  let a = seed;

  return () => {
    a = (a + 0x6d2b79f5) | 0;

    let t = Math.imul(a ^ (a >>> 15), 1 | a);

    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Value noise that wraps at the edges: a `freq` x `freq` lattice of random
 * values smoothly interpolated, so the result tiles seamlessly.
 */
export function tileableNoise(
  size: number,
  freq: number,
  random: () => number,
): Float32Array {
  const lattice = new Float32Array(freq * freq);

  for (let i = 0; i < lattice.length; i++) {
    lattice[i] = random();
  }

  const out = new Float32Array(size * size);
  const fade = (t: number): number => t * t * (3 - 2 * t);

  for (let y = 0; y < size; y++) {
    const gy = (y / size) * freq;
    const iy = Math.floor(gy);
    const fy = fade(gy - iy);
    const row0 = (iy % freq) * freq;
    const row1 = ((iy + 1) % freq) * freq;

    for (let x = 0; x < size; x++) {
      const gx = (x / size) * freq;
      const ix = Math.floor(gx);
      const fx = fade(gx - ix);
      const x0 = ix % freq;
      const x1 = (ix + 1) % freq;
      const top = lattice[row0 + x0] * (1 - fx) + lattice[row0 + x1] * fx;
      const bottom = lattice[row1 + x0] * (1 - fx) + lattice[row1 + x1] * fx;

      out[y * size + x] = top * (1 - fy) + bottom * fy;
    }
  }

  return out;
}

/**
 * A seamless, subtle worn-concrete surface: soft large blotches, a medium
 * mottling, a fine grain and a few tiny pits. No joints or cracks, so a repeat
 * does not announce itself. Generated once at start-up (no asset to download).
 */
export function createConcreteTextures(
  size = CONCRETE_TEXTURE_SIZE,
  seed = 1337,
): ConcreteTextures {
  const random = mulberry32(seed);
  const height = new Float32Array(size * size);
  // Frequency (lattice cells per tile) and weight of each layer.
  const octaves: Array<[number, number]> = [
    [3, 0.3],
    [6, 0.22],
    [12, 0.18],
    [24, 0.14],
    [48, 0.1],
    [96, 0.06],
  ];
  let total = 0;

  for (const [freq, weight] of octaves) {
    const layer = tileableNoise(size, freq, random);

    for (let i = 0; i < height.length; i++) {
      height[i] += layer[i] * weight;
    }

    total += weight;
  }

  const grain = new Float32Array(size * size);

  for (let i = 0; i < height.length; i++) {
    height[i] /= total;
    grain[i] = random();
  }

  const color = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const at = (x: number, y: number): number =>
    height[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      // Mid-grey around 0.62, with the blotches and grain on top.
      let value = 0.62 + (height[i] - 0.5) * 0.7 + (grain[i] - 0.5) * 0.09;

      // Rare pinpoint pits: darker, and a touch deeper in the normal map.
      const pit = grain[i] < 0.0025 ? 1 : 0;

      value -= pit * 0.18;
      value = Math.min(Math.max(value, 0), 1);

      const byte = Math.round(value * 255);

      color[i * 4] = byte;
      color[i * 4 + 1] = byte;
      color[i * 4 + 2] = byte;
      color[i * 4 + 3] = 255;

      // Normal from the height gradient (wrapping, so it tiles too).
      const strength = 9;
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength + pit * 0.1;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength + pit * 0.1;
      const grainX = (grain[i] - grain[y * size + ((x + 1) % size)]) * 0.35;
      const nx = -dx + grainX;
      const ny = -dy;
      const length = Math.hypot(nx, ny, 1);

      normal[i * 4] = Math.round(((nx / length) * 0.5 + 0.5) * 255);
      normal[i * 4 + 1] = Math.round(((ny / length) * 0.5 + 0.5) * 255);
      normal[i * 4 + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
      normal[i * 4 + 3] = 255;
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

  return { color: make(color, true), normal: make(normal, false) };
}
