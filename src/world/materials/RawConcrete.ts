import * as THREE from "three";

import { mulberry32, tileableNoise } from "./ConcreteTexture";
import { useWorldSpaceUv } from "./WorldSpaceUv";

/**
 * Two unfinished surfaces for the parts of the building that were never
 * completed: exposed concrete blockwork (CMU blocks laid in stretcher bond,
 * mortar left raw) and board-formed cast concrete (plywood panel seams, tie
 * holes, honeycombing and a few patched repairs). Both are generated once at
 * start-up, are seamless, and are scaled in world metres like the other walls.
 */

export type RawSurface = "blockwork" | "formwork";

interface RawTextures {
  color: THREE.DataTexture;
  normal: THREE.DataTexture;
  roughness: THREE.DataTexture;
  tileMetres: number;
}

/** Metres of wall per repeat: 10 blocks across and 20 courses high. */
export const BLOCK_TILE_METRES = 4;
/** Metres of wall per repeat: 4 sheets (1.2 m) across and 2 high (2.4 m). */
export const FORM_TILE_METRES = 4.8;

function hash(a: number, b: number): number {
  let h =
    Math.imul(a ^ 0x9e3779b1, 0x85ebca6b) ^
    Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);

  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;

  return (h >>> 0) / 4294967296;
}

function make(
  size: number,
  color: Uint8Array,
  rough: Uint8Array,
  height: Float32Array,
  strength: number,
  tileMetres: number,
): RawTextures {
  const normal = new Uint8Array(size * size * 4);
  const at = (x: number, y: number): number =>
    height[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
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

  const texture = (data: Uint8Array, srgb: boolean): THREE.DataTexture => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);

    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true;

    return t;
  };

  return {
    color: texture(color, true),
    normal: texture(normal, false),
    roughness: texture(rough, false),
    tileMetres,
  };
}

/** Blockwork: 0.4 x 0.2 m grey blocks, raw mortar, patchy and chipped. */
export function createBlockworkTextures(size = 768, seed = 5113): RawTextures {
  const random = mulberry32(seed);
  const blockW = size / 10;
  const blockH = size / 20;
  const mortar = Math.max(3, Math.round(size / 240));
  const grime = tileableNoise(size, 8, random);
  const blotch = tileableNoise(size, 32, random);
  const grain = tileableNoise(size, 256, random);
  const color = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    const course = Math.floor(y / blockH);
    const inY = y - course * blockH;
    // Stretcher bond: every other course starts half a block along.
    const shift = course % 2 === 1 ? blockW / 2 : 0;

    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const sx = (x + shift) % size;
      const col = Math.floor(sx / blockW);
      const inX = sx - col * blockW;
      const edge = Math.min(inX, blockW - 1 - inX, inY, blockH - 1 - inY);
      const isMortar = edge < mortar / 2;
      const tone = hash(course, col);
      const wear = grime[i] * 0.5 + blotch[i] * 0.35 + grain[i] * 0.15;
      // A few blocks are discoloured (damp or a different batch), a few chipped.
      const odd = hash(course * 5 + 2, col * 3 + 7);
      const damp = odd > 0.9;
      const chipped = odd < 0.05 && inX < blockW * 0.3 && inY < blockH * 0.5;
      let level: number;
      let h: number;
      let roughness: number;

      if (isMortar) {
        // Raw mortar, a touch lighter than the block, recessed and rough.
        level = 0.3 + wear * 0.07;
        h = 0.18;
        roughness = 0.95;
      } else {
        const bevel = Math.min((edge - mortar / 2) / 3, 1);

        level =
          0.36 + tone * 0.1 + (wear - 0.5) * 0.08 + (grain[i] - 0.5) * 0.06;
        h = 0.62 + bevel * 0.25 + (grain[i] - 0.5) * 0.18;
        roughness = 0.9 + grain[i] * 0.06;

        if (damp) {
          level *= 0.78;
        }

        if (chipped) {
          level *= 0.6;
          h -= 0.22;
        }
      }

      const warm = isMortar ? 1.03 : 0.985;
      const r = Math.min(level * warm, 1);
      const g = Math.min(level, 1);
      const b = Math.min(level * (isMortar ? 0.97 : 1.03), 1);

      color[i * 4] = Math.round(r * 255);
      color[i * 4 + 1] = Math.round(g * 255);
      color[i * 4 + 2] = Math.round(b * 255);
      color[i * 4 + 3] = 255;
      rough[i * 4] = Math.round(roughness * 255);
      rough[i * 4 + 1] = rough[i * 4];
      rough[i * 4 + 2] = rough[i * 4];
      rough[i * 4 + 3] = 255;
      height[i] = h;
    }
  }

  return make(size, color, rough, height, 5, BLOCK_TILE_METRES);
}

/** Board-formed concrete: sheet seams, tie holes, honeycombing and repairs. */
export function createFormworkTextures(size = 768, seed = 7219): RawTextures {
  const random = mulberry32(seed);
  const sheetW = size / 4;
  const sheetH = size / 2;
  const per = size / FORM_TILE_METRES;
  const grime = tileableNoise(size, 6, random);
  const blotch = tileableNoise(size, 24, random);
  const fine = tileableNoise(size, 200, random);
  const color = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  // Horizontal board streaks: a value per row, per sheet, so each sheet reads
  // as its own plywood board with its own grain.
  const rows = new Float32Array(size * 2);

  for (let i = 0; i < rows.length; i++) {
    rows[i] = random();
  }

  // Tie holes: a regular grid of round recesses, 0.3 m in from each sheet corner.
  const holeAt = (x: number, y: number): number => {
    const lx = ((x % sheetW) + sheetW) % sheetW;
    const ly = ((y % sheetH) + sheetH) % sheetH;
    let best = 99;

    for (const hx of [0.3 * per, sheetW - 0.3 * per]) {
      for (const hy of [0.3 * per, sheetH / 2, sheetH - 0.3 * per]) {
        best = Math.min(best, Math.hypot(lx - hx, ly - hy));
      }
    }

    return best;
  };

  // A few patched repairs: lighter, smoother rectangles with a thin dark edge.
  const patches = [
    { x: 0.2, y: 0.55, w: 0.12, h: 0.1 },
    { x: 0.62, y: 0.2, w: 0.1, h: 0.14 },
    { x: 0.85, y: 0.75, w: 0.13, h: 0.09 },
  ].map((p) => ({
    x0: p.x * size,
    y0: p.y * size,
    x1: (p.x + p.w) * size,
    y1: (p.y + p.h) * size,
  }));

  for (let y = 0; y < size; y++) {
    const sheetY = Math.floor(y / sheetH);
    const ly = y - sheetY * sheetH;

    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const sheetX = Math.floor(x / sheetW);
      const lx = x - sheetX * sheetW;
      const sheet = hash(sheetX, sheetY);
      const seamX = Math.min(lx, sheetW - 1 - lx);
      const seamY = Math.min(ly, sheetH - 1 - ly);
      const seam = Math.min(seamX, seamY);
      const wear = grime[i] * 0.5 + blotch[i] * 0.35 + fine[i] * 0.15;
      const streak = rows[(Math.floor(y / 2) + sheetX * 37) % rows.length];
      let level = 0.4 + sheet * 0.06 + (wear - 0.5) * 0.12;
      let h = 0.6 + (fine[i] - 0.5) * 0.1 + (streak - 0.5) * 0.04;
      let roughness = 0.88 + fine[i] * 0.07;

      // Board grain: faint horizontal streaks.
      level += (streak - 0.5) * 0.035;

      // The seams between sheets: a recessed line with a thin fin of grout
      // squeezed out, and a dark stain running down below the horizontal ones.
      if (seam < 3) {
        level *= 0.62;
        h -= 0.3;
      } else if (seam < 5) {
        level *= 0.92;
        h += 0.08;
      }

      if (seamX < 10 && ly > 6) {
        level += 0.015 * (1 - seamX / 10);
      }

      // Tie holes.
      const hole = holeAt(x, y);

      if (hole < per * 0.02) {
        level *= 0.32;
        h -= 0.45;
      } else if (hole < per * 0.034) {
        level *= 0.82;
        h += 0.06;
      }

      // Honeycombing: dark pitted blotches where the concrete did not fill.
      if (blotch[i] > 0.935 && fine[i] > 0.64) {
        level *= 0.5;
        h -= 0.25;
        roughness = 0.97;
      }

      // Patched repairs.
      for (const p of patches) {
        if (x > p.x0 && x < p.x1 && y > p.y0 && y < p.y1) {
          const border = Math.min(x - p.x0, p.x1 - x, y - p.y0, p.y1 - y);

          level = border < 2 ? level * 0.7 : level * 1.12 + 0.02;
          h = border < 2 ? h - 0.15 : 0.62;
        }
      }

      const r = Math.min(level * 1.0, 1);
      const g = Math.min(level * 1.0, 1);
      const b = Math.min(level * 1.025, 1);

      color[i * 4] = Math.round(r * 255);
      color[i * 4 + 1] = Math.round(g * 255);
      color[i * 4 + 2] = Math.round(b * 255);
      color[i * 4 + 3] = 255;
      rough[i * 4] = Math.round(Math.min(roughness, 0.96) * 255);
      rough[i * 4 + 1] = rough[i * 4];
      rough[i * 4 + 2] = rough[i * 4];
      rough[i * 4 + 3] = 255;
      height[i] = h;
    }
  }

  return make(size, color, rough, height, 4, FORM_TILE_METRES);
}

/** The material of an unfinished surface (a cool grey tint over its texture). */
export function createRawMaterial(
  kind: RawSurface,
  textures: RawTextures,
): THREE.MeshStandardMaterial {
  const block = kind === "blockwork";
  const material = new THREE.MeshStandardMaterial({
    name: block ? "ExposedBlockwork" : "BoardFormedConcrete",
    color: block ? 0xb2b7bf : 0x959ba6,
    map: textures.color,
    normalMap: textures.normal,
    normalScale: new THREE.Vector2(block ? 0.9 : 0.8, block ? 0.9 : 0.8),
    roughnessMap: textures.roughness,
    roughness: 1,
    metalness: 0,
  });

  useWorldSpaceUv(material, {
    tileMetres: textures.tileMetres,
    offset: block ? [0.6, 0.3] : [1.1, 0.4],
    macro: { frequency: 0.19, strength: 0.18, baseDirt: 0.26 },
  });

  return material;
}
