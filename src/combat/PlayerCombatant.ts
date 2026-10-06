import * as THREE from "three";

import type { AttackDefinition, HitboxHand } from "./AttackDefinitions";
import {
  Health,
  type Combatant,
  type HitInfo,
  type Hurtbox,
  type HurtboxId,
} from "./Combatant";
import type { CharacterRig } from "./CharacterRig";
import { guardedPartsFor } from "./CombatConfig";
import type { CapsuleShape } from "./Shapes";

/**
 * The local player as a combatant. It only reads what it needs (facing and
 * guard state) through small callbacks, so it doesn't depend on the player or
 * input classes.
 */
export class PlayerCombatant implements Combatant {
  public readonly id = "player";
  public readonly name = "Player";
  public readonly health = new Health(100);

  private readonly rig: CharacterRig;
  private readonly getYaw: () => number;
  private readonly getBlocking: () => boolean;
  private readonly getAim: () => THREE.Vector3;
  private readonly getFeet: () => THREE.Vector3;
  private readonly getCrouching: () => boolean;
  private readonly getPitch: () => number;
  private readonly hurtboxes: Hurtbox[];

  constructor(
    rig: CharacterRig,
    getYaw: () => number,
    getBlocking: () => boolean,
    getAim: () => THREE.Vector3,
    getFeet: () => THREE.Vector3,
    getCrouching: () => boolean,
    getPitch: () => number,
  ) {
    this.rig = rig;
    this.getPitch = getPitch;
    this.getCrouching = getCrouching;
    this.getFeet = getFeet;
    this.getAim = getAim;
    this.getYaw = getYaw;
    this.getBlocking = getBlocking;
    this.hurtboxes = rig.createHurtboxes();
  }

  public isDead(): boolean {
    return this.health.isDead;
  }

  public isBlocking(): boolean {
    return this.getBlocking();
  }

  public getLookPitch(): number {
    return this.getPitch();
  }

  public getGuardedParts(): readonly HurtboxId[] {
    if (!this.getBlocking()) {
      return [];
    }

    return guardedPartsFor(this.getCrouching(), this.getPitch());
  }

  public getHurtboxes(): Hurtbox[] {
    return this.hurtboxes;
  }

  public getFacing(out: THREE.Vector3): THREE.Vector3 {
    const yaw = this.getYaw();

    return out.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  }

  public getPosition(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.getFeet());
  }

  public getAttackShape(
    hand: HitboxHand,
    definition: AttackDefinition,
    out: CapsuleShape,
  ): boolean {
    // Punches follow the crosshair, not wherever the arm happens to point.
    return this.rig.getAttackShape(hand, definition, out, this.getAim());
  }

  // Nobody attacks the player yet; real reactions come with player-vs-player.
  public onHit(hit: HitInfo): void {
    void hit;
  }

  public onBlocked(hit: HitInfo): void {
    void hit;
  }
}
