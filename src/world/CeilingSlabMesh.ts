import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import {
  CEILING_SLAB_BULB_Y,
  CEILING_SLAB_COVER,
  CEILING_SLAB_COVER_TOP,
  CEILING_SLAB_FLOOR,
  CEILING_SLAB_ID,
} from "./CeilingSlab";
import { mulberry32 } from "./materials/ConcreteTexture";

/** Pixels along one side of the (square) wood texture. */
const WOOD_SIZE = 128;

/** The boards across the opening. */
const PLANKS = 7;

/**
 * Dark, weathered wood, the grain running down the texture's v axis (along a
 * board): long streaks that wander a little, a few darker knots and a faint
 * grey bloom. Generated once, no asset to ship.
 */
export function createWoodTexture(seed = 4417): THREE.DataTexture {
  const random = mulberry32(seed);
  const data = new Uint8Array(WOOD_SIZE * WOOD_SIZE * 4);
  const streak = new Float32Array(WOOD_SIZE);
  const wander = new Float32Array(WOOD_SIZE);

  for (let x = 0; x < WOOD_SIZE; x++) {
    // A smooth run of random values, so neighbouring columns agree a little.
    streak[x] = (x > 0 ? streak[x - 1] * 0.55 : 0) + random() * 0.45;
    wander[x] = random() * 6.28;
  }

  const knots = Array.from({ length: 3 }, () => ({
    x: random() * WOOD_SIZE,
    y: random() * WOOD_SIZE,
    r: 4 + random() * 4,
  }));

  for (let y = 0; y < WOOD_SIZE; y++) {
    for (let x = 0; x < WOOD_SIZE; x++) {
      const bend = Math.sin(y * 0.05 + wander[x % 16]) * 2.2;
      const column = Math.floor(x + bend + WOOD_SIZE) % WOOD_SIZE;
      const ring = 0.5 + 0.5 * Math.sin((x + bend) * 0.9 + streak[column] * 5);
      let light = 0.55 + streak[column] * 0.35 + ring * 0.2;

      for (const knot of knots) {
        const d = Math.hypot(x - knot.x, (y - knot.y) * 0.5) / knot.r;

        if (d < 1) {
          light *= 0.55 + 0.45 * d;
        }
      }

      light *= 0.88 + random() * 0.12;

      const i = (y * WOOD_SIZE + x) * 4;

      // Old dry timber: charcoal-brown, little orange or red in it.
      // The edges are darker (dirt and shadow where a board meets the next).
      const edge =
        Math.min(x, WOOD_SIZE - 1 - x, (y + 4) % WOOD_SIZE, WOOD_SIZE - 1 - y) /
        7;
      const dirt = 0.55 + 0.45 * Math.min(1, edge);

      data[i] = Math.min(255, (44 * light + 6) * dirt);
      data[i + 1] = Math.min(255, (38 * light + 6) * dirt);
      data[i + 2] = Math.min(255, (31 * light + 6) * dirt);
      data[i + 3] = 255;
    }
  }

  // Scratches: short pale lines along the grain.
  for (let k = 0; k < 16; k++) {
    const sx = Math.floor(random() * WOOD_SIZE);
    const sy = Math.floor(random() * WOOD_SIZE);
    const len = 8 + Math.floor(random() * 30);

    for (let t = 0; t < len; t++) {
      const i = (((sy + t) % WOOD_SIZE) * WOOD_SIZE + sx) * 4;

      data[i] = Math.min(255, data[i] * 1.35);
      data[i + 1] = Math.min(255, data[i + 1] * 1.35);
      data[i + 2] = Math.min(255, data[i + 2] * 1.35);
    }
  }

  const texture = new THREE.DataTexture(data, WOOD_SIZE, WOOD_SIZE);

  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  return texture;
}

/**
 * The slab's one light: the room's hanging bulb. The wood is lit by the
 * scene's lights like anything else (so it stays dark where nothing shines on
 * it) and, because the bulb's own light is a cone pointing down at the floor,
 * by the bulb's glow from below through these uniforms: warm, falling off with
 * the square of the distance and the angle to each board. Out when it breaks.
 */
export const slabBulb = {
  position: { value: new THREE.Vector3() },
  colour: { value: new THREE.Color(0xe8a05e) },
  power: { value: 1 },
};

/** Wood of three shades, so the boards are not one cut. */
export function createWoodMaterials(): THREE.MeshStandardMaterial[] {
  const map = createWoodTexture();

  return [0xffffff, 0xd4cec6, 0xb2aca4].map((color) => {
    const material = new THREE.MeshStandardMaterial({
      name: "SlabWood",
      map,
      color,
      roughness: 0.95,
      metalness: 0,
    });

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uBulbPos = slabBulb.position;
      shader.uniforms.uBulbColour = slabBulb.colour;
      shader.uniforms.uBulbPower = slabBulb.power;
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "void main() {",
          `uniform vec3 uBulbPos;
           uniform vec3 uBulbColour;
           uniform float uBulbPower;
           void main() {`,
        )
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
           {
             vec3 bulb = (viewMatrix * vec4(uBulbPos, 1.0)).xyz;
             vec3 toBulb = bulb + vViewPosition;
             float d2 = dot(toBulb, toBulb);
             float facing = max(dot(normalize(normal), normalize(toBulb)), 0.0);

             totalEmissiveRadiance += diffuseColor.rgb * uBulbColour * uBulbPower * facing * 1.5 / (1.0 + d2 * 8.0);
           }`,
        );
    };
    material.customProgramCacheKey = (): string => "slab-wood-bulb";

    return material;
  });
}

/** How many meshes (and geometries) the slab is drawn with: three woods and the bulb's three fittings. */
export const CEILING_SLAB_MESHES = 6;

/**
 * A gap in the roof covered by seven thick, dark, weathered boards laid across
 * it, a little uneven in width, level and ends, some with a slit between them
 * and one or two with a corner broken off. Nothing else: no frame, supports,
 * brackets or hinge. Named `slab:<id>`; the game hides it when it breaks. The
 * bulb's rose, flex and socket hang from the ceiling here and go with it.
 */
export function createCeilingSlabMesh(): THREE.Group {
  const area = CEILING_SLAB_COVER;
  const width = area.maxX - area.minX;
  const length = area.maxZ - area.minZ;
  const top = CEILING_SLAB_COVER_TOP;
  const centreX = (area.minX + area.maxX) / 2;
  const centreZ = (area.minZ + area.maxZ) / 2;
  const random = mulberry32(2207);

  slabBulb.position.value.set(
    centreX,
    CEILING_SLAB_FLOOR + CEILING_SLAB_BULB_Y,
    centreZ,
  );
  const woods = createWoodMaterials();
  const group = new THREE.Group();
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const add = (
    material: THREE.Material,
    size: [number, number, number],
    at: [number, number, number],
    turn = 0,
  ): void => {
    const geometry = new THREE.BoxGeometry(...size);

    geometry.rotateY(turn);
    geometry.translate(...at);
    parts.set(material, [...(parts.get(material) ?? []), geometry]);
  };

  group.name = `slab:${CEILING_SLAB_ID}`;

  // What the room's bulb hangs from: a porcelain rose in the ceiling, a black
  // flex and a bakelite socket with a brass collar (as `bulbFitting`).
  const porcelain = new THREE.MeshStandardMaterial({
    name: "SlabRose",
    color: 0xcfc8b6,
    roughness: 0.7,
  });
  const flex = new THREE.MeshStandardMaterial({
    name: "SlabFlex",
    color: 0x2a2420,
    roughness: 0.7,
  });
  const brass = new THREE.MeshStandardMaterial({
    name: "SlabBrass",
    color: 0x8a7a4a,
    roughness: 0.5,
    metalness: 0.5,
  });
  const upright = (
    material: THREE.Material,
    from: number,
    height: number,
    diameter: number,
  ): void => {
    const geometry = new THREE.CylinderGeometry(
      diameter / 2,
      diameter / 2,
      height,
      12,
    );

    geometry.translate(centreX, from + height / 2, centreZ);
    parts.set(material, [...(parts.get(material) ?? []), geometry]);
  };
  const ceiling = CEILING_SLAB_FLOOR + 3.8;
  const bulbY = CEILING_SLAB_FLOOR + CEILING_SLAB_BULB_Y;

  upright(porcelain, ceiling - 0.05, 0.05, 0.11);
  upright(flex, ceiling - 0.07, 0.02, 0.06);
  upright(flex, bulbY + 0.2, ceiling - 0.07 - (bulbY + 0.2), 0.014);
  upright(flex, bulbY + 0.1, 0.1, 0.055);
  upright(brass, bulbY + 0.085, 0.025, 0.062);

  // Six boards laid side by side across the gap: a hair narrow between some
  // (a slit of light), tight against the next elsewhere; each a little
  // different in width, in height and in how it ends. Nothing under or round
  // them: they cover the opening and nothing more.
  const slits = Array.from({ length: PLANKS - 1 }, () =>
    random() < 0.5 ? 0.03 : 0.006,
  );
  const spare = width - slits.reduce((sum, g) => sum + g, 0);
  const shares = Array.from({ length: PLANKS }, () => 0.85 + random() * 0.3);
  const shareSum = shares.reduce((sum, v) => sum + v, 0);
  let edge = area.minX;

  for (let i = 0; i < PLANKS; i++) {
    const plankWidth = (spare * shares[i]) / shareSum;
    const x = edge + plankWidth / 2;
    // Ends a little uneven: each board stops a touch short, or sits proud.
    const shortA = random() * 0.025;
    const shortB = random() * 0.025;
    const run = length - shortA - shortB;
    const level = top - random() * 0.015;
    const thickness = 0.22 + random() * 0.03;
    const turn = (random() - 0.5) * 0.01;
    const wood = woods[i % woods.length];
    // One end in three has a corner broken off: a notch.
    const notch = random() < 0.35 ? 0.07 + random() * 0.07 : 0;
    const notchAtStart = random() < 0.5;
    const body = run - notch;
    const bodyStart = area.minZ + shortA + (notch && notchAtStart ? notch : 0);

    add(
      wood,
      [plankWidth, thickness, body],
      [x, level - thickness / 2, bodyStart + body / 2],
      turn,
    );

    if (notch > 0) {
      const narrow = plankWidth * (0.45 + random() * 0.2);
      const nz = notchAtStart
        ? area.minZ + shortA + notch / 2
        : area.maxZ - shortB - notch / 2;

      add(
        wood,
        [narrow, thickness, notch],
        [x + (plankWidth - narrow) / 2, level - thickness / 2, nz],
        turn,
      );
    }

    edge += plankWidth + (slits[i] ?? 0);
  }

  for (const [material, geometries] of parts) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries, false), material);

    mesh.castShadow = false;
    mesh.receiveShadow = true;
    group.add(mesh);
    geometries.forEach((geometry) => geometry.dispose());
  }

  return group;
}
