import type { LadderDefinition, RiseDirection } from "../world/ArenaLayout";

/** Ladder climbing: the numbers, and the pure helpers (no input, no rendering). */
export const CLIMB = {
  /** Metres per second up or down a ladder. */
  SPEED: 2.2,
  /** How close (horizontal, metres) the player must be to the ladder to grab it. */
  REACH: 1.8,
  /** How far the body's centre hangs off the ladder's face. */
  STAND_OFF: 0.65,
  /** The player must look toward the ladder: dot of look and direction to it. */
  FACING: 0.5,
  /**
   * How far (radians) the head can turn either way while on a ladder. The body
   * stays facing the ladder.
   */
  LOOK_RANGE: 1.75,
  /** Horizontal speed of a jump off the ladder, away from it. */
  JUMP_AWAY: 3,
  /** Upward speed of that jump. */
  JUMP_UP: 3,
} as const;

/** The unit vector (x, z) a ladder's face looks along. */
export function ladderNormal(normal: RiseDirection): { x: number; z: number } {
  const sign = normal.startsWith("+") ? 1 : -1;

  return normal.endsWith("x") ? { x: sign, z: 0 } : { x: 0, z: sign };
}

/** Where the body's centre hangs while on a ladder. */
export function climbSpot(ladder: LadderDefinition): { x: number; z: number } {
  const n = ladderNormal(ladder.normal);

  return {
    x: ladder.x + n.x * CLIMB.STAND_OFF,
    z: ladder.z + n.z * CLIMB.STAND_OFF,
  };
}

/** The camera yaw that looks into the ladder (toward the wall). */
export function ladderYaw(ladder: LadderDefinition): number {
  const n = ladderNormal(ladder.normal);

  return Math.atan2(n.x, n.z);
}

/**
 * The ladder a player at (x, z) with their feet at `feetY` could grab: close
 * enough, within its height, and looking toward it. It works from the bottom
 * and from the top edge (to climb down). The nearest one wins.
 */
export function findLadder(
  ladders: readonly LadderDefinition[],
  x: number,
  z: number,
  feetY: number,
  yaw: number,
): LadderDefinition | null {
  const lookX = -Math.sin(yaw);
  const lookZ = -Math.cos(yaw);
  let best: LadderDefinition | null = null;
  let bestDistance: number = CLIMB.REACH;

  for (const ladder of ladders) {
    if (feetY < ladder.bottomY - 0.2 || feetY > ladder.topY + 0.2) {
      continue;
    }

    const dx = ladder.x - x;
    const dz = ladder.z - z;
    const distance = Math.hypot(dx, dz);

    if (distance > bestDistance) {
      continue;
    }

    if (
      distance > 0.05 &&
      (dx * lookX + dz * lookZ) / distance < CLIMB.FACING
    ) {
      continue;
    }

    best = ladder;
    bestDistance = distance;
  }

  return best;
}

/** The signed angle (radians, -PI to PI) from `b` round to `a`. */
export function angleBetween(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}
