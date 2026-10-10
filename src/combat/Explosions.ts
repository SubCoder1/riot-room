import * as THREE from "three";

import type { CombatSystem } from "./CombatSystem";
import type { HurtboxId } from "./Combatant";
import { GRENADE_CONFIG as C } from "./GrenadeConfig";
import { createCapsule } from "./Shapes";
import type { ThrowWorld } from "./ThrowableFlight";

/** What one explosion did to one fighter. */
export interface BlastHit {
  targetId: string;
  hurtbox: HurtboxId;
  /** Metres from the blast to the nearest exposed part of the body. */
  distance: number;
  /** Damage dealt (after falloff and any guard). */
  damage: number;
}

/**
 * Damage of a blast at a given distance from its centre: the maximum at the
 * centre, falling to a small share at the edge of the radius and nothing
 * beyond it. THE falloff: the explosion's damage and push both follow it.
 */
export function blastShare(distance: number, radius = C.GRENADE_BLAST_RADIUS) {
  if (distance >= radius) {
    return 0;
  }

  const near = 1 - Math.max(distance, 0) / radius;

  return (
    C.GRENADE_EDGE_DAMAGE_SHARE +
    (1 - C.GRENADE_EDGE_DAMAGE_SHARE) *
      Math.pow(near, C.GRENADE_FALLOFF_EXPONENT)
  );
}

const closest = new THREE.Vector3();
const axis = new THREE.Vector3();
const toPoint = new THREE.Vector3();

/** The point on segment a-b closest to p, written to `out`. */
function closestOnSegment(
  a: THREE.Vector3,
  b: THREE.Vector3,
  p: THREE.Vector3,
  out: THREE.Vector3,
): THREE.Vector3 {
  axis.subVectors(b, a);

  const length = axis.lengthSq();
  const t =
    length < 1e-9
      ? 0
      : THREE.MathUtils.clamp(
          toPoint.subVectors(p, a).dot(axis) / length,
          0,
          1,
        );

  return out.copy(a).addScaledVector(axis, t);
}

/**
 * Grenade explosions. Pure logic over the Combatant interface, with no
 * rendering, so a server can run the same class: `detonate` is the ONE place
 * a blast is resolved. Who is hurt, how much and how far they are pushed is
 * decided here and applied through the combat system's usual health, hit and
 * reaction pipeline.
 *
 * Solid geometry stops the blast: a body is only hurt through the parts of it
 * the explosion has a clear line to (the same world check the flight uses).
 */
export class ExplosionSystem {
  private readonly combat: CombatSystem;
  private readonly world: ThrowWorld;
  private readonly shape = createCapsule();
  private readonly centre = new THREE.Vector3();
  private readonly push = new THREE.Vector3();
  private readonly bodyAt = new THREE.Vector3();

  constructor(combat: CombatSystem, world: ThrowWorld) {
    this.combat = combat;
    this.world = world;
  }

  /**
   * Goes off at `point`. Every fighter is considered exactly once, so one
   * explosion can never hurt the same fighter twice. Returns who was hurt.
   */
  public detonate(ownerId: string, point: THREE.Vector3): BlastHit[] {
    const radius = C.GRENADE_BLAST_RADIUS;
    const hits: BlastHit[] = [];

    // Measured from a little above the floor so a grenade lying on the ground
    // still "sees" a body standing next to it.
    this.centre.copy(point);
    this.centre.y += C.GRENADE_BLAST_LIFT;

    this.combat.events.emit({
      type: "explosion",
      ownerId,
      x: point.x,
      y: point.y,
      z: point.z,
      radius,
    });

    for (const target of this.combat.getCombatants()) {
      if (target.isDead()) {
        continue;
      }

      const self = target.id === ownerId;

      if (self && C.GRENADE_SELF_DAMAGE_MULTIPLIER <= 0) {
        continue;
      }

      // The nearest body part the blast has a clear line to.
      let best: { id: HurtboxId; distance: number } | null = null;

      for (const hurtbox of target.getHurtboxes()) {
        if (!hurtbox.getShape(this.shape)) {
          continue;
        }

        closestOnSegment(
          this.shape.start,
          this.shape.end,
          this.centre,
          closest,
        );

        const distance = Math.max(
          0,
          closest.distanceTo(this.centre) - this.shape.radius,
        );

        if (distance >= radius || (best && distance >= best.distance)) {
          continue;
        }

        if (this.world.clearFraction(this.centre, closest) < 1) {
          continue;
        }

        best = { id: hurtbox.id, distance };
      }

      if (!best) {
        continue;
      }

      const share = blastShare(best.distance, radius);
      let damage = C.GRENADE_MAX_DAMAGE * share;

      if (self) {
        damage *= C.GRENADE_SELF_DAMAGE_MULTIPLIER;
      }

      if (target.isBlocking()) {
        damage *= C.GRENADE_GUARD_MULTIPLIER;
        this.combat.events.emit({
          type: "guard-reduced",
          attackerId: ownerId,
          attackId: "grenade-blast",
          targetId: target.id,
          targetName: target.name,
          multiplier: C.GRENADE_GUARD_MULTIPLIER,
        });
      }

      damage = Math.max(1, Math.round(damage));

      // Pushed straight away from the blast, along the ground.
      target.getPosition(this.bodyAt);
      this.push.subVectors(this.bodyAt, point).setY(0);

      const hit = this.combat.applyHazardDamage({
        sourceId: "grenade-blast",
        attackerId: ownerId,
        targetId: target.id,
        hurtbox: best.id,
        damage,
        knockback: C.GRENADE_KNOCKBACK * share,
        hitstun: C.GRENADE_HITSTUN * share,
        direction: this.push,
      });

      if (hit) {
        hits.push({
          targetId: target.id,
          hurtbox: best.id,
          distance: best.distance,
          damage: hit.damage,
        });
      }
    }

    return hits;
  }
}
