import * as THREE from "three";

import type {
  AttackDefinition,
  AttackId,
  HitboxHand,
} from "./AttackDefinitions";
import type { CapsuleShape } from "./Shapes";

export class Health {
  public readonly max: number;
  public current: number;

  constructor(max: number) {
    this.max = max;
    this.current = max;
  }

  public get isDead(): boolean {
    return this.current <= 0;
  }

  /** Returns the damage actually dealt. */
  public damage(amount: number): number {
    const dealt = Math.min(Math.max(amount, 0), this.current);

    this.current -= dealt;

    return dealt;
  }

  public reset(): void {
    this.current = this.max;
  }
}

export type HurtboxId = "head" | "torso" | "legs";

export interface Hurtbox {
  id: HurtboxId;
  /** Damage scale for this body part (1 for now; room for headshots later). */
  damageMultiplier: number;
  /** Fills `out` with the current world-space shape. False if not ready. */
  getShape(out: CapsuleShape): boolean;
}

export interface HitInfo {
  attackId: AttackId;
  attackerId: string;
  hurtbox: HurtboxId;
  damage: number;
  /** Approximate push distance in metres. */
  knockback: number;
  /** Horizontal direction the attacker is facing. */
  knockbackDirection: THREE.Vector3;
  hitstun: number;
}

/**
 * Anything that can attack or be attacked: the player, the training dummy and,
 * later, remote players. The combat system only talks to this interface and
 * never to the renderer or the input code.
 */
export interface Combatant {
  readonly id: string;
  readonly name: string;
  readonly health: Health;

  isDead(): boolean;
  isBlocking(): boolean;

  /**
   * Body parts the current guard protects. A standing guard covers the head and
   * torso only, so a hit to the legs gets through; a crouched guard covers
   * everything. Empty when not blocking.
   */
  getGuardedParts(): readonly HurtboxId[];

  getHurtboxes(): Hurtbox[];

  /** Horizontal forward direction. */
  getFacing(out: THREE.Vector3): THREE.Vector3;

  /** World position of the fighter's feet. */
  getPosition(out: THREE.Vector3): THREE.Vector3;

  /** Look pitch in radians (positive = up); the guard points where they look. */
  getLookPitch(): number;

  /** Attack hitbox for the given hand. False if the rig isn't ready. */
  getAttackShape(
    hand: HitboxHand,
    definition: AttackDefinition,
    out: CapsuleShape,
  ): boolean;

  /** Damage has already been applied to `health`. */
  onHit(hit: HitInfo): void;

  onBlocked(hit: HitInfo): void;
}
