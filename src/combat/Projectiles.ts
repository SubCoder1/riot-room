import * as THREE from "three";

import type { CombatSystem } from "./CombatSystem";
import { createCapsule, segmentCapsuleEntry } from "./Shapes";
import { ROCK_CONFIG, rockDamageFor } from "./RockConfig";
import {
  MOLOTOV_PROFILE,
  ROCK_PROFILE,
  launchRock,
  rockImpactInStep,
  stepRock,
  type RockBody,
  type RockImpact,
  type RockWorld,
} from "./RockFlight";

/** What is flying: a rock (hurts what it hits) or a Molotov (bursts into fire). */
export type ThrowableKind = "rock" | "molotov";

export interface RockProjectile extends RockBody {
  readonly id: number;
  readonly kind: ThrowableKind;
  readonly ownerId: string;
  /** Path length so far, metres. */
  travelled: number;
  /** Time not yet consumed by fixed steps. */
  carry: number;
}

/**
 * The thrown rocks. Pure logic over the Combatant interface: no rendering and
 * no input, so a server can run the same class.
 *
 * Only the throw is an input: `throwRock(owner, origin, direction)`. Whether it
 * hits, where (head or body), through a guard or not, and for how much is
 * decided here (and in CombatSystem.resolveProjectileHit), never by the thrower.
 */
export class ProjectileSystem {
  private readonly rocks: RockProjectile[] = [];
  private nextId = 1;

  private readonly before = new THREE.Vector3();
  private readonly step = new THREE.Vector3();
  private readonly impact: RockImpact = {
    point: new THREE.Vector3(),
    fraction: 0,
  };
  private readonly shape = createCapsule();
  private readonly reach = createCapsule();

  private readonly combat: CombatSystem;
  private readonly world: RockWorld;

  /**
   * Called where a Molotov broke (on scenery, the floor or a body). The fire
   * system lives behind this, so projectiles do not know about fire.
   */
  public onBurst:
    ((rock: RockProjectile, point: THREE.Vector3) => void) | null = null;

  constructor(combat: CombatSystem, world: RockWorld) {
    this.combat = combat;
    this.world = world;
  }

  /** The rocks in the air (read only: drawing and debug). */
  public get active(): readonly RockProjectile[] {
    return this.rocks;
  }

  public throwRock(
    ownerId: string,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
  ): RockProjectile {
    return this.throwProjectile("rock", ownerId, origin, direction);
  }

  public throwProjectile(
    kind: ThrowableKind,
    ownerId: string,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
  ): RockProjectile {
    // A full sky drops the oldest rock rather than refusing the throw.
    while (this.rocks.length >= ROCK_CONFIG.ROCK_MAX_ACTIVE) {
      this.rocks.shift();
    }

    const rock: RockProjectile = {
      id: this.nextId++,
      kind,
      ownerId,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      travelled: 0,
      carry: 0,
    };

    launchRock(
      rock,
      origin,
      direction.clone().normalize(),
      kind === "molotov" ? MOLOTOV_PROFILE : ROCK_PROFILE,
    );
    this.rocks.push(rock);

    return rock;
  }

  public clear(): void {
    this.rocks.length = 0;
  }

  public update(dt: number): void {
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const rock = this.rocks[i];

      rock.carry += dt;

      let alive = true;

      while (alive && rock.carry >= ROCK_CONFIG.ROCK_STEP) {
        rock.carry -= ROCK_CONFIG.ROCK_STEP;
        alive = this.advance(rock);
      }

      if (!alive) {
        this.rocks.splice(i, 1);
      }
    }
  }

  /** One fixed step. False once the rock is spent (hit, landed or out of range). */
  private advance(rock: RockProjectile): boolean {
    this.before.copy(rock.position);
    stepRock(rock, ROCK_CONFIG.ROCK_STEP);

    const wall = rockImpactInStep(this.before, rock, this.world, this.impact)
      ? this.impact.fraction
      : 1;

    const struck = this.firstBodyHit(rock, wall);

    if (struck && rock.kind === "molotov") {
      // A bottle breaks on whatever it meets, a body included.
      this.onBurst?.(rock, rock.position);

      return false;
    }

    if (struck) {
      this.combat.resolveProjectileHit({
        sourceId: "rock-throw",
        attackerId: rock.ownerId,
        targetId: struck.targetId,
        hurtbox: struck.hurtbox,
        damage: rockDamageFor(struck.hurtbox),
        knockback: ROCK_CONFIG.ROCK_KNOCKBACK,
        hitstun: ROCK_CONFIG.ROCK_HITSTUN,
        direction: this.step.copy(rock.velocity),
        guardMultiplier: ROCK_CONFIG.ROCK_BLOCK_DAMAGE_MULTIPLIER,
      });

      return false;
    }

    if (wall < 1) {
      if (rock.kind === "molotov") {
        this.onBurst?.(rock, this.impact.point);
      }

      return false;
    }

    return rock.travelled < (rock.profile ?? ROCK_PROFILE).maxRange;
  }

  /**
   * The body part this step's sweep meets first, if it gets there before the
   * scenery does. Ties go to the first part listed (head, legs, torso).
   */
  private firstBodyHit(
    rock: RockProjectile,
    wallFraction: number,
  ): { targetId: string; hurtbox: "head" | "torso" | "legs" } | null {
    let best: {
      targetId: string;
      hurtbox: "head" | "torso" | "legs";
    } | null = null;
    let bestFraction = wallFraction;

    for (const target of this.combat.getCombatants()) {
      if (target.id === rock.ownerId || target.isDead()) {
        continue;
      }

      for (const hurtbox of target.getHurtboxes()) {
        if (!hurtbox.getShape(this.shape)) {
          continue;
        }

        // The rock is a small sphere: fatten the body part by its radius.
        this.reach.start.copy(this.shape.start);
        this.reach.end.copy(this.shape.end);
        this.reach.radius =
          this.shape.radius + (rock.profile ?? ROCK_PROFILE).radius;

        const entry = segmentCapsuleEntry(
          this.before,
          rock.position,
          this.reach,
        );

        if (entry !== null && entry < bestFraction) {
          bestFraction = entry;
          best = { targetId: target.id, hurtbox: hurtbox.id };
        }
      }
    }

    return best;
  }
}
