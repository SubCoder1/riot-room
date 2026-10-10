import * as THREE from "three";

import { mulberry32, tileableNoise } from "./ConcreteTexture";

/** Pixels along one side of the (square, seamless) metal wear texture. */
export const METAL_TEXTURE_SIZE = 512;

/** Metres of metal covered by one repeat. */
export const METAL_TILE_METRES = 6;

/**
 * Restrained wear for steel: near-white (the material colour does the tinting)
 * with scratches (thin, a little lighter or darker), a few clusters of rust
 * (a warm brown-orange, mostly pinprick specks and small flaking patches) and a
 * slight unevenness. It tiles seamlessly and is generated once at start-up.
 */
export function createMetalTexture(
  size = METAL_TEXTURE_SIZE,
  seed = 4242,
): THREE.DataTexture {
  const random = mulberry32(seed);
  const unevenness = tileableNoise(size, 12, random);
  const rustMass = tileableNoise(size, 10, random);
  const rustFine = tileableNoise(size, 80, random);
  const data = new Float32Array(size * size * 3);

  for (let i = 0; i < size * size; i++) {
    const v = 0.93 + (unevenness[i] - 0.5) * 0.12;

    data[i * 3] = v;
    data[i * 3 + 1] = v;
    data[i * 3 + 2] = v;

    // Rust where the mass noise is high, and only as specks and flakes.
    const mass = Math.min(Math.max((rustMass[i] - 0.6) / 0.3, 0), 1);
    const speck = Math.min(Math.max((rustFine[i] - 0.42) / 0.5, 0), 1);
    const rust = mass * speck;

    if (rust > 0) {
      data[i * 3] = v * (1 - 0.06 * rust);
      data[i * 3 + 1] = v * (1 - 0.24 * rust);
      data[i * 3 + 2] = v * (1 - 0.38 * rust);
    }
  }

  // Scratches: thin lines, mostly lighter (bare bright metal), some darker.
  for (let n = 0; n < 184; n++) {
    const x0 = random() * size;
    const y0 = random() * size;
    const angle = random() * Math.PI;
    const length = 10 + random() * 60;
    const amount = (random() < 0.65 ? 1 : -1) * (0.05 + random() * 0.07);

    for (let t = 0; t < length; t++) {
      const x =
        (((Math.round(x0 + Math.cos(angle) * t) % size) + size) % size) | 0;
      const y =
        (((Math.round(y0 + Math.sin(angle) * t) % size) + size) % size) | 0;
      const i = y * size + x;

      for (let c = 0; c < 3; c++) {
        data[i * 3 + c] = Math.min(Math.max(data[i * 3 + c] + amount, 0), 1);
      }
    }
  }

  const bytes = new Uint8Array(size * size * 4);

  for (let i = 0; i < size * size; i++) {
    bytes[i * 4] = Math.round(data[i * 3] * 255);
    bytes[i * 4 + 1] = Math.round(data[i * 3 + 1] * 255);
    bytes[i * 4 + 2] = Math.round(data[i * 3 + 2] * 255);
    bytes[i * 4 + 3] = 255;
  }

  const texture = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);

  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  return texture;
}
