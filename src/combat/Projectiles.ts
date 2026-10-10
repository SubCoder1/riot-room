import * as THREE from "three";

import type { CombatSystem } from "./CombatSystem";
import { createCapsule, segmentCapsuleEntry } from "./Shapes";
import { GRENADE_CONFIG } from "./GrenadeConfig";
import { SMOKE_CONFIG } from "./SmokeConfig";
import { THROW_CONFIG } from "./ThrowConfig";
import {
  GRENADE_PROFILE,
  MOLOTOV_PROFILE,
  SMOKE_PROFILE,
  impactInStep,
  launchThrowable,
  stepThrowable,
  type FlightProfile,
  type ThrowBody,
  type ThrowImpact,
  type ThrowWorld,
} from "./ThrowableFlight";

/**
 * What is flying: a normal grenade (bounces, then explodes when its fuse runs
 * out), a Molotov (bursts into fire on whatever it meets) or a smoke grenade
 * (bounces, then starts to emit smoke when its fuse runs out).
 */
export type ThrowableKind = "grenade" | "molotov" | "smoke";

export const PROFILES: Record<ThrowableKind, FlightProfile> = {
  grenade: GRENADE_PROFILE,
  molotov: MOLOTOV_PROFILE,
  smoke: SMOKE_PROFILE,
};

/** Seconds from the throw to the detonation, per kind (a Molotov has no fuse). */
export const FUSES: Record<ThrowableKind, number> = {
  grenade: GRENADE_CONFIG.GRENADE_FUSE,
  molotov: Number.POSITIVE_INFINITY,
  smoke: SMOKE_CONFIG.SMOKE_FUSE,
};

export interface ThrownItem extends ThrowBody {
  readonly id: number;
  readonly kind: ThrowableKind;
  readonly ownerId: string;
  /** Path length so far, metres. */
  travelled: number;
  /** Time not yet consumed by fixed steps. */
  carry: number;
  /** Times it has bounced off scenery or bodies. */
  bounces: number;
  /** Seconds since it left the hand. */
  age: number;
  /** Seconds left on the fuse (never runs out for a Molotov). */
  fuse: number;
  /** True while it is rolling along a surface (the fuse keeps running). */
  rolling: boolean;
  /** True once it has come to rest on a surface. */
  resting: boolean;
}

/**
 * The thrown items. Pure logic over the Combatant interface: no rendering and
 * no input, so a server can run the same class.
 *
 * Only the throw is an input: `throwProjectile(kind, owner, origin, direction)`.
 * Where it goes, when it bursts or goes off and who is hurt is decided here
 * (and in the fire, explosion and smoke systems behind the callbacks), never
 * by the thrower.
 */
export class ProjectileSystem {
  private readonly items: ThrownItem[] = [];
  private nextId = 1;

  private readonly before = new THREE.Vector3();
  private readonly step = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly probe = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly bodyAt = new THREE.Vector3();
  private readonly impact: ThrowImpact = {
    point: new THREE.Vector3(),
    fraction: 0,
  };
  private readonly shape = createCapsule();
  private readonly reach = createCapsule();

  private readonly combat: CombatSystem;
  private readonly world: ThrowWorld;

  /**
   * Called where a Molotov broke (on scenery, the floor or a body). The fire
   * system lives behind this, so projectiles do not know about fire.
   */
  public onBurst: ((item: ThrownItem, point: THREE.Vector3) => void) | null =
    null;

  /**
   * Called once when a grenade's or smoke grenade's fuse runs out, with the
   * item (its `kind` says which) and where it lies. The item is already gone
   * from the system, so nothing can detonate twice.
   */
  public onDetonate: ((item: ThrownItem, point: THREE.Vector3) => void) | null =
    null;

  constructor(combat: CombatSystem, world: ThrowWorld) {
    this.combat = combat;
    this.world = world;
  }

  /** The items in the air or on the ground waiting for their fuse (read only: drawing and debug). */
  public get active(): readonly ThrownItem[] {
    return this.items;
  }

  public throwProjectile(
    kind: ThrowableKind,
    ownerId: string,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
  ): ThrownItem {
    // A full sky drops the oldest rather than refusing the throw.
    while (this.items.length >= THROW_CONFIG.THROW_MAX_ACTIVE) {
      this.items.shift();
    }

    const item: ThrownItem = {
      id: this.nextId++,
      kind,
      ownerId,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      travelled: 0,
      carry: 0,
      bounces: 0,
      age: 0,
      fuse: FUSES[kind],
      rolling: false,
      resting: false,
    };

    launchThrowable(
      item,
      origin,
      direction.clone().normalize(),
      PROFILES[kind],
    );
    this.items.push(item);

    return item;
  }

  public clear(): void {
    this.items.length = 0;
  }

  public update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];

      item.carry += dt;

      let alive = true;

      while (alive && item.carry >= THROW_CONFIG.THROW_STEP) {
        item.carry -= THROW_CONFIG.THROW_STEP;
        alive = this.advance(item);
      }

      if (!alive) {
        // Removed before the callback so nothing can go off twice for one item.
        const at = this.items.indexOf(item);

        if (at >= 0) {
          this.items.splice(at, 1);
        }

        if (item.fuse <= 0 && item.kind !== "molotov") {
          this.onDetonate?.(item, item.position);
        }
      }
    }
  }

  /** One fixed step. False once the item is spent (burst, gone off or out of range). */
  private advance(item: ThrownItem): boolean {
    const profile = PROFILES[item.kind];

    item.age += THROW_CONFIG.THROW_STEP;

    if (item.kind !== "molotov") {
      item.fuse -= THROW_CONFIG.THROW_STEP;

      if (item.fuse <= 0) {
        return false;
      }

      // Lying still on a surface: nothing to simulate, just wait for the fuse.
      if (item.resting) {
        return true;
      }
    }

    // Rolling along a surface wears the speed off (per second, not per hop).
    if (item.rolling) {
      const keep = Math.exp(
        -THROW_CONFIG.THROW_ROLL_DRAG * THROW_CONFIG.THROW_STEP,
      );

      item.velocity.x *= keep;
      item.velocity.z *= keep;
    }

    this.before.copy(item.position);
    stepThrowable(item, THROW_CONFIG.THROW_STEP);

    const wall = impactInStep(this.before, item, this.world, this.impact)
      ? this.impact.fraction
      : 1;

    const struck = this.firstBodyHit(item, wall);

    if (item.kind === "molotov") {
      // A bottle breaks on whatever it meets, a body included.
      if (struck) {
        this.onBurst?.(item, item.position);

        return false;
      }

      if (wall < 1) {
        this.onBurst?.(item, this.impact.point);

        return false;
      }
    } else if (struck && struck.fraction < wall) {
      // A grenade glances off a body and drops: it hurts nobody by hitting.
      this.glanceOff(item, struck.position);
    } else if (wall < 1) {
      this.bounce(item);
    }

    return item.travelled < profile.maxRange;
  }

  /** The item hit a body: turn it away from that body and let it fall. */
  private glanceOff(item: ThrownItem, bodyPosition: THREE.Vector3): void {
    const away = this.normal.subVectors(this.before, bodyPosition).setY(0);

    if (away.lengthSq() < 1e-8) {
      away.copy(item.velocity).negate().setY(0);
    }

    away.normalize();

    const into = item.velocity.dot(away);

    if (into < 0) {
      // Mirror the speed that was going into the body.
      item.velocity.addScaledVector(away, -2 * into);
    }

    item.velocity.multiplyScalar(THROW_CONFIG.THROW_BODY_RESTITUTION);
    item.position.copy(this.before);
    this.fall(item);
    item.bounces++;
  }

  /** From now on it is under full gravity. */
  private fall(item: ThrownItem): void {
    const profile = PROFILES[item.kind];

    item.travelled = Math.max(
      item.travelled,
      profile.gravityStart + profile.gravityRamp,
    );
  }

  /**
   * The item hit scenery or the floor: work out which way the surface faces.
   * Landing hard it bounces off with less speed; landing softly on something
   * level it rolls along it, slowing down, until it comes to rest.
   */
  private bounce(item: ThrownItem): void {
    const radius = PROFILES[item.kind].radius;
    const point = this.impact.point;
    const delta = this.step.subVectors(item.position, this.before);
    const normal = this.normal.set(0, 0, 0);

    // Which axis of the step was stopped: the surface faces back along it.
    for (const axis of ["x", "y", "z"] as const) {
      const move = delta[axis];

      if (Math.abs(move) < 1e-9) {
        continue;
      }

      this.probe.copy(point);
      this.probe[axis] += move;

      const blocked =
        (axis === "y" && point.y + move <= radius) ||
        this.world.clearFraction(point, this.probe) < 1;

      if (blocked) {
        normal[axis] = -Math.sign(move);
      }
    }

    // A corner, or a graze: just come back the way it went.
    if (normal.lengthSq() < 1e-9) {
      normal.copy(item.velocity).normalize().negate();
    }

    normal.normalize();

    const into = item.velocity.dot(normal);

    // Out of the surface, and under full gravity from here on. (The floor's
    // impact point is already the centre's height: only scenery needs the lift.)
    if (normal.y > 0.7 && point.y <= radius + 1e-4) {
      item.position.copy(point);
      item.position.y = radius + 0.002;
    } else {
      item.position.copy(point).addScaledVector(normal, radius + 0.01);
    }

    this.fall(item);
    item.bounces++;

    if (normal.y > 0.7 && -into < THROW_CONFIG.THROW_ROLL_ENTER_SPEED) {
      // Rolling: the speed into the floor is gone, the sliding speed stays
      // (and wears off a little every step, see advance).
      this.step.copy(normal).multiplyScalar(into);
      this.tangent.copy(item.velocity).sub(this.step);
      item.velocity.copy(this.tangent);
      item.rolling = true;

      if (item.velocity.length() < THROW_CONFIG.THROW_REST_SPEED) {
        item.velocity.set(0, 0, 0);
        item.resting = true;
      }

      return;
    }

    if (into < 0) {
      this.step.copy(normal).multiplyScalar(into);
      this.tangent.copy(item.velocity).sub(this.step);
      item.velocity
        .copy(this.tangent)
        .multiplyScalar(1 - THROW_CONFIG.THROW_BOUNCE_FRICTION)
        .addScaledVector(this.step, -THROW_CONFIG.THROW_BOUNCE_RESTITUTION);
    }
  }

  /**
   * The body part this step's sweep meets first, if it gets there before the
   * scenery does. The thrower is never struck by their own item.
   */
  private firstBodyHit(
    item: ThrownItem,
    wallFraction: number,
  ): { fraction: number; position: THREE.Vector3 } | null {
    let best: { fraction: number; position: THREE.Vector3 } | null = null;
    let bestFraction = wallFraction;

    for (const target of this.combat.getCombatants()) {
      if (target.id === item.ownerId || target.isDead()) {
        continue;
      }

      for (const hurtbox of target.getHurtboxes()) {
        if (!hurtbox.getShape(this.shape)) {
          continue;
        }

        // The item is a small sphere: fatten the body part by its radius.
        this.reach.start.copy(this.shape.start);
        this.reach.end.copy(this.shape.end);
        this.reach.radius = this.shape.radius + PROFILES[item.kind].radius;

        const entry = segmentCapsuleEntry(
          this.before,
          item.position,
          this.reach,
        );

        if (entry !== null && entry < bestFraction) {
          bestFraction = entry;
          target.getPosition(this.bodyAt);
          best = { fraction: entry, position: this.bodyAt };
        }
      }
    }

    return best;
  }
}
