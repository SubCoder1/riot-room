import * as THREE from "three";

import { Pieces } from "./FittingPieces";
import type { MapBuilder } from "./MapParts";

/**
 * The Ruins' objective: the target component, a sealed hard case on
 * a steel table just inside the collapsed entrance (south of the way in, out
 * of the rack lanes), and the extraction point it is carried to, back in the
 * north-west spawn yard. Nothing here is a weapon or a utility: taking the
 * case is a mission event, carried by the mission state alone.
 */

/** Where the player must bring the component (the spawn yard's open floor). */
export const EXTRACTION_POINT = {
  x: -26,
  y: 0,
  z: -19.4,
  radius: 2.2,
} as const;

const STEEL = 0x4f5f74;
const STEEL_DARK = 0x353b46;
const STEEL_BARE = 0x8791a0;

/** The table the case stands on, and the case's pickup (the pickup's id starts "vault-"). */
export function furnishVaultCase(map: MapBuilder, floorY: number): void {
  const x = 27.4;
  const z = -11.4;
  const p = new Pieces();

  // A plain steel work table: a top, four legs and a low shelf.
  p.box(x, 0.8, z, 0.9, 0.04, 0.7, STEEL);
  p.box(x, 0.77, z, 0.84, 0.03, 0.64, STEEL_DARK);

  for (const dx of [-0.4, 0.4]) {
    for (const dz of [-0.3, 0.3]) {
      p.box(x + dx, 0, z + dz, 0.05, 0.8, 0.05, STEEL_DARK);
    }
  }

  p.box(x, 0.25, z, 0.82, 0.025, 0.62, STEEL_BARE);

  map.createFitting("fittings-vault-case-table", floorY, p.elements, [
    {
      minX: x - 0.45,
      maxX: x + 0.45,
      minZ: z - 0.35,
      maxZ: z + 0.35,
      top: 0.84,
    },
  ]);

  map.addPickup({
    id: "vault-component-1",
    type: "COMPONENT",
    x,
    y: floorY + 0.84,
    z,
    amount: 1,
    respawn: 1e9,
  });
}

/** The sealed case itself (its base at y = 0, about 0.34 m long). */
export function createComponentCase(): THREE.Group {
  const group = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({
    color: 0x3a4036,
    roughness: 0.7,
    metalness: 0.3,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: 0x8a8266,
    roughness: 0.6,
    metalness: 0.4,
  });
  // A small amber indicator: the only thing that glows.
  const light = new THREE.MeshStandardMaterial({
    color: 0xd9a22b,
    emissive: 0xd9a22b,
    emissiveIntensity: 0.9,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.24), shell);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.04, 0.25), shell);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.03), trim);
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.26), trim);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.015, 0.03), light);

  body.position.y = 0.08;
  lid.position.y = 0.18;
  handle.position.set(0, 0.215, 0);
  strap.position.set(0.1, 0.1, 0);
  lamp.position.set(-0.12, 0.205, 0.06);
  group.add(body, lid, handle, strap, lamp);
  group.name = "component-case";

  return group;
}
