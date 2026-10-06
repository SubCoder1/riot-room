import * as THREE from "three";

/**
 * Returns how much of the straight line `from` -> `to` is free of scenery, as
 * a fraction from 0 to 1 (1 = nothing in the way).
 */
export type ClearFraction = (from: THREE.Vector3, to: THREE.Vector3) => number;

export interface ArmPose {
  elbow: THREE.Vector3;
  wrist: THREE.Vector3;
}

/** Half the thickness of a fist: the knuckles stop this far short of a wall. */
const FIST_RADIUS = 0.12;

/** The arm never folds shorter than this share of its length. */
const MIN_REACH = 0.3;

/**
 * Keeps an arm out of walls. If the line from the shoulder through the fist
 * runs into scenery, the arm is shortened so the fist stops at the surface,
 * with the elbow bending outward to take up the slack (a two-bone solve).
 * Returns the new elbow and wrist positions, or null if nothing is in the way.
 */
export function limitArmReach(
  shoulder: THREE.Vector3,
  elbow: THREE.Vector3,
  wrist: THREE.Vector3,
  clearFraction: ClearFraction,
): ArmPose | null {
  const upper = elbow.distanceTo(shoulder);
  const fore = wrist.distanceTo(elbow);
  const direction = wrist.clone().sub(shoulder);
  const length = direction.length();

  if (length < 1e-4 || upper < 1e-4 || fore < 1e-4) {
    return null;
  }

  direction.divideScalar(length);

  // Look a fist's width past the wrist, so the knuckles themselves count.
  const probeLength = length + FIST_RADIUS;
  const end = shoulder.clone().addScaledVector(direction, probeLength);
  const free = clearFraction(shoulder, end);

  if (free >= 1) {
    return null;
  }

  const allowed = Math.max(
    free * probeLength - FIST_RADIUS - 0.02,
    length * MIN_REACH,
  );

  if (allowed >= length) {
    return null;
  }

  const distance = THREE.MathUtils.clamp(
    allowed,
    Math.abs(upper - fore) + 0.01,
    upper + fore - 0.005,
  );

  // The elbow keeps bending the way it already bends.
  const bend = elbow.clone().sub(shoulder);

  bend.addScaledVector(direction, -bend.dot(direction));

  if (bend.lengthSq() < 1e-6) {
    bend.set(0, 1, 0).addScaledVector(direction, -direction.y);
  }

  bend.normalize();

  const along =
    (upper * upper - fore * fore + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));

  return {
    elbow: shoulder
      .clone()
      .addScaledVector(direction, along)
      .addScaledVector(bend, height),
    wrist: shoulder.clone().addScaledVector(direction, distance),
  };
}
