/**
 * Combat rules that are shared between the hit logic and the debug view.
 * Change a value here and both follow.
 */
export const COMBAT_CONFIG = {
  /**
   * Width of the frontal guard cone, in degrees. A light attack is only blocked
   * when the attacker is within half of this angle either side of the
   * defender's facing direction.
   */
  blockAngleDegrees: 90,

  /**
   * Vertical tolerance of the guard, in degrees (total, so +/- half of it). The
   * guard points where the defender is looking, pitch included, so an attack
   * from above (a jump attack) is only blocked if the defender is looking up
   * toward it, and a defender looking straight ahead is not covering it.
   */
  blockVerticalAngleDegrees: 40,

  /**
   * Looking up at least this far (degrees) raises the guard over the face: it
   * then covers the head and upper body, and the legs and groin are open even for
   * a crouched defender. Below this the fists sit at the chest and the head is open.
   */
  guardRaisedPitchDegrees: 20,
};

export type GuardedPart = "head" | "torso" | "legs";

/**
 * Which body parts a guard protects. The guard follows the pose: the fists sit
 * low in front of the chest while the defender looks level, and come up over
 * the face when they look up, so:
 *  - level guard, standing:  torso only (the head is open)
 *  - level guard, crouched:  torso + legs (the head is still open)
 *  - raised guard (looking up): head + torso (legs/groin open, crouched or not)
 */
export function guardedPartsFor(
  crouched: boolean,
  lookPitch: number,
): readonly GuardedPart[] {
  const raised =
    lookPitch >= COMBAT_CONFIG.guardRaisedPitchDegrees * (Math.PI / 180);

  if (raised) {
    return ["head", "torso"];
  }

  return crouched ? ["torso", "legs"] : ["torso"];
}

/**
 * Elevation (radians) of the attacker as seen from the defender, using the
 * fighters' feet heights, which cancels the (equal) body height: level ground
 * is 0 and a jumping attacker is above.
 */
export function guardElevation(
  defenderFeetY: number,
  attackerFeetY: number,
  horizontalDistance: number,
): number {
  return Math.atan2(
    attackerFeetY - defenderFeetY,
    Math.max(horizontalDistance, 0.3),
  );
}

/**
 * The band of elevations the guard covers. A level guard covers about level
 * (+/- the tolerance). Looking up extends the band upward and looking down
 * extends it downward, so a defender looking up still blocks level attacks
 * (the raised arms cover the face) and now also covers attacks from above.
 */
export function guardElevationRange(defenderPitch: number): {
  low: number;
  high: number;
} {
  const limit = guardVerticalLimit();

  return {
    low: Math.min(0, defenderPitch) - limit,
    high: Math.max(0, defenderPitch) + limit,
  };
}

export function guardVerticalLimit(): number {
  return (COMBAT_CONFIG.blockVerticalAngleDegrees / 2) * (Math.PI / 180);
}

/**
 * Dot product between the defender's horizontal facing and the horizontal
 * direction from the defender to the attacker, in world space:
 * 1 = attacker dead ahead, 0 = directly to the side, -1 = directly behind.
 */
export function guardAlignment(
  facingX: number,
  facingZ: number,
  defenderX: number,
  defenderZ: number,
  attackerX: number,
  attackerZ: number,
): number {
  const facingLength = Math.hypot(facingX, facingZ);
  const dx = attackerX - defenderX;
  const dz = attackerZ - defenderZ;
  const distance = Math.hypot(dx, dz);

  // Standing on top of each other, or no facing: treat the attacker as in front.
  if (distance < 1e-4 || facingLength < 1e-4) {
    return 1;
  }

  return (facingX * dx + facingZ * dz) / (facingLength * distance);
}

/** Dot-product threshold equivalent to the guard cone's half angle. */
export function guardDotThreshold(): number {
  return Math.cos((COMBAT_CONFIG.blockAngleDegrees / 2) * (Math.PI / 180));
}
