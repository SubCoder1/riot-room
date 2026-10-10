import * as THREE from "three";

/**
 * A soft, lumpy puff for smoke and fire sprites: an alpha that is full in the
 * middle, falls off smoothly to nothing at the rim and is broken up by a few
 * random lobes, shaded like a lit ball (bright on the upper left, darker
 * underneath) so a handful of them read as billowing, solid smoke rather than
 * flat discs. Built in code (no image file and no canvas), once
 * per use and shared by every sprite that draws with it.
 */
export function createPuffTexture(size = 64, seed = 1): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);

  // A few random lobes: the puff is the union of soft blobs inside the disc.
  let state = seed * 9301 + 49297;
  const random = (): number => {
    state = (state * 9301 + 49297) % 233280;

    return state / 233280;
  };
  const lobes = Array.from({ length: 7 }, () => ({
    x: (random() - 0.5) * 0.7,
    y: (random() - 0.5) * 0.7,
    r: 0.28 + random() * 0.3,
  }));

  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = (i + 0.5) / size - 0.5;
      const y = (j + 0.5) / size - 0.5;
      const radial = Math.min(Math.sqrt(x * x + y * y) / 0.5, 1);
      let blob = 0;

      for (const lobe of lobes) {
        const d = Math.hypot(x - lobe.x, y - lobe.y) / lobe.r;

        blob = Math.max(blob, 1 - Math.min(d, 1));
      }

      // Solid inside, a short soft edge: a defined puffy outline.
      const t = Math.min(Math.max((radial - 0.5) / 0.5, 0), 1);
      const rim = 1 - t * t * (3 - 2 * t);
      const alpha = Math.min(1, rim * (0.55 + 1.0 * blob));
      // A lit sphere: the normal from the disc, light from the upper left.
      const nz = Math.sqrt(Math.max(1 - radial * radial, 0));
      const lit = Math.max(0, (-x * 0.9 + y * 1.2) * 0.9 + nz * 0.6);
      const shade = Math.min(1, 0.55 + 0.5 * lit);
      const at = (j * size + i) * 4;
      const grey = Math.round(shade * 255);

      data[at] = grey;
      data[at + 1] = grey;
      data[at + 2] = grey;
      data[at + 3] = Math.round(alpha * 255);
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);

  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  return texture;
}

/**
 * A soft, irregular blotch for dirt, stains and dust laid on a floor: white
 * with an alpha that is full toward the middle and wanders out to a ragged,
 * feathered edge (a union of a few round lobes). Tinted by the mark that uses
 * it. Built in code, shared by every mark.
 */
export function createStainTexture(size = 64, seed = 5): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  let state = seed * 7919 + 104729;
  const random = (): number => {
    state = (state * 9301 + 49297) % 233280;

    return state / 233280;
  };
  const lobes = Array.from({ length: 9 }, () => ({
    x: (random() - 0.5) * 0.55,
    y: (random() - 0.5) * 0.55,
    r: 0.16 + random() * 0.2,
  }));

  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = (i + 0.5) / size - 0.5;
      const y = (j + 0.5) / size - 0.5;
      let blob = 0;

      for (const lobe of lobes) {
        const d = Math.hypot(x - lobe.x, y - lobe.y) / lobe.r;

        blob = Math.max(blob, 1 - Math.min(d, 1));
      }

      // Feather: the blob itself, softened, and nothing at the very rim.
      const radial = Math.min(Math.hypot(x, y) / 0.5, 1);
      const fade = 1 - radial * radial * (3 - 2 * radial);
      const alpha = Math.min(1, Math.pow(blob, 0.8) * 1.2) * fade;
      const at = (j * size + i) * 4;

      data[at] = 255;
      data[at + 1] = 255;
      data[at + 2] = 255;
      data[at + 3] = Math.round(alpha * 255);
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);

  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  return texture;
}
