import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { CylinderSolid } from "./ArenaLayout";
import { industrialMaterials } from "./materials/IndustrialMaterialLibrary";
import { METAL_TILE_METRES } from "./materials/MetalTexture";
import { useWorldSpaceUv } from "./materials/WorldSpaceUv";

/** How tall the steel stand under a tank is, and how tall its domed lid is. */
export const TANK_LEG_HEIGHT = 1.3;
export const TANK_DOME_HEIGHT = 0.4;

const PAINT = new THREE.Color(0x9fa8b4);
const PAINT_DARK = new THREE.Color(0x6c7480);
const STEEL = new THREE.Color(0x48505c);
const RUST = new THREE.Color(0x7a5b44);

const material = new THREE.MeshStandardMaterial({
  name: "TankSteel",
  vertexColors: true,
  roughness: 0.62,
  metalness: 0.3,
  map: industrialMaterials.metalWearMap(),
});

useWorldSpaceUv(material, {
  tileMetres: METAL_TILE_METRES / 2,
  macro: { frequency: 0.3, strength: 0.14, baseDirt: 0.12 },
});

function paint(
  geometry: THREE.BufferGeometry,
  colorAt: (y: number) => THREE.Color,
): THREE.BufferGeometry {
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);

  for (let i = 0; i < position.count; i++) {
    const c = colorAt(position.getY(i));

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  return geometry;
}

/**
 * A water tank on a steel stand, as one mesh (vertex colours, the shared metal
 * wear map): four splayed legs with a ring of cross braces and diagonals, a
 * cradle ring, a big painted cylinder with weld bands and a rusty foot, a
 * domed lid with a hatch and a vent pipe, a side ladder, a filler pipe at the
 * base and a level strip. The solid it sits in is the whole footprint, from
 * the roof to the top of the dome.
 */
export function createTankMesh(solid: CylinderSolid): THREE.Mesh {
  const base = solid.bottom ?? 0;
  const total = solid.height - base;
  const radius = solid.radius;
  const legs = TANK_LEG_HEIGHT;
  const dome = TANK_DOME_HEIGHT;
  const body = Math.max(total - legs - dome, 1);
  const parts: THREE.BufferGeometry[] = [];
  const placed = (
    geometry: THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
    colorAt: (y: number) => THREE.Color,
    rotation?: THREE.Euler,
  ): void => {
    if (rotation) {
      geometry.applyMatrix4(
        new THREE.Matrix4().makeRotationFromEuler(rotation),
      );
    }

    geometry.translate(x, y, z);
    parts.push(paint(geometry, colorAt));
  };
  const flat = (c: THREE.Color) => () => c;

  // Four legs, a little splayed, with a foot plate each.
  const legRadius = radius * 0.72;
  const legAngles = [0.25, 0.75, 1.25, 1.75].map((a) => a * Math.PI);

  for (const angle of legAngles) {
    const lx = Math.cos(angle) * legRadius;
    const lz = Math.sin(angle) * legRadius;

    placed(
      new THREE.BoxGeometry(0.14, legs, 0.14),
      lx,
      legs / 2,
      lz,
      flat(STEEL),
    );
    placed(new THREE.BoxGeometry(0.4, 0.05, 0.4), lx, 0.025, lz, flat(STEEL));
  }

  // Cross braces: a ring of four beams between the legs at 0.45 m, and an X of
  // diagonals on each side from foot to the ring above.
  for (let i = 0; i < 4; i++) {
    const a0 = legAngles[i];
    const a1 = legAngles[(i + 1) % 4];
    const p0 = new THREE.Vector3(
      Math.cos(a0) * legRadius,
      0,
      Math.sin(a0) * legRadius,
    );
    const p1 = new THREE.Vector3(
      Math.cos(a1) * legRadius,
      0,
      Math.sin(a1) * legRadius,
    );
    const mid = p0.clone().add(p1).multiplyScalar(0.5);
    const along = p1.clone().sub(p0);
    const length = along.length();
    const yaw = Math.atan2(-along.z, along.x);

    placed(
      new THREE.BoxGeometry(length, 0.08, 0.08),
      mid.x,
      0.5,
      mid.z,
      flat(STEEL),
      new THREE.Euler(0, yaw, 0),
    );

    // Two diagonals crossing in the bay between 0.5 m and the cradle.
    const bay = legs - 0.5;
    const slope = Math.atan2(bay, length);
    const diagonal = Math.hypot(bay, length);

    for (const sign of [-1, 1]) {
      const euler = new THREE.Euler(0, 0, sign * slope);
      const geometry = new THREE.BoxGeometry(diagonal, 0.05, 0.05);

      geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(euler));
      geometry.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw));
      geometry.translate(mid.x, 0.5 + bay / 2, mid.z);
      parts.push(paint(geometry, flat(STEEL)));
    }
  }

  // The cradle: a flat steel ring under the tank, a little wider than it.
  placed(
    new THREE.CylinderGeometry(radius * 1.04, radius * 1.04, 0.12, 32),
    0,
    legs + 0.06,
    0,
    flat(STEEL),
  );

  // The tank: painted, rusty at the foot and where the water line streaks.
  const bodyBottom = legs + 0.12;
  const bodyHeight = body - 0.12;
  const tint = new THREE.Color();

  placed(
    new THREE.CylinderGeometry(radius, radius, bodyHeight, 40, 6),
    0,
    bodyBottom + bodyHeight / 2,
    0,
    (y) => {
      const t = THREE.MathUtils.clamp((y - bodyBottom) / bodyHeight, 0, 1);
      // Rust and grime collect low down; the top stays cleaner.
      const rust = Math.max(0, 1 - t / 0.16) * 0.75;

      return tint
        .copy(PAINT)
        .lerp(PAINT_DARK, 0.25 * (1 - t))
        .lerp(RUST, rust)
        .clone();
    },
  );

  // Weld bands round the body at thirds (and one at the top and the bottom).
  for (const fraction of [0.04, 0.34, 0.67, 0.96]) {
    placed(
      new THREE.CylinderGeometry(radius * 1.018, radius * 1.018, 0.1, 40),
      0,
      bodyBottom + bodyHeight * fraction,
      0,
      flat(PAINT_DARK),
    );
  }

  // The domed lid, a hatch on it and a vent pipe.
  const lidBase = bodyBottom + bodyHeight;
  const lid = new THREE.SphereGeometry(
    radius,
    32,
    8,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  );

  lid.scale(1, dome / radius, 1);
  placed(lid, 0, lidBase, 0, flat(PAINT));
  placed(
    new THREE.CylinderGeometry(0.28, 0.3, 0.16, 16),
    radius * 0.35,
    lidBase + dome * 0.88,
    0,
    flat(STEEL),
  );
  placed(
    new THREE.CylinderGeometry(0.06, 0.06, 0.5, 10),
    -radius * 0.3,
    lidBase + dome * 0.9 + 0.2,
    radius * 0.1,
    flat(STEEL),
  );

  // A ladder up the side, away from the viewer's usual side (the -z face).
  const ladderZ = -(radius + 0.05);
  const ladderTop = lidBase + 0.1;
  const ladderBottom = 0.35;
  const ladderHeight = ladderTop - ladderBottom;

  for (const side of [-1, 1]) {
    placed(
      new THREE.BoxGeometry(0.04, ladderHeight, 0.04),
      side * 0.2,
      ladderBottom + ladderHeight / 2,
      ladderZ,
      flat(STEEL),
    );
  }

  for (let y = ladderBottom + 0.3; y < ladderTop; y += 0.32) {
    placed(
      new THREE.BoxGeometry(0.4, 0.035, 0.035),
      0,
      y,
      ladderZ,
      flat(STEEL),
    );
  }

  // A filler pipe out of the base, with a valve wheel.
  placed(
    new THREE.CylinderGeometry(0.08, 0.08, 0.7, 12),
    radius + 0.25,
    bodyBottom + 0.3,
    0,
    flat(STEEL),
    new THREE.Euler(0, 0, Math.PI / 2),
  );
  placed(
    new THREE.CylinderGeometry(0.17, 0.17, 0.04, 14),
    radius + 0.5,
    bodyBottom + 0.3,
    0,
    flat(RUST),
    new THREE.Euler(0, 0, Math.PI / 2),
  );

  // A level strip down the +x side: a dark channel with a pale glass gauge.
  placed(
    new THREE.BoxGeometry(0.06, bodyHeight * 0.7, 0.14),
    Math.sqrt(radius * radius - (radius * 0.35) ** 2) + 0.02,
    bodyBottom + bodyHeight * 0.5,
    radius * 0.35,
    flat(STEEL),
  );

  const merged = mergeGeometries(parts, false);

  for (const part of parts) {
    part.dispose();
  }

  const mesh = new THREE.Mesh(merged, material);

  mesh.position.set(solid.x, base, solid.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}
