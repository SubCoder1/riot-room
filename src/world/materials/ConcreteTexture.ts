import * as THREE from "three";

/** Pixels along one side of the (square, seamless) concrete textures. */
export const CONCRETE_TEXTURE_SIZE = 1024;

/** Metres of floor covered by one repeat of the concrete textures. */
export const CONCRETE_TILE_METRES = 8;

export interface ConcreteTextures {
  /** Metres of floor covered by one repeat of this set. */
  tileMetres: number;
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

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);

  return t * t * (3 - 2 * t);
};

/**
 * Marks that sit on top of the concrete, added to the value (positive lightens,
 * negative darkens): soft dark stains, lighter worn patches, a few short
 * scuffs and the odd oil spot. All of them wrap at the edges, so the tile
 * still repeats without a seam, and all are mild.
 */
/** Hairline cracks: thin wandering lines, now and then a short branch. */
function addCracks(
  marks: Float32Array,
  size: number,
  random: () => number,
  count: number,
): void {
  const walk = (
    x0: number,
    y0: number,
    angle0: number,
    length: number,
    depth: number,
  ): void => {
    let x = x0;
    let y = y0;
    let angle = angle0;

    for (let t = 0; t < length; t++) {
      angle += (random() - 0.5) * 0.45;
      x += Math.cos(angle);
      y += Math.sin(angle);

      const ix = ((Math.round(x) % size) + size) % size;
      const iy = ((Math.round(y) % size) + size) % size;

      marks[iy * size + ix] -= 0.12;

      if (depth < 2 && random() < 0.025) {
        walk(
          x,
          y,
          angle + (random() < 0.5 ? 1 : -1) * 0.9,
          18 + random() * 40,
          depth + 1,
        );
      }
    }
  };

  for (let n = 0; n < count; n++) {
    walk(
      random() * size,
      random() * size,
      random() * Math.PI * 2,
      50 + random() * 150,
      0,
    );
  }
}

function weathering(
  size: number,
  random: () => number,
  scale: number,
  cracks: number,
): Float32Array {
  const marks = new Float32Array(size * size);
  const stainA = tileableNoise(size, Math.round(5 * scale), random);
  const stainB = tileableNoise(size, Math.round(11 * scale), random);
  const worn = tileableNoise(size, Math.round(7 * scale), random);

  for (let i = 0; i < marks.length; i++) {
    const stain = smooth(0.58, 0.8, stainA[i] * 0.6 + stainB[i] * 0.4);
    const patch = smooth(0.7, 0.86, worn[i]);

    marks[i] = -0.1 * stain + 0.045 * patch;
  }

  const put = (x: number, y: number, amount: number): void => {
    const ix = ((Math.round(x) % size) + size) % size;
    const iy = ((Math.round(y) % size) + size) % size;

    marks[iy * size + ix] += amount;
  };

  // Scuffs: short, thin streaks, mostly lighter (rubber and steel dragged on it).
  for (let n = 0; n < Math.round(70 * scale * scale); n++) {
    const x0 = random() * size;
    const y0 = random() * size;
    const angle = random() * Math.PI;
    const length = 8 + random() * 26;
    const amount = (random() < 0.7 ? 1 : -1) * (0.03 + random() * 0.04);

    for (let t = 0; t < length; t++) {
      const fade = 1 - Math.abs(t / length - 0.5) * 1.4;

      put(
        x0 + Math.cos(angle) * t,
        y0 + Math.sin(angle) * t,
        amount * Math.max(fade, 0.2),
      );
    }
  }

  // Oil and other dark spots.
  for (let n = 0; n < Math.round(7 * scale * scale); n++) {
    const cx = random() * size;
    const cy = random() * size;
    const radius = 5 + random() * 8;

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const d = Math.hypot(dx, dy) / radius;

        if (d < 1) {
          put(cx + dx, cy + dy, -0.14 * (1 - d * d) * (0.6 + random() * 0.4));
        }
      }
    }
  }

  addCracks(marks, size, random, Math.round(cracks * scale * scale));

  return marks;
}

/**
 * A seamless, subtle worn-concrete surface: soft large blotches, a medium
 * mottling, a fine grain and a few tiny pits. No joints or cracks, so a repeat
 * does not announce itself. Generated once at start-up (no asset to download).
 */
export function createConcreteTextures(
  size = CONCRETE_TEXTURE_SIZE,
  seed = 1337,
  options: { tileMetres?: number; cracks?: number } = {},
): ConcreteTextures {
  const tileMetres = options.tileMetres ?? CONCRETE_TILE_METRES;
  // Features keep their size in metres whatever the tile: a bigger tile just
  // holds more of them (and so repeats less).
  const scale = tileMetres / 4;
  const random = mulberry32(seed);
  const height = new Float32Array(size * size);
  // Frequency (lattice cells per tile) and weight of each layer.
  const octaves: Array<[number, number]> = [
    [Math.round(3 * scale), 0.3],
    [Math.round(6 * scale), 0.22],
    [Math.round(12 * scale), 0.18],
    [Math.round(24 * scale), 0.14],
    [Math.round(48 * scale), 0.1],
    [Math.round(96 * scale), 0.06],
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

  const marks = weathering(size, random, scale, options.cracks ?? 0);
  const color = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const at = (x: number, y: number): number =>
    height[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      // Mid-grey around 0.62, with the blotches and grain on top.
      let value =
        0.62 + (height[i] - 0.5) * 0.7 + (grain[i] - 0.5) * 0.09 + marks[i];

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

  return {
    tileMetres,
    color: make(color, true),
    normal: make(normal, false),
  };
}
