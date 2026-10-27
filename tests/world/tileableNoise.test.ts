import { describe, expect, it } from "vitest";

import {
  mulberry32,
  tileableNoise,
} from "../../src/world/materials/ConcreteTexture";

/** The plain version of the noise (every value worked out for every pixel). */
function reference(
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

describe("tileableNoise", () => {
  it("gives exactly the same values as the plain version", () => {
    for (const [size, freq] of [
      [64, 5],
      [128, 32],
      [256, 192],
      [100, 7],
    ] as const) {
      const a = tileableNoise(size, freq, mulberry32(1234 + freq));
      const b = reference(size, freq, mulberry32(1234 + freq));

      expect(a.length).toBe(b.length);
      expect(a.every((v, i) => v === b[i])).toBe(true);
    }
  });
});
