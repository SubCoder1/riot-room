import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { SteelMember } from "./ArenaLayout";
import { industrialMaterials } from "./materials/IndustrialMaterialLibrary";

const UP = new THREE.Vector3(0, 1, 0);

/** Flange and web thickness as a share of the section depth / width. */
const FLANGE = 0.18;
const WEB = 0.22;

const box = new THREE.BoxGeometry(1, 1, 1);

/**
 * One box part of a section, in the member's own frame: x across, y up the
 * section, z along the member. Returns a transformed copy of the unit box.
 */
function part(
  frame: THREE.Matrix4,
  centreX: number,
  centreY: number,
  sizeX: number,
  sizeY: number,
  length: number,
): THREE.BufferGeometry {
  const geometry = box.clone();

  geometry.applyMatrix4(
    new THREE.Matrix4()
      .multiplyMatrices(
        frame,
        new THREE.Matrix4().makeTranslation(centreX, centreY, 0),
      )
      .multiply(new THREE.Matrix4().makeScale(sizeX, sizeY, length)),
  );

  return geometry;
}

/** The pieces (boxes) of one member: an I section is two flanges and a web. */
function memberParts(member: SteelMember): THREE.BufferGeometry[] {
  const from = new THREE.Vector3(...member.from);
  const to = new THREE.Vector3(...member.to);
  const axis = to.clone().sub(from);
  const length = axis.length();

  if (length < 1e-4) {
    return [];
  }

  axis.normalize();

  // The frame: z along the member; x across the flanges.
  let across: THREE.Vector3;

  if (Math.abs(axis.y) > 0.9) {
    // A column: the flanges run along x or z, as asked.
    across =
      member.flangeAlong === "z"
        ? new THREE.Vector3(0, 0, 1)
        : new THREE.Vector3(1, 0, 0);
  } else {
    // A beam or brace: the web stays upright, the flanges level.
    across = new THREE.Vector3().crossVectors(UP, axis).normalize();
  }

  const upSection = new THREE.Vector3().crossVectors(axis, across).normalize();
  const frame = new THREE.Matrix4()
    .makeBasis(across, upSection, axis)
    .setPosition(from.clone().add(to).multiplyScalar(0.5));
  const { width, depth } = member;

  if (member.profile === "box") {
    return [part(frame, 0, 0, width, depth, length)];
  }

  const flange = depth * FLANGE;

  return [
    part(frame, 0, depth / 2 - flange / 2, width, flange, length),
    part(frame, 0, -(depth / 2 - flange / 2), width, flange, length),
    part(frame, 0, 0, width * WEB, depth - flange * 2, length),
  ];
}

/**
 * All the structural steel as ONE mesh (one draw call, one material): I-beam
 * columns, support beams, braces and trusses. Named `SteelStructure`; each
 * member's id is kept in `userData.members` so it can be found and adjusted.
 */
export function createSteelStructure(
  members: readonly SteelMember[],
): THREE.Mesh | null {
  const parts = members.flatMap(memberParts);

  if (parts.length === 0) {
    return null;
  }

  const merged = mergeGeometries(parts, false);

  for (const geometry of parts) {
    geometry.dispose();
  }

  const mesh = new THREE.Mesh(merged, industrialMaterials.steel());

  mesh.name = "SteelStructure";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.members = members.map((m) => m.id);

  return mesh;
}
