/**
 * All attack tuning lives here. Gameplay code only refers to attacks by id, so
 * damage, timing and knockback can be changed without touching any handler.
 *
 * Times are in seconds, measured from the moment the attack starts (the click):
 *
 *   startup  -> nothing can hit yet
 *   active   -> the hitbox is live
 *   recovery -> the hitbox is gone, the attacker is finishing the move
 *
 * They are matched to the existing punch animations (the strike lands roughly
 * at the end of startup).
 */

export type AttackId =
  | "light-punch"
  | "heavy-run-punch"
  | "flying-light-punch"
  | "flying-heavy-punch";

export type AttackCategory = "light" | "heavy" | "aerial";

export type HitboxHand = "right" | "left";

export interface AttackDefinition {
  id: AttackId;
  category: AttackCategory;
  damage: number;
  startup: number;
  active: number;
  recovery: number;
  /** The hitbox is a capsule from the elbow to just past the fist. */
  hitboxRadius: number;
  /**
   * How far the capsule extends beyond the fist, along the forearm (or, for the
   * player, along the crosshair direction). The
   * arm is short (~0.47 m), so this is what gives a punch its effective range.
   */
  hitboxReach: number;
  /** Approximate distance (metres) the target is pushed. */
  knockback: number;
  /** Seconds the target is staggered. */
  hitstun: number;
  /**
   * Light attacks can be blocked, but only from the defender's guard direction.
   * Heavy attacks cannot be blocked at all.
   */
  canBeBlocked: boolean;
  /**
   * For attacks that can't be blocked: the share of damage that still gets
   * through when the defender's guard is up and correctly placed (facing the
   * attacker, aimed at them, covering the part hit). 1 = no reduction.
   */
  guardedDamageMultiplier: number;
}

export const ATTACKS: Record<AttackId, AttackDefinition> = {
  "light-punch": {
    id: "light-punch",
    category: "light",
    damage: 10,
    startup: 0.05,
    active: 0.1,
    recovery: 0.11,
    hitboxRadius: 0.22,
    hitboxReach: 0.53,
    knockback: 0.5,
    hitstun: 0.25,
    canBeBlocked: true,
    guardedDamageMultiplier: 1,
  },
  "heavy-run-punch": {
    id: "heavy-run-punch",
    category: "heavy",
    damage: 25,
    startup: 0.2,
    active: 0.12,
    recovery: 0.26,
    hitboxRadius: 0.26,
    hitboxReach: 0.63,
    knockback: 1.2,
    hitstun: 0.45,
    canBeBlocked: false,
    guardedDamageMultiplier: 0.5,
  },
  "flying-light-punch": {
    id: "flying-light-punch",
    category: "aerial",
    damage: 15,
    startup: 0.17,
    active: 0.12,
    recovery: 0.3,
    hitboxRadius: 0.24,
    hitboxReach: 0.58,
    knockback: 0.9,
    hitstun: 0.35,
    canBeBlocked: true,
    guardedDamageMultiplier: 1,
  },
  "flying-heavy-punch": {
    id: "flying-heavy-punch",
    category: "aerial",
    damage: 30,
    startup: 0.22,
    active: 0.12,
    recovery: 0.4,
    hitboxRadius: 0.28,
    hitboxReach: 0.68,
    knockback: 1.8,
    hitstun: 0.55,
    canBeBlocked: false,
    guardedDamageMultiplier: 0.5,
  },
};
