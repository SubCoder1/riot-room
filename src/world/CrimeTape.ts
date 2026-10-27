import * as THREE from "three";

import type { TapeRun } from "./ArenaLayout";

/**
 * Police tape: a narrow yellow ribbon strung between two points, sagging, its
 * black warning text repeating along it. Each run is two meshes sharing one
 * set of points: the face that looks toward the viewer, with its text reading
 * left to right, and the back, which reads the right way round from behind
 * (a ribbon has no mirrored side). Drawn only; the tape is never solid.
 */

const WIDTH = 0.1;
/** Metres of tape for one pass of the text. */
const TILE = 3.2;
const SEGMENTS = 28;
const TEXT = "GCPD  ·  CRIME SCENE  ·  DO NOT ENTER  ·  ";

/** Draws the text strip; null where there is no canvas (tests, no DOM). */
function stripTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") {
    return null;
  }

  const canvas = document.createElement("canvas");

  canvas.width = 2048;
  canvas.height = 64;

  let ctx: CanvasRenderingContext2D | null;

  try {
    ctx = canvas.getContext("2d");
  } catch {
    return null;
  }

  if (!ctx) {
    return null;
  }

  // Weathered yellow: a little dirt toward the edges and some creases.
  ctx.fillStyle = "#d8b21c";
  ctx.fillRect(0, 0, 2048, 64);
  ctx.fillStyle = "rgba(60,45,10,0.18)";
  ctx.fillRect(0, 0, 2048, 5);
  ctx.fillRect(0, 59, 2048, 5);

  for (let i = 0; i < 40; i++) {
    const x = (Math.sin(i * 12.9898) * 43758.5453 * 1000) % 2048;

    ctx.fillStyle = `rgba(70,50,10,${0.05 + (i % 3) * 0.03})`;
    ctx.fillRect(Math.abs(x), 0, 2 + (i % 4), 64);
  }

  ctx.fillStyle = "#101010";
  ctx.font = "bold 40px Arial, Helvetica, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  // The wording is repeated a whole number of times across the tile and the
  // type sized so those copies fill it exactly (so the repeat is seamless). The
  // letters keep their own proportions: nothing is stretched sideways.
  const family = "Arial, Helvetica, sans-serif";

  ctx.font = `bold 40px ${family}`;

  const natural = ctx.measureText(TEXT).width;
  const copies = Math.max(1, Math.round(2048 / natural));
  const size = (40 * 2048) / (copies * natural);

  ctx.font = `bold ${size.toFixed(2)}px ${family}`;

  const each = 2048 / copies;

  for (let i = 0; i < copies; i++) {
    ctx.fillText(TEXT, i * each, 34);
  }

  const texture = new THREE.CanvasTexture(canvas);

  texture.wrapS = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;

  return texture;
}

/** The ribbon's points along its length (sagging in the middle). */
function ribbon(run: TapeRun): { points: THREE.Vector3[]; length: number } {
  const a = new THREE.Vector3(...run.from);
  const b = new THREE.Vector3(...run.to);
  const points: THREE.Vector3[] = [];

  for (let i = 0; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS;

    points.push(
      a
        .clone()
        .lerp(b, t)
        .add(new THREE.Vector3(0, -run.sag * 4 * t * (1 - t), 0)),
    );
  }

  return { points, length: a.distanceTo(b) };
}

/**
 * The geometry of one face. `flip` makes the face for the other side: its
 * winding and its text direction are both turned, so it reads correctly there.
 */
function face(
  points: THREE.Vector3[],
  length: number,
  flip: boolean,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);

  points.forEach((point, i) => {
    const u = ((i / SEGMENTS) * length) / TILE;

    for (const v of [0, 1]) {
      positions.push(
        point.x + up.x * (v - 0.5) * WIDTH,
        point.y + up.y * (v - 0.5) * WIDTH,
        point.z + up.z * (v - 0.5) * WIDTH,
      );
      uvs.push(flip ? length / TILE - u : u, v);
    }
  });

  for (let i = 0; i < SEGMENTS; i++) {
    const a = i * 2;

    if (flip) {
      index.push(a, a + 3, a + 1, a, a + 2, a + 3);
    } else {
      index.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * The tape of every run. `viewer` is where it is read from: each run is turned
 * end for end if need be so its text runs left to right for someone standing
 * there.
 */
export function createCrimeTape(
  runs: readonly TapeRun[],
  viewer: readonly [number, number, number],
): THREE.Group {
  const group = new THREE.Group();

  group.name = "CrimeTape";

  const map = stripTexture();
  const material = new THREE.MeshStandardMaterial({
    name: "CrimeTape",
    map,
    color: map ? 0xb4b4b4 : 0xd8b21c,
    roughness: 0.75,
    metalness: 0,
    // Just enough to read in the dark: a muted yellow, not a glowing one.
    emissive: new THREE.Color(0x120d02),
    emissiveMap: map,
    side: THREE.FrontSide,
  });

  for (const run of runs) {
    const { points, length } = ribbon(run);
    const mid = points[SEGMENTS >> 1];
    // The viewer's right-hand direction along the tape, flat.
    const toward = new THREE.Vector3(viewer[0] - mid.x, 0, viewer[2] - mid.z);
    const right = new THREE.Vector3(0, 1, 0).cross(toward).normalize();
    const along = points[SEGMENTS].clone().sub(points[0]).setY(0);
    // Left to right for the viewer: the first point is the left end.
    const ordered = along.dot(right) >= 0 ? points : [...points].reverse();

    for (const flip of [false, true]) {
      const geometry = face(ordered, length, flip);
      const normal = new THREE.Vector3();
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const c = new THREE.Vector3();
      const pos = geometry.getAttribute("position");

      a.fromBufferAttribute(pos, 0);
      b.fromBufferAttribute(pos, 1);
      c.fromBufferAttribute(pos, 3);
      normal.crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();

      // The measured normal is that of the unflipped winding: it must look at
      // the viewer (and the flipped face, its reverse, away from them).
      const facesViewer = normal.dot(toward) > 0;

      if (!facesViewer) {
        // Wrong way round for this side: turn both windings.
        const idx = geometry.getIndex()!;

        for (let i = 0; i < idx.count; i += 3) {
          const t = idx.getX(i + 1);

          idx.setX(i + 1, idx.getX(i + 2));
          idx.setX(i + 2, t);
        }

        geometry.computeVertexNormals();
      }

      const mesh = new THREE.Mesh(geometry, material);

      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      group.add(mesh);
    }
  }

  return group;
}
