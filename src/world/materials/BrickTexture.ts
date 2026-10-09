import * as THREE from "three";

import { mulberry32, tileableNoise } from "./ConcreteTexture";

/** Pixels along one side of the (square, seamless) brick textures. */
export const BRICK_TEXTURE_SIZE = 512;

/** Metres of wall covered by one repeat: 4 bricks across and 8 courses high. */
export const BRICK_TILE_METRES = 2;

export interface BrickTextures {
  /** Dark, desaturated brown-red bricks in dark grey-brown mortar. */
  color: THREE.DataTexture;
  /** Tangent-space normal map: bevelled bricks, recessed mortar. */
  normal: THREE.DataTexture;
  /** Roughness in the green channel (0.80 to 0.95 across brick and mortar). */
  roughness: THREE.DataTexture;
}

const BRICKS_ACROSS = 4;
const COURSES = 8;

function hash(a: number, b: number): number {
  let h =
    Math.imul(a ^ 0x9e3779b1, 0x85ebca6b) ^
    Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);

  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;

  return (h >>> 0) / 4294967296;
}

/**
 * A seamless running-bond brick wall, 0.5 x 0.25 m bricks (stylised, readable
 * at gameplay distance): each brick a little different in tone, a dark mortar
 * line, a worn bevel and grime. Generated once at start-up, no asset to ship.
 */
export function createBrickTextures(
  size = BRICK_TEXTURE_SIZE,
  seed = 2024,
): BrickTextures {
  const random = mulberry32(seed);
  const brickW = size / BRICKS_ACROSS;
  const brickH = size / COURSES;
  const mortar = Math.max(2, Math.round(size / 170));
  // Soft grime (low frequency) and fine pitting (high frequency), both seamless.
  const grime = tileableNoise(size, 4, random);
  const blotch = tileableNoise(size, 16, random);
  const pits = tileableNoise(size, 96, random);

  const color = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    const course = Math.floor(y / brickH);
    const inCourseY = y - course * brickH;
    // Running bond: every other course is shifted by half a brick.
    const shift = course % 2 === 1 ? brickW / 2 : 0;

    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const sx = (x + shift) % size;
      const column = Math.floor(sx / brickW);
      const inBrickX = sx - column * brickW;
      const edge = Math.min(
        inBrickX,
        brickW - 1 - inBrickX,
        inCourseY,
        brickH - 1 - inCourseY,
      );
      const isMortar = edge < mortar / 2;
      // Per-brick tone: some darker, some warmer.
      const tone = hash(course, column);
      const warm = hash(column + 11, course + 5);
      const wear = grime[i] * 0.5 + blotch[i] * 0.35 + pits[i] * 0.15;
      let r: number;
      let g: number;
      let b: number;
      let h: number;
      let roughness: number;

      if (isMortar) {
        const m = 0.2 + wear * 0.1;

        r = m * 1.05;
        g = m;
        b = m * 0.95;
        h = 0;
        roughness = 0.95;
      } else {
        // Dark desaturated brown-red: about #3a2926 on average, before lighting.
        const base = 0.17 + tone * 0.07 + (wear - 0.5) * 0.06;
        const bevel = Math.min((edge - mortar / 2) / 3, 1);

        r = base * (1.42 + warm * 0.18);
        g = base * (1.05 - warm * 0.08);
        b = base * (0.92 - warm * 0.08);
        h =
          0.55 +
          bevel * 0.3 +
          (pits[i] - 0.5) * 0.14 +
          (blotch[i] - 0.5) * 0.08;
        roughness = 0.82 + pits[i] * 0.08 + (1 - bevel) * 0.03;
      }

      color[i * 4] = Math.round(Math.min(r, 1) * 255);
      color[i * 4 + 1] = Math.round(Math.min(g, 1) * 255);
      color[i * 4 + 2] = Math.round(Math.min(b, 1) * 255);
      color[i * 4 + 3] = 255;

      const byte = Math.round(Math.min(Math.max(roughness, 0.8), 0.95) * 255);

      rough[i * 4] = byte;
      rough[i * 4 + 1] = byte;
      rough[i * 4 + 2] = byte;
      rough[i * 4 + 3] = 255;
      height[i] = h;
    }
  }

  const normal = new Uint8Array(size * size * 4);
  const at = (x: number, y: number): number =>
    height[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const strength = 5;
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
