import * as THREE from "three";

import type { ArenaLayout, CurvedTopDefinition } from "./ArenaLayout";
import { industrialMaterials } from "./materials/IndustrialMaterialLibrary";

/**
 * One barrier with a smoothly wavy top, as one mesh: a prism along the
 * barrier's long side whose top follows `heights` (sampled evenly), with the
 * top's normals smoothed so the wave is lit as a curve, not as steps. The
 * footprint is the original barrier's; the collision under it is a row of thin
 * hidden slices that follow the same curve.
 */
function createCurvedTop(curve: CurvedTopDefinition): THREE.Mesh {
  const { heights, alongX, base } = curve;
  const n = heights.length;
  const lo = alongX ? curve.minX : curve.minZ;
  const length = alongX ? curve.maxX - curve.minX : curve.maxZ - curve.minZ;
  const thick = alongX ? curve.maxZ - curve.minZ : curve.maxX - curve.minX;
  const centre = alongX
    ? (curve.minZ + curve.maxZ) / 2
    : (curve.minX + curve.maxX) / 2;
  const half = thick / 2;
  const step = length / (n - 1);
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  // (u along the barrier, y up, s across it) to a world point.
  const at = (u: number, y: number, s: number): THREE.Vector3 =>
    alongX
      ? new THREE.Vector3(lo + u, y, centre + s)
      : new THREE.Vector3(centre + s, y, lo + u);
  const dir = (du: number, dy: number, ds: number): THREE.Vector3 =>
    (alongX
      ? new THREE.Vector3(du, dy, ds)
      : new THREE.Vector3(ds, dy, du)
    ).normalize();

  const quad = (
    points: THREE.Vector3[],
    vertexNormals: THREE.Vector3[],
  ): void => {
    const first = positions.length / 3;
    const cross = new THREE.Vector3()
      .subVectors(points[1], points[0])
      .cross(new THREE.Vector3().subVectors(points[2], points[0]));
    // Flip the winding if it faces against the wanted normal.
    const order =
      cross.dot(vertexNormals[0]) >= 0
        ? [0, 1, 2, 0, 2, 3]
        : [0, 2, 1, 0, 3, 2];

    points.forEach((p, i) => {
      positions.push(p.x, p.y, p.z);
      normals.push(vertexNormals[i].x, vertexNormals[i].y, vertexNormals[i].z);
    });

    for (const o of order) {
      indices.push(first + o);
    }
  };
  const flat = (v: THREE.Vector3): THREE.Vector3[] => [v, v, v, v];

  const slope = (i: number): number => {
    const from = Math.max(i - 1, 0);
    const to = Math.min(i + 1, n - 1);

    return (heights[to] - heights[from]) / (step * (to - from));
  };

  for (let i = 0; i < n - 1; i++) {
    const u0 = i * step;
    const u1 = (i + 1) * step;
    const y0 = heights[i];
    const y1 = heights[i + 1];
    const n0 = dir(-slope(i), 1, 0);
    const n1 = dir(-slope(i + 1), 1, 0);

    // The wavy top (smooth normals).
    quad(
      [
        at(u0, y0, -half),
        at(u1, y1, -half),
        at(u1, y1, half),
        at(u0, y0, half),
      ],
      [n0, n1, n1, n0],
    );
    // The two long faces.
    quad(
      [
        at(u0, base, half),
        at(u1, base, half),
        at(u1, y1, half),
        at(u0, y0, half),
      ],
      flat(dir(0, 0, 1)),
    );
    quad(
      [
        at(u0, base, -half),
        at(u1, base, -half),
        at(u1, y1, -half),
        at(u0, y0, -half),
      ],
      flat(dir(0, 0, -1)),
    );
  }

  // The two ends.
  quad(
    [
      at(0, base, -half),
      at(0, base, half),
      at(0, heights[0], half),
      at(0, heights[0], -half),
    ],
    flat(dir(-1, 0, 0)),
  );
  quad(
    [
      at(length, base, -half),
      at(length, base, half),
      at(length, heights[n - 1], half),
      at(length, heights[n - 1], -half),
    ],
    flat(dir(1, 0, 0)),
  );

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(
      new Array((positions.length / 3) * 2).fill(0),
      2,
    ),
  );
  geometry.setIndex(indices);

  const mesh = new THREE.Mesh(
    geometry,
    industrialMaterials.barrier(
      industrialMaterials.barrierVariantFor(curve.id),
    ),
  );

  mesh.name = curve.id;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}

export function createCurvedTops(layout: ArenaLayout): THREE.Group {
  const group = new THREE.Group();

  group.name = "CurvedTops";

  for (const curve of layout.curves) {
    group.add(createCurvedTop(curve));
  }

  return group;
}
