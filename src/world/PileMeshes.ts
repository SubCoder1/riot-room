import * as THREE from "three";
import {
  mergeGeometries,
  mergeVertices,
  toCreasedNormals,
} from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type {
  ArenaLayout,
  PileDefinition,
  PileElement,
  PileKind,
} from "./ArenaLayout";
import { createStainTexture } from "../vfx/SoftTexture";
import {
  WEAR_MASONRY,
  WEAR_METAL,
  WEAR_PLASTIC,
  WEAR_RUBBLE,
  WEAR_BRICK,
  WEAR_WOOD,
  weather,
} from "./materials/SurfaceWear";

/**
 * Draws the piles of building material and the dirt on the floors: four merged
 * meshes for the pieces (bags, bricks, planks, chunks: a handful of draw calls
 * for the whole map, however many piles), and one for every flat mark. Colours
 * live in the vertices, so there is one plain material for the pieces and one
 * texture (a soft blotch) for the marks.
 */

/** The printing on a cement bag: a muted blue-grey. */
const BAG_PRINT = new THREE.Color(0x3d4c68);
/** The paper label panel and the dust that settles on a bag. */
const BAG_LABEL = new THREE.Color(0xd9d3c1);
const BAG_DUST = new THREE.Color(0xb9b2a1);

const rubbleMaterial = weather(
  new THREE.MeshStandardMaterial({
    name: "PileRubble",
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
    flatShading: true,
  }),
  "concrete",
  { exposure: 0.8 },
);

const pipeMaterial = weather(
  new THREE.MeshStandardMaterial({
    name: "PilePipes",
    vertexColors: true,
    roughness: 0.55,
    metalness: 0.55,
  }),
  "mixed",
  { exposure: 0.9 },
);

/** Insulated cable: dull rubber, not shiny metal. */
const cableMaterial = weather(
  new THREE.MeshStandardMaterial({
    name: "PileCables",
    vertexColors: true,
    roughness: 0.88,
    metalness: 0,
  }),
  "mixed",
  { exposure: 0.8 },
);

const pieceMaterial = weather(
  new THREE.MeshStandardMaterial({
    name: "PilePieces",
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
  }),
  "mixed",
  { exposure: 0.8 },
);

let stainTexture: THREE.DataTexture | null = null;

const decalMaterial = (): THREE.MeshStandardMaterial => {
  stainTexture ??= createStainTexture(64, 5);

  return new THREE.MeshStandardMaterial({
    name: "FloorMarks",
    map: stainTexture,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    roughness: 1,
    metalness: 0,
  });
};

/**
 * A 1 x 1 x 1 sack of cement: a box reshaped into what a filled paper bag does
 * when it is laid down. The middle is fat and the ends are pinched flat where
 * they are sewn, the top is a soft dome and the underside is settled and
 * flatter, the corners are rounded off and a few fine wrinkles run across it.
 * Dense enough to keep these curves, still only a few hundred triangles.
 */
function pillowGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(1, 1, 1, 8, 3, 6);
  const position = geometry.getAttribute("position");

  for (let i = 0; i < position.count; i++) {
    let x = position.getX(i);
    let y = position.getY(i);
    let z = position.getZ(i);
    // -1 to 1 along the length, the width and the thickness.
    const u = x * 2;
    const v = z * 2;
    const w = y * 2;
    const middle = Math.max(1 - u * u, 0) * Math.max(1 - v * v, 0);
    // Ends pinched: thinner and a touch narrower where it is sewn shut.
    const endPinch = 1 - 0.5 * Math.pow(Math.abs(u), 3);
    // Corners rounded off.
    const round =
      1 - 0.1 * Math.pow(Math.abs(v), 4) - 0.1 * Math.pow(Math.abs(u), 4);

    x *= 1 - 0.08 * v * v;
    z *= (1 - 0.14 * u * u) * round;
    y *= endPinch;
    // The top is a dome, the underside only a little rounded.
    y += Math.sign(w) * middle * (w > 0 ? 0.15 : 0.04);
    // Fine wrinkles across the top and the sides.
    y += Math.sign(w) * 0.012 * Math.sin(u * 13 + v * 4) * (1 - Math.abs(u));

    position.setXYZ(i, x, y, z);
  }

  geometry.computeVertexNormals();

  return geometry;
}

/** A 1 x 1 x 1 plank, cut into lengths so its colour can run like grain. */
function plankGeometry(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(1, 1, 1, 8, 1, 1);
}

/**
 * A 1 x 1 x 1 pipe lying along x (its length 1, its diameter 1): a twelve-sided
 * cylinder with open ends, whose cut rims and dark insides are coloured in
 * `placed` so it reads as hollow.
 */
function pipeGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 8, false);

  geometry.rotateZ(Math.PI / 2);

  return geometry;
}

/** A 1 x 1 x 1 closed cylinder lying along x: a length of cable. */
function cableGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1, false);

  geometry.rotateZ(Math.PI / 2);

  return geometry;
}

function brickGeometry(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
}

function chunkGeometry(): THREE.BufferGeometry {
  // An icosahedron roughened by a few fixed bumps: angular and not a ball.
  const geometry = new THREE.IcosahedronGeometry(0.5, 0);
  const position = geometry.getAttribute("position");

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const bump =
      1 + 0.22 * Math.sin(x * 29 + y * 17) * Math.cos(z * 23 - x * 11);

    position.setXYZ(i, x * bump, y * bump, z * bump);
  }

  geometry.computeVertexNormals();

  return geometry;
}

/** A cheap repeatable 0..1 number from a point. */
function noise3(x: number, y: number, z: number, salt: number): number {
  const n =
    Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + salt * 19.19) * 43758.5453;

  return n - Math.floor(n);
}

/** Smooth value noise in 0..1 (so a rock's surface has hills and not static). */
function smooth3(x: number, y: number, z: number, salt: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const at = (a: number, b: number, c: number): number =>
    noise3(ix + a, iy + b, iz + c, salt);
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

  return lerp(
    lerp(
      lerp(at(0, 0, 0), at(1, 0, 0), u),
      lerp(at(0, 1, 0), at(1, 1, 0), u),
      v,
    ),
    lerp(
      lerp(at(0, 0, 1), at(1, 0, 1), u),
      lerp(at(0, 1, 1), at(1, 1, 1), u),
      v,
    ),
    w,
  );
}

/**
 * A broken piece of concrete or stone: a rounded lump cut flat by a few
 * planes (the faces where it broke), its corners and faces roughened by two
 * scales of noise, smooth-shaded so the lumps catch light as lumps. Three
 * variants (different cuts and hills) are mixed through every heap.
 */
function rockGeometry(variant: number): THREE.BufferGeometry {
  const raw = new THREE.IcosahedronGeometry(0.5, 3);

  raw.deleteAttribute("normal");
  raw.deleteAttribute("uv");

  const geometry = mergeVertices(raw, 1e-4);
  const position = geometry.getAttribute("position");
  const v = new THREE.Vector3();
  // The fracture planes: a direction each and how deep it cuts.
  const planes = Array.from({ length: 8 + variant * 2 }, (_, k) => ({
    n: new THREE.Vector3(
      noise3(k, variant, 1, 3) - 0.5,
      noise3(k, variant, 2, 3) - 0.5,
      noise3(k, variant, 3, 3) - 0.5,
    ).normalize(),
    d: 0.2 + 0.16 * noise3(k, variant, 4, 3),
  }));

  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);

    // Hills first, then the cuts (so the broken faces stay flat).
    const hills =
      1 +
      0.16 * (smooth3(v.x * 3.1, v.y * 3.1, v.z * 3.1, variant) - 0.5) +
      0.1 * (smooth3(v.x * 9, v.y * 9, v.z * 9, variant + 5) - 0.5);

    v.multiplyScalar(hills);

    for (const plane of planes) {
      const over = v.dot(plane.n) - plane.d;

      if (over > 0) {
        v.addScaledVector(plane.n, -over);
      }
    }

    // A little grit on the cut faces.
    v.multiplyScalar(
      1 + 0.025 * (noise3(v.x * 40, v.y * 40, v.z * 40, variant) - 0.5),
    );
    position.setXYZ(i, v.x, v.y, v.z);
  }

  // Crisp where the lump was cut, soft where it is only rounded.
  const creased = toCreasedNormals(geometry, 0.55);

  geometry.dispose();

  return creased;
}

/**
 * A slab broken from a floor or wall: a thick plate whose corners are cut off
 * on the slant (never a rectangle), its rim bitten away and its faces uneven.
 * Three variants (different cuts) are mixed through every heap.
 */
function slabGeometry(variant: number): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(1, 1, 1, 7, 2, 7);

  // (Like the rocks it is merged with: no texture coordinates.)
  geometry.deleteAttribute("uv");

  const position = geometry.getAttribute("position");
  const v = new THREE.Vector3();
  // Corner cuts: a slanted plane across each corner, each cut its own depth.
  const corners = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ].map(([sx, sz], k) => ({
    n: new THREE.Vector3(
      sx,
      (noise3(k, variant, 5, 3) - 0.5) * 0.5,
      sz,
    ).normalize(),
    d: 0.52 + 0.3 * noise3(k, variant, 6, 3),
  }));
  // Two long fractures across the plate.
  const fractures = [0, 1].map((k) => ({
    n: new THREE.Vector3(
      noise3(k, variant, 7, 3) - 0.5,
      (noise3(k, variant, 8, 3) - 0.5) * 0.4,
      noise3(k, variant, 9, 3) - 0.5,
    ).normalize(),
    d: 0.62 + 0.18 * noise3(k, variant, 10, 3),
  }));

  // Two more shapes have a deep diagonal fracture across them, a whole wedge
  // broken off: a slab snapped in two, not a block with its corners clipped.
  if (variant >= 3) {
    const turn = noise3(variant, 11, 3, 3) * Math.PI;

    fractures.push({
      n: new THREE.Vector3(
        Math.cos(turn),
        (variant - 3.5) * 0.35,
        Math.sin(turn),
      ).normalize(),
      d: 0.2 + 0.1 * noise3(variant, 12, 3, 3),
    });
  }

  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);

    const edge = Math.max(Math.abs(v.x), Math.abs(v.z)) * 2;
    // The rim is chipped: the further out, the more it is bitten away.
    const bite =
      edge > 0.6
        ? (edge - 0.6) *
          0.9 *
          smooth3(v.x * 7, v.z * 7, v.y * 3, 9 + variant) *
          2
        : 0;

    v.x -= Math.sign(v.x) * bite * 0.4;
    v.z -= Math.sign(v.z) * bite * 0.4;
    v.y -= Math.sign(v.y) * bite * 0.3;
    v.y += 0.07 * (smooth3(v.x * 5, v.z * 5, variant, 4) - 0.5);

    for (const plane of [...corners, ...fractures]) {
      const over = v.dot(plane.n) - plane.d;

      if (over > 0) {
        v.addScaledVector(plane.n, -over);
      }
    }

    position.setXYZ(i, v.x, v.y, v.z);
  }

  // (The same kind of normals as the rocks it is merged with: unindexed.)
  const creased = toCreasedNormals(geometry, 0.5);

  geometry.dispose();

  return creased;
}

/** Brown, muted and not too dark: board and plywood, not painted steel. */
function looksLikeWood(color: THREE.Color): boolean {
  const hsl = { h: 0, s: 0, l: 0 };

  color.getHSL(hsl);

  return (
    hsl.h > 0.04 && hsl.h < 0.13 && hsl.s > 0.15 && hsl.s < 0.7 && hsl.l > 0.12
  );
}

/**
 * What a piece is made of, so each gets the wear of its own stuff: boards
 * stain, drums and crates rust, bricks and bags go damp and grimy, and black
 * cable is only dusty.
 */
function wearOf(kind: PileKind, element: PileElement): number {
  const color = new THREE.Color(element.color);

  switch (element.shape) {
    case "rock":
    case "slab":
      return WEAR_RUBBLE;
    case "brick":
      return WEAR_BRICK;
    case "bag":
    case "chunk":
      return WEAR_MASONRY;
    case "pipe":
      return WEAR_METAL;
    case "cable": {
      const hsl = { h: 0, s: 0, l: 0 };

      color.getHSL(hsl);

      return hsl.l < 0.1 && hsl.s < 0.35 ? WEAR_PLASTIC : WEAR_METAL;
    }
    default:
      return kind === "fittings" && !looksLikeWood(color)
        ? WEAR_METAL
        : WEAR_WOOD;
  }
}

/** Colours a rock is blended toward (made once: not for every vertex). */
const FRACTURE = new THREE.Color(0x8d8c88);
const STAIN_GREEN = new THREE.Color(0x3d4a38);
const STAIN_RUST = new THREE.Color(0x5a3a28);
const DUST = new THREE.Color(0x4a4742);
const SOOT = new THREE.Color(0x8c887e);

function placed(
  kind: PileKind,
  source: THREE.BufferGeometry,
  element: PileElement,
  baseY: number,
  cx: number,
  cz: number,
  grain: boolean,
): THREE.BufferGeometry {
  // A copy of the source that can be moved and painted. (`clone()` also copies
  // groups, bounds and user data, which are never used here, and this is done
  // for every piece of every heap: some 18,000 times. The index is only read.)
  const geometry = new THREE.BufferGeometry();

  geometry.index = source.index;

  for (const name of Object.keys(source.attributes)) {
    geometry.setAttribute(name, source.attributes[name].clone());
  }

  const color = new THREE.Color(element.color);
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  const shade = new THREE.Color();

  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    const x = position.getX(i);
    // Darker low down (dirt and shadow), a little lighter on top.
    let k = 0.82 + (y + 0.5) * 0.3;

    if (grain) {
      // Bands along a board: a few lighter and darker runs.
      k *= 1 + 0.07 * Math.sin((x + 0.5) * 17 + element.x * 5);
    }

    shade.copy(color).multiplyScalar(k);

    if (element.shape === "cable") {
      // Plain, even insulation: no rims and no banding, so a run built from
      // many short pieces reads as one smooth cable.
      shade.copy(color).multiplyScalar(0.95);
    } else if (element.shape === "pipe") {
      const radial = Math.hypot(position.getY(i), position.getZ(i));

      if (Math.abs(x) > 0.495) {
        // The ends: a bright rim, then the dark inside of the pipe.
        if (radial > 0.4) {
          shade.copy(color).multiplyScalar(1.25);
        } else {
          shade.set(0x15171a);
        }
      } else if (Math.abs(x) > 0.43) {
        // A flange ring near each end.
        shade.multiplyScalar(1.18);
      } else {
        // Streaks along the pipe: scale and rust, a little different each way.
        shade.multiplyScalar(
          1 + 0.14 * Math.sin(position.getZ(i) * 17 + element.x * 11 + x * 3),
        );
      }
    }

    if (element.shape === "bag") {
      const along = Math.abs(x);
      const across = Math.abs(position.getZ(i));

      if (y > 0.2 && along < 0.19 && across < 0.3) {
        // The paper label on the top: pale, with a muted blue print in it.
        shade.lerp(BAG_LABEL, 0.55);

        if (along < 0.05 || (across < 0.06 && along < 0.16)) {
          shade.lerp(BAG_PRINT, 0.6);
        }
      } else if (along > 0.44) {
        // The sewn ends: darker, where the paper is folded and stitched.
        shade.multiplyScalar(0.68);
      }

      // Cement dust settled on the lower part.
      if (y < -0.12) {
        shade.lerp(BAG_DUST, 0.32);
      }
    }
    if (element.shape === "rock" || element.shape === "slab") {
      // Old dirty faces and fresh pale fractures, patches of dirt, a stain of
      // damp green or rust here and there: never one even tone.
      const px = position.getX(i);
      const py = position.getY(i);
      const pz = position.getZ(i);
      const seed = element.x * 3.7 + element.z * 5.3;
      const mottle = smooth3(px * 4 + seed, py * 4, pz * 4, 11);
      const fresh = smooth3(px * 2.2, py * 2.2 + seed, pz * 2.2, 12);

      shade.multiplyScalar(0.6 + 0.45 * mottle);
      // Grain: fine, uneven speckle across every face.
      shade.multiplyScalar(0.84 + 0.3 * noise3(px * 23, py * 23, pz * 23, 14));

      if (element.shape === "slab") {
        // The broad faces are the old wall, dirty and dark; the chipped rim
        // and the cut edges are fresh, paler and rougher.
        const rim = Math.max(Math.abs(py), Math.abs(pz)) > 0.4;

        shade.multiplyScalar(rim ? 1.2 : 0.55);
      }
      // Fracture faces (lower, to the sides) lighter than the weathered top.
      shade.lerp(
        FRACTURE,
        Math.max(0, fresh - 0.6) * 0.7 * (py < 0.2 ? 1 : 0.3),
      );

      const stain = smooth3(px * 3, py * 3 + seed, pz * 3, 13);

      if (stain > 0.72) {
        shade.lerp(
          noise3(seed, 1, 2, 3) < 0.5 ? STAIN_GREEN : STAIN_RUST,
          (stain - 0.72) * 2.2,
        );
      }

      // Dust in the low places and under the heap.
      if (py < -0.15) {
        shade.lerp(DUST, 0.35);
      }
    } else if (element.shape === "brick") {
      // A brick is never one flat colour: soot, mortar and chips.
      const mottle = noise3(
        position.getX(i) * 9,
        position.getY(i) * 9 + element.x,
        position.getZ(i) * 9 + element.z,
        2,
      );

      shade.multiplyScalar(0.78 + 0.4 * mottle);

      if (position.getY(i) > 0.4 && mottle > 0.7) {
        shade.lerp(SOOT, 0.4);
      }
    }

    colors[i * 3] = shade.r;
    colors[i * 3 + 1] = shade.g;
    colors[i * 3 + 2] = shade.b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  // What it is and its box, for the weathering: the position within the piece
  // (scaled, before it is turned) and its half size. A cylinder says so with a
  // half height of -1, a shape with no true edges with -2.
  const wear = wearOf(kind, element);
  const boxed = element.shape === "plank" || element.shape === "brick";
  const cylinder = element.shape === "pipe" || element.shape === "cable";
  const wearA = new Float32Array(position.count * 4);
  const wearB = new Float32Array(position.count * 3);

  for (let i = 0; i < position.count; i++) {
    wearA[i * 4] = position.getX(i) * element.sx;
    wearA[i * 4 + 1] = position.getY(i) * element.sy;
    wearA[i * 4 + 2] = position.getZ(i) * element.sz;
    wearA[i * 4 + 3] = wear;
    wearB[i * 3] = element.sx / 2;
    wearB[i * 3 + 1] = boxed ? element.sy / 2 : cylinder ? -1 : -2;
    wearB[i * 3 + 2] = element.sz / 2;
  }

  geometry.setAttribute("aWearA", new THREE.BufferAttribute(wearA, 4));
  geometry.setAttribute("aWearB", new THREE.BufferAttribute(wearB, 3));

  geometry.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(cx + element.x, baseY + element.y, cz + element.z),
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(element.rx, element.ry, element.rz),
      ),
      new THREE.Vector3(element.sx, element.sy, element.sz),
    ),
  );

  return geometry;
}

const extentSources = new Map<string, THREE.BufferGeometry>();

/**
 * How far below and above its centre a piece's drawn mesh really reaches (not
 * its box): the lowest and highest vertex of the actual shape after its scale
 * and its turn. A rounded rock or a chipped slab is smaller than the box round
 * it, so placing by the box leaves it hanging over the floor; placing by this
 * puts what is drawn on the surface. Null for shapes that fill their box.
 */
export function meshExtent(
  element: PileElement,
): { low: number; high: number } | null {
  const solid =
    element.shape === "rock" ||
    element.shape === "slab" ||
    element.shape === "chunk";

  if (!solid) {
    return null;
  }

  const variant =
    element.shape === "chunk"
      ? "chunk"
      : `${element.shape}${Math.floor(noise3(element.x, 0, element.z, 7) * (element.shape === "slab" ? 5 : 3))}`;
  let geometry = extentSources.get(variant);

  if (!geometry) {
    geometry =
      element.shape === "chunk"
        ? chunkGeometry()
        : element.shape === "rock"
          ? rockGeometry(Number(variant.slice(4)))
          : slabGeometry(Number(variant.slice(4)));
    extentSources.set(variant, geometry);
  }

  const position = geometry.getAttribute("position");
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(),
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(element.rx, element.ry, element.rz),
    ),
    new THREE.Vector3(element.sx, element.sy, element.sz),
  );
  const v = new THREE.Vector3();
  let low = Infinity;
  let high = -Infinity;

  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i).applyMatrix4(matrix);
    low = Math.min(low, v.y);
    high = Math.max(high, v.y);
  }

  return { low, high };
}

/** The pieces of every pile, merged by kind of piece. */
export function createPiles(layout: ArenaLayout): THREE.Group {
  const group = new THREE.Group();
  const sources = {
    bag: pillowGeometry(),
    brick: brickGeometry(),
    plank: plankGeometry(),
    chunk: chunkGeometry(),
    rock0: rockGeometry(0),
    rock1: rockGeometry(1),
    rock2: rockGeometry(2),
    slab0: slabGeometry(0),
    slab1: slabGeometry(1),
    slab2: slabGeometry(2),
    slab3: slabGeometry(3),
    slab4: slabGeometry(4),
    pipe: pipeGeometry(),
    cable: cableGeometry(),
  };
  /** Which source an element is drawn from (rocks come in three cuts). */
  const sourceOf = (element: PileElement): keyof typeof sources =>
    element.shape === "rock" || element.shape === "slab"
      ? (`${element.shape}${Math.floor(noise3(element.x, 0, element.z, 7) * (element.shape === "slab" ? 5 : 3))}` as keyof typeof sources)
      : element.shape;

  group.name = "BuildingMaterial";

  /** One merged mesh per shape for these piles, added to `into`. */
  const build = (
    piles: readonly PileDefinition[],
    into: THREE.Object3D,
    label: string,
  ): void => {
    // (The three cuts of rock and the slabs are one mesh: same material, same
    // attributes, so a heap of broken concrete costs one draw call.)
    const parts: Record<string, THREE.BufferGeometry[]> = {
      bag: [],
      brick: [],
      plank: [],
      chunk: [],
      rock: [],
      pipe: [],
      cable: [],
    };

    for (const pile of piles) {
      for (const element of pile.elements) {
        const key = sourceOf(element);

        parts[
          key.startsWith("rock") || key.startsWith("slab") ? "rock" : key
        ].push(
          placed(
            pile.kind,
            sources[key],
            element,
            pile.baseY,
            pile.x,
            pile.z,
            element.shape === "plank",
          ),
        );
      }
    }

    for (const shape of Object.keys(parts)) {
      const list = parts[shape];

      if (list.length === 0) {
        continue;
      }

      const merged = mergeGeometries(list, false);

      for (const part of list) {
        part.dispose();
      }

      const mesh = new THREE.Mesh(
        merged,
        shape === "chunk"
          ? rubbleMaterial
          : shape === "pipe"
            ? pipeMaterial
            : shape === "cable"
              ? cableMaterial
              : pieceMaterial,
      );

      mesh.name = `${label}-${shape}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      into.add(mesh);
    }
  };

  build(
    layout.piles.filter((pile) => !pile.animated),
    group,
    "Piles",
  );

  // A pile the game moves (a running generator) is a group of its own.
  for (const pile of layout.piles.filter((p) => p.animated)) {
    const own = new THREE.Group();

    own.name = `anim:${pile.id}`;
    build([pile], own, `Piles-${pile.id}`);
    group.add(own);
  }

  for (const source of Object.values(sources)) {
    source.dispose();
  }

  return group;
}

/** Every dirt mark, stain and drift of dust, as one mesh of flat quads. */
export function createDecals(layout: ArenaLayout): THREE.Group {
  const group = new THREE.Group();

  group.name = "FloorMarks";

  if (layout.decals.length === 0) {
    return group;
  }

  const quads: THREE.BufferGeometry[] = [];
  const color = new THREE.Color();

  layout.decals.forEach((decal, index) => {
    const quad = new THREE.PlaneGeometry(decal.width, decal.depth);

    quad.rotateX(-Math.PI / 2);
    quad.rotateY(decal.rotation);
    // A hair above the floor, a little different for each mark so two marks
    // that overlap never fight over the same height.
    quad.translate(decal.x, decal.y + 0.012 + (index % 8) * 0.0008, decal.z);

    const count = quad.getAttribute("position").count;
    const colors = new Float32Array(count * 4);

    color.setHex(decal.color);

    for (let i = 0; i < count; i++) {
      colors[i * 4] = color.r;
      colors[i * 4 + 1] = color.g;
      colors[i * 4 + 2] = color.b;
      colors[i * 4 + 3] = decal.alpha;
    }

    quad.setAttribute("color", new THREE.BufferAttribute(colors, 4));
    quads.push(quad);
  });

  const merged = mergeGeometries(quads, false);

  for (const quad of quads) {
    quad.dispose();
  }

  const mesh = new THREE.Mesh(merged, decalMaterial());

  mesh.name = "FloorMarksMesh";
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  group.add(mesh);

  return group;
}
