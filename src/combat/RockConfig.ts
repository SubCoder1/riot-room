import { ATTACKS } from "./AttackDefinitions";
import type { HurtboxId } from "./Combatant";

/**
 * All rock tuning lives here, so playtesting means editing this one block.
 * The flight values are used by BOTH the aim preview and the real rock, so what
 * you see while aiming is what you throw.
 */
export const ROCK_CONFIG = {
  /** Launch speed, metres per second. */
  ROCK_THROW_SPEED: 32,
  /** Downward acceleration, m/s^2, once gravity has fully set in. */
  ROCK_GRAVITY: 14,
  /** The rock flies dead straight for this far (metres), then gravity starts to build. */
  ROCK_GRAVITY_START: 6,
  /**
   * Over this many further metres gravity builds up (steadily) to ROCK_GRAVITY,
   * so the path bends more and more: a smooth arc, not a straight line that
   * suddenly drops.
   */
  ROCK_GRAVITY_RAMP: 40,
  /**
   * Safety limit on the path length (metres). A rock normally ends on scenery
   * or the floor long before; this only removes one thrown skyward that is
   * somehow still flying.
   */
  ROCK_MAX_RANGE: 250,
  /** Radius used for collisions, metres. */
  ROCK_RADIUS: 0.07,

  /** Body (torso and legs) hit: the same as the existing light jump punch. */
  ROCK_BODY_DAMAGE: ATTACKS["flying-light-punch"].damage,
  /** Head hit: a little under the existing heavy attack. */
  ROCK_HEAD_DAMAGE: Math.round(ATTACKS["heavy-run-punch"].damage * 0.85),
  /** Share of the damage that gets through a correctly placed guard (never 0). */
  ROCK_BLOCK_DAMAGE_MULTIPLIER: 0.35,
  /** Push distance (metres) and stagger (seconds) on a hit. */
  ROCK_KNOCKBACK: 0.4,
  ROCK_HITSTUN: 0.2,

  /** At most this many rocks are in the air at once (the oldest is dropped). */
  ROCK_MAX_ACTIVE: 16,
  /** The flight is stepped in fixed slices, in the preview and in the real throw. */
  ROCK_STEP: 1 / 60,
  /**
   * The throw is aimed at the point on the crosshair line this far away (or
   * where the line meets scenery), so the rock leaves the hand but heads for
   * the crosshair instead of travelling parallel to it.
   */
  ROCK_CONVERGE_DISTANCE: 30,
} as const;

/** Damage of a rock that reaches the given body part, before any guard. */
export function rockDamageFor(hurtbox: HurtboxId): number {
  return hurtbox === "head"
    ? ROCK_CONFIG.ROCK_HEAD_DAMAGE
    : ROCK_CONFIG.ROCK_BODY_DAMAGE;
}
