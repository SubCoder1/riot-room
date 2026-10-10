import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { ArenaLayout, PileElement } from "./ArenaLayout";
import { createStainTexture } from "../vfx/SoftTexture";

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

const rubbleMaterial = new THREE.MeshStandardMaterial({
  name: "PileRubble",
  vertexColors: true,
  roughness: 0.96,
  metalness: 0,
  flatShading: true,
});

const pipeMaterial = new THREE.MeshStandardMaterial({
  name: "PilePipes",
  vertexColors: true,
  roughness: 0.55,
  metalness: 0.55,
});

const pieceMaterial = new THREE.MeshStandardMaterial({
  name: "PilePieces",
  vertexColors: true,
  roughness: 0.94,
  metalness: 0,
});

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

function brickGeometry(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
}

function chunkGeometry(): THREE.BufferGeometry {
  // An icosahedron roughened by a few fixed bumps: angular and not a ball.
  const geometry = new THREE.IcosahedronGeometry(0.5, 0).toNonIndexed();
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

function placed(
  source: THREE.BufferGeometry,
  element: PileElement,
  baseY: number,
  cx: number,
  cz: number,
  grain: boolean,
): THREE.BufferGeometry {
  const geometry = source.clone();
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

    if (element.shape === "pipe") {
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
    colors[i * 3] = shade.r;
    colors[i * 3 + 1] = shade.g;
    colors[i * 3 + 2] = shade.b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

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

/** The pieces of every pile, merged by kind of piece. */
export function createPiles(layout: ArenaLayout): THREE.Group {
  const group = new THREE.Group();
  const sources = {
    bag: pillowGeometry(),
    brick: brickGeometry(),
    plank: plankGeometry(),
    chunk: chunkGeometry(),
    pipe: pipeGeometry(),
  };
  const parts: Record<keyof typeof sources, THREE.BufferGeometry[]> = {
    bag: [],
    brick: [],
    plank: [],
    chunk: [],
    pipe: [],
  };

  group.name = "BuildingMaterial";

  for (const pile of layout.piles) {
    for (const element of pile.elements) {
      parts[element.shape].push(
        placed(
          sources[element.shape],
          element,
          pile.baseY,
          pile.x,
          pile.z,
          element.shape === "plank",
        ),
      );
    }
  }

  for (const shape of Object.keys(parts) as Array<keyof typeof sources>) {
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
          : pieceMaterial,
    );

    mesh.name = `Piles-${shape}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
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
