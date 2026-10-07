import * as THREE from "three";

import {
  ATTACKS,
  type AttackDefinition,
  type AttackId,
  type DamageSourceId,
  type HitboxHand,
} from "./AttackDefinitions";
import { CombatEventBus, type AttackEndReason } from "./CombatEvents";
import type { Combatant, HitInfo, Hurtbox, HurtboxId } from "./Combatant";
import {
  guardAlignment,
  guardDotThreshold,
  guardElevation,
  guardElevationRange,
} from "./CombatConfig";
import { capsuleContactScore, createCapsule } from "./Shapes";

/** Roughly where a punch starts: chest height above the attacker's feet. */
const CHEST_HEIGHT = 1.3;

export type AttackPhase = "startup" | "active" | "recovery";

export interface AttackInstance {
  readonly definition: AttackDefinition;
  readonly attacker: Combatant;
  readonly hand: HitboxHand;
  elapsed: number;
  phase: AttackPhase;
  /** Targets already hit by this attack: nobody is damaged twice by one punch. */
  readonly hitTargets: Set<string>;
}

/**
 * Pure combat logic: attack timing, hit detection, damage, blocking and
 * knockback. It has no rendering or input code, so the same class can later run
 * on a server and be fed the same attack starts.
 *
 * Flow: startAttack -> startup -> active (hit detection) -> recovery -> end.
 */
export class CombatSystem {
  public readonly events = new CombatEventBus();

  /**
   * Optional world check: returns true when nothing solid is between the two
   * points. A hit only lands if there is a clear line from the attacker's body
   * to the body part that was struck, so cover stops punches.
   */
  public lineOfSight:
    ((from: THREE.Vector3, to: THREE.Vector3) => boolean) | null = null;

  private readonly combatants: Combatant[] = [];
  private readonly attacks: AttackInstance[] = [];

  private readonly hitboxShape = createCapsule();
  private readonly hurtShape = createCapsule();
  private readonly facing = new THREE.Vector3();
  private readonly defenderFacing = new THREE.Vector3();
  private readonly defenderPosition = new THREE.Vector3();
  private readonly attackerPosition = new THREE.Vector3();
  private readonly sightFrom = new THREE.Vector3();
  private readonly sightTo = new THREE.Vector3();

  public register(combatant: Combatant): void {
    this.combatants.push(combatant);
  }

  public getCombatants(): readonly Combatant[] {
    return this.combatants;
  }

  public getAttacks(): readonly AttackInstance[] {
    return this.attacks;
  }

  public startAttack(
    attackerId: string,
    attackId: AttackId,
    hand: HitboxHand,
  ): void {
    const attacker = this.combatants.find((c) => c.id === attackerId);

    if (!attacker || attacker.isDead()) {
      return;
    }

    // A new attack from the same fighter (a combo chain) replaces the old one.
    this.endAttack(attackerId, "replaced");

    this.attacks.push({
      definition: ATTACKS[attackId],
      attacker,
      hand,
      elapsed: 0,
      phase: "startup",
      hitTargets: new Set<string>(),
    });

    this.events.emit({ type: "attack-started", attackerId, attackId });
  }

  public cancelAttack(attackerId: string): void {
    this.endAttack(attackerId, "cancelled");
  }

  public getAttack(attackerId: string): AttackInstance | undefined {
    return this.attacks.find((a) => a.attacker.id === attackerId);
  }

  public getAttackId(attackerId: string): AttackId | null {
    return (
      this.attacks.find((a) => a.attacker.id === attackerId)?.definition.id ??
      null
    );
  }

  public update(dt: number): void {
    for (const attack of [...this.attacks]) {
      attack.elapsed += dt;

      const { startup, active, recovery } = attack.definition;

      if (attack.elapsed >= startup + active + recovery) {
        this.endAttack(attack.attacker.id, "finished");

        continue;
      }

      const previous = attack.phase;

      attack.phase =
        attack.elapsed < startup
          ? "startup"
          : attack.elapsed < startup + active
            ? "active"
            : "recovery";

      if (previous !== "active" && attack.phase === "active") {
        this.events.emit({
          type: "attack-active",
          attackerId: attack.attacker.id,
          attackId: attack.definition.id,
        });
      }

      if (attack.phase === "active") {
        this.detectHits(attack);
      }
    }
  }

  private endAttack(attackerId: string, reason: AttackEndReason): void {
    const index = this.attacks.findIndex((a) => a.attacker.id === attackerId);

    if (index === -1) {
      return;
    }

    const [attack] = this.attacks.splice(index, 1);

    // hitTargets goes away with the instance, so the next attack starts clean.
    this.events.emit({
      type: "attack-ended",
      attackerId,
      attackId: attack.definition.id,
      reason,
    });
  }

  /**
   * Dot product between the defender's facing and the direction from the
   * defender to the attacker (both horizontal, world space). 1 = attacker dead
   * ahead, 0 = directly to the side, -1 = directly behind. It uses the real
   * positions, not where anyone happens to be aiming.
   */
  private guardAlignment(attacker: Combatant, defender: Combatant): number {
    defender.getFacing(this.defenderFacing);
    defender.getPosition(this.defenderPosition);
    attacker.getPosition(this.attackerPosition);

    return guardAlignment(
      this.defenderFacing.x,
      this.defenderFacing.z,
      this.defenderPosition.x,
      this.defenderPosition.z,
      this.attackerPosition.x,
      this.attackerPosition.z,
    );
  }

  /** "attacker 46 deg up, guard 0 deg" - the numbers behind a vertical check. */
  private verticalDetail(attacker: Combatant, defender: Combatant): string {
    defender.getPosition(this.defenderPosition);
    attacker.getPosition(this.attackerPosition);

    const horizontal = Math.max(
      Math.hypot(
        this.attackerPosition.x - this.defenderPosition.x,
        this.attackerPosition.z - this.defenderPosition.z,
      ),
      0.3,
    );
    const toDegrees = 180 / Math.PI;
    const elevation =
      Math.atan2(
        this.attackerPosition.y - this.defenderPosition.y,
        horizontal,
      ) * toDegrees;

    const { low, high } = guardElevationRange(defender.getLookPitch());

    return `attacker ${elevation.toFixed(0)}\u00b0, guard covers ${(low * toDegrees).toFixed(0)}\u00b0 to ${(high * toDegrees).toFixed(0)}\u00b0`;
  }

  /** Is the defender looking (pitch) toward where the attacker is, up or down? */
  private guardAimedAtAttacker(
    attacker: Combatant,
    defender: Combatant,
  ): boolean {
    defender.getPosition(this.defenderPosition);
    attacker.getPosition(this.attackerPosition);

    const horizontal = Math.hypot(
      this.attackerPosition.x - this.defenderPosition.x,
      this.attackerPosition.z - this.defenderPosition.z,
    );

    const elevation = guardElevation(
      this.defenderPosition.y,
      this.attackerPosition.y,
      horizontal,
    );
    const { low, high } = guardElevationRange(defender.getLookPitch());

    return elevation >= low && elevation <= high;
  }

  private detectHits(attack: AttackInstance): void {
    const { attacker, definition, hand } = attack;

    if (!attacker.getAttackShape(hand, definition, this.hitboxShape)) {
      return;
    }

    for (const target of this.combatants) {
      if (
        target === attacker ||
        target.isDead() ||
        attack.hitTargets.has(target.id)
      ) {
        continue;
      }

      // A big hitbox can touch several body parts at once; the one it meets
      // most squarely (smallest contact score) is the part that was hit.
      let struck: Hurtbox | null = null;
      let bestScore = 1;

      for (const hurtbox of target.getHurtboxes()) {
        if (!hurtbox.getShape(this.hurtShape)) {
          continue;
        }

        const score = capsuleContactScore(this.hitboxShape, this.hurtShape);

        if (score <= bestScore) {
          bestScore = score;
          struck = hurtbox;
        }
      }

      if (struck && !this.hasClearLine(attacker, struck)) {
        // Cover is in the way: no hit, and the punch can still connect later
        // in its active window if the line opens up.
        struck = null;
      }

      if (struck) {
        attack.hitTargets.add(target.id);
        this.resolveHit(attack, target, struck.id, struck.damageMultiplier);
      }
    }
  }

  /** Clear line from the attacker's chest to the middle of the struck body part. */
  private hasClearLine(attacker: Combatant, hurtbox: Hurtbox): boolean {
    if (!this.lineOfSight || !hurtbox.getShape(this.hurtShape)) {
      return true;
    }

    attacker.getPosition(this.sightFrom);
    this.sightFrom.y += CHEST_HEIGHT;
    this.sightTo
      .addVectors(this.hurtShape.start, this.hurtShape.end)
      .multiplyScalar(0.5);

    return this.lineOfSight(this.sightFrom, this.sightTo);
  }

  private resolveHit(
    attack: AttackInstance,
    target: Combatant,
    hurtboxId: HitInfo["hurtbox"],
    damageMultiplier: number,
  ): void {
    const { definition, attacker } = attack;

    // Knockback follows the attacker's actual facing, never a world axis.
    attacker.getFacing(this.facing);
    this.facing.y = 0;
    this.facing.normalize();

    const hit: HitInfo = {
      attackId: definition.id,
      attackerId: attacker.id,
      hurtbox: hurtboxId,
      damage: Math.round(definition.damage * damageMultiplier),
      knockback: definition.knockback,
      knockbackDirection: this.facing.clone(),
      hitstun: definition.hitstun,
    };

    if (target.isBlocking()) {
      const alignment = this.guardAlignment(attacker, target);
      const insideCone = alignment >= guardDotThreshold();
      const aimedAtAttacker = this.guardAimedAtAttacker(attacker, target);
      const verticalDetail = this.verticalDetail(attacker, target);
      const covered = target.getGuardedParts().includes(hurtboxId);

      if (!definition.canBeBlocked) {
        // Heavy attacks can't be blocked. A guard that is correctly placed
        // (same checks as a real block) still softens the hit; otherwise the
        // full damage lands.
        if (insideCone && aimedAtAttacker && covered) {
          hit.damage = Math.round(
            hit.damage * definition.guardedDamageMultiplier,
          );

          this.events.emit({
            type: "guard-reduced",
            attackerId: attacker.id,
            attackId: definition.id,
            targetId: target.id,
            targetName: target.name,
            multiplier: definition.guardedDamageMultiplier,
          });
        } else {
          this.events.emit({
            type: "guard-ignored",
            attackerId: attacker.id,
            attackId: definition.id,
            targetId: target.id,
            targetName: target.name,
          });
        }
      } else {
        if (insideCone && aimedAtAttacker && covered) {
          target.onBlocked(hit);

          this.events.emit({
            type: "blocked",
            attackerId: attacker.id,
            attackId: definition.id,
            targetId: target.id,
            targetName: target.name,
          });

          return;
        }

        // Outside the guard cone, or aimed at a part the guard doesn't cover
        // (e.g. the legs against a standing guard): the block fails, normal hit.
        this.events.emit({
          type: "block-failed",
          attackerId: attacker.id,
          attackId: definition.id,
          targetId: target.id,
          targetName: target.name,
          reason: !insideCone
            ? alignment < 0
              ? "rear"
              : "outside-guard"
            : !aimedAtAttacker
              ? "vertical"
              : "below-guard",
          detail: verticalDetail,
        });
      }
    }

    this.applyDamage(attacker, target, hit, definition.id);
  }

  /** Damage, reaction and the hit / died events: shared by punches and projectiles. */
  private applyDamage(
    attacker: Combatant,
    target: Combatant,
    hit: HitInfo,
    sourceId: DamageSourceId,
  ): void {
    target.health.damage(hit.damage);
    target.onHit(hit);

    this.events.emit({
      type: "hit",
      attackerId: attacker.id,
      attackId: sourceId,
      targetId: target.id,
      targetName: target.name,
      hurtbox: hit.hurtbox,
      damage: hit.damage,
      knockback: hit.knockback,
      healthLeft: target.health.current,
    });

    if (target.health.isDead) {
      this.events.emit({
        type: "died",
        targetId: target.id,
        targetName: target.name,
      });
    }
  }

  /**
   * Damage from the environment (a fire zone), through the same health, hit
   * event and reaction pipeline as a punch. It has no guard: standing behind a
   * block does nothing against it. Returns null if the target is gone or dead.
   */
  public applyHazardDamage(input: {
    sourceId: DamageSourceId;
    attackerId: string;
    targetId: string;
    hurtbox: HurtboxId;
    damage: number;
  }): HitInfo | null {
    const attacker = this.combatants.find((c) => c.id === input.attackerId);
    const target = this.combatants.find((c) => c.id === input.targetId);

    if (!attacker || !target || target.isDead()) {
      return null;
    }

    const hit: HitInfo = {
      attackId: input.sourceId,
      attackerId: attacker.id,
      hurtbox: input.hurtbox,
      damage: Math.max(0, Math.round(input.damage)),
      knockback: 0,
      knockbackDirection: new THREE.Vector3(0, 0, 1),
      hitstun: 0,
    };

    this.applyDamage(attacker, target, hit, input.sourceId);

    return hit;
  }

  /**
   * A projectile has reached a body part. This is where the result is decided,
   * so it is the one place a server would run it: the shooter only says "I
   * threw", never "I hit".
   *
   * It uses the same directional guard as melee (the cone, the aim and the
   * covered parts, measured against the thrower), but a guarded projectile is
   * softened rather than stopped: the hit still lands, at `guardMultiplier`
   * of the damage, never zero.
   */
  public resolveProjectileHit(input: {
    sourceId: DamageSourceId;
    attackerId: string;
    targetId: string;
    hurtbox: HurtboxId;
    /** Damage for this body part before any guard. */
    damage: number;
    knockback: number;
    hitstun: number;
    /** Direction the projectile was travelling (flattened to horizontal here). */
    direction: THREE.Vector3;
    guardMultiplier: number;
  }): HitInfo | null {
    const attacker = this.combatants.find((c) => c.id === input.attackerId);
    const target = this.combatants.find((c) => c.id === input.targetId);

    if (!attacker || !target || target.isDead() || target === attacker) {
      return null;
    }

    const direction = input.direction.clone().setY(0);

    if (direction.lengthSq() < 1e-8) {
      attacker.getFacing(direction);
    }

    const hit: HitInfo = {
      attackId: input.sourceId,
      attackerId: attacker.id,
      hurtbox: input.hurtbox,
      damage: Math.round(input.damage),
      knockback: input.knockback,
      knockbackDirection: direction.setY(0).normalize(),
      hitstun: input.hitstun,
    };

    if (target.isBlocking()) {
      const alignment = this.guardAlignment(attacker, target);
      const insideCone = alignment >= guardDotThreshold();
      const aimedAtAttacker = this.guardAimedAtAttacker(attacker, target);
      const covered = target.getGuardedParts().includes(input.hurtbox);

      if (insideCone && aimedAtAttacker && covered) {
        hit.damage = Math.max(
          1,
          Math.round(hit.damage * input.guardMultiplier),
        );
        // A guarded hit shoves and staggers less.
        hit.knockback *= 0.25;
        hit.hitstun *= 0.25;

        this.events.emit({
          type: "guard-reduced",
          attackerId: attacker.id,
          attackId: input.sourceId,
          targetId: target.id,
          targetName: target.name,
          multiplier: input.guardMultiplier,
        });
      } else {
        this.events.emit({
          type: "block-failed",
          attackerId: attacker.id,
          attackId: input.sourceId,
          targetId: target.id,
          targetName: target.name,
          reason: !insideCone
            ? alignment < 0
              ? "rear"
              : "outside-guard"
            : !aimedAtAttacker
              ? "vertical"
              : "below-guard",
          detail: this.verticalDetail(attacker, target),
        });
      }
    }

    this.applyDamage(attacker, target, hit, input.sourceId);

    return hit;
  }
}
