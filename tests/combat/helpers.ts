import * as THREE from "three";

import type {
  AttackDefinition,
  AttackId,
  HitboxHand,
} from "../../src/combat/AttackDefinitions";
import {
  Health,
  type Combatant,
  type HitInfo,
  type Hurtbox,
  type HurtboxId,
} from "../../src/combat/Combatant";
import { guardedPartsFor } from "../../src/combat/CombatConfig";
import type { CombatEvent } from "../../src/combat/CombatEvents";
import { CombatSystem } from "../../src/combat/CombatSystem";
import type { CapsuleShape } from "../../src/combat/Shapes";

/** Representative body-part heights (metres above the feet). */
const PART_HEIGHT: Record<HurtboxId, number> = {
  head: 1.6,
  torso: 1.2,
  legs: 0.5,
};

/**
 * A stand-in fighter with fixed capsule hurtboxes and a hitbox that can be put
 * anywhere. It only supplies the Combatant interface (no rendering); all combat
 * decisions are made by the real CombatSystem.
 */
export class TestFighter implements Combatant {
  public readonly health: Health;
  public readonly position = new THREE.Vector3();
  public blocking = false;
  public crouched = false;
  public pitch = 0;
  /** Horizontal facing, radians: 0 = +z, PI/2 = +x. */
  public yaw = 0;
  /** Where this fighter's fist is this frame. */
  public strike = new THREE.Vector3();
  public hits: HitInfo[] = [];
  public blockedHits: HitInfo[] = [];

  constructor(
    public readonly id: string,
    maxHealth = 100,
  ) {
    this.name = id;
    this.health = new Health(maxHealth);
  }

  public readonly name: string;

  public isDead(): boolean {
    return this.health.isDead;
  }

  public isBlocking(): boolean {
    return this.blocking && !this.isDead();
  }

  public getGuardedParts(): readonly HurtboxId[] {
    return this.isBlocking() ? guardedPartsFor(this.crouched, this.pitch) : [];
  }

  public getHurtboxes(): Hurtbox[] {
    return (["head", "legs", "torso"] as const).map((id) => ({
      id,
      damageMultiplier: 1,
      getShape: (out: CapsuleShape) => {
        out.start.set(
          this.position.x,
          this.position.y + PART_HEIGHT[id],
          this.position.z,
        );
        out.end.copy(out.start);
        out.radius = 0.2;
        return true;
      },
    }));
  }

  public getFacing(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  public getPosition(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.position);
  }

  public getLookPitch(): number {
    return this.pitch;
  }

  public getAttackShape(
    _hand: HitboxHand,
    definition: AttackDefinition,
    out: CapsuleShape,
  ): boolean {
    out.start.copy(this.strike);
    out.end.copy(this.strike);
    out.radius = definition.hitboxRadius;
    return true;
  }

  public onHit(hit: HitInfo): void {
    this.hits.push(hit);
  }

  public onBlocked(hit: HitInfo): void {
    this.blockedHits.push(hit);
  }
}

export interface Scene {
  system: CombatSystem;
  attacker: TestFighter;
  defender: TestFighter;
  events: CombatEvent[];
}

/**
 * Attacker 1.2 m from the defender, `angleDeg` away from the defender's facing
 * (0 = dead ahead of the defender, 90 = side, 180 = behind). The attacker faces
 * the defender.
 */
export function makeScene(angleDeg = 0, defenderYaw = 0): Scene {
  const system = new CombatSystem();
  const attacker = new TestFighter("attacker");
  const defender = new TestFighter("defender");
  const events: CombatEvent[] = [];

  defender.yaw = defenderYaw;
  system.register(attacker);
  system.register(defender);
  system.events.subscribe((event) => events.push(event));

  placeAttacker({ attacker, defender }, angleDeg);

  return { system, attacker, defender, events };
}

export function placeAttacker(
  { attacker, defender }: Pick<Scene, "attacker" | "defender">,
  angleDeg: number,
  distance = 1.2,
): void {
  const angle = defender.yaw + (angleDeg * Math.PI) / 180;

  attacker.position.set(
    defender.position.x + Math.sin(angle) * distance,
    defender.position.y,
    defender.position.z + Math.cos(angle) * distance,
  );
  // Face the defender.
  attacker.yaw = angle + Math.PI;
  aimAt(attacker, defender, "torso");
}

/** Puts the attacker's fist inside the given body part of the target. */
export function aimAt(
  attacker: TestFighter,
  target: TestFighter,
  part: HurtboxId,
): void {
  attacker.strike.set(
    target.position.x,
    target.position.y + PART_HEIGHT[part],
    target.position.z,
  );
}

/** Starts an attack and runs it through startup into the active window. */
export function startAndActivate(
  scene: Scene,
  attackId: AttackId,
  hand: HitboxHand = "right",
): void {
  scene.system.startAttack(scene.attacker.id, attackId, hand);
  scene.system.update(0); // nothing happens at t = 0
}

export function stepUntilFinished(scene: Scene, dt = 0.01): void {
  for (let i = 0; i < 500 && scene.system.getAttack(scene.attacker.id); i++) {
    scene.system.update(dt);
  }
}

/** Full attack: start, run to the end, return the damage the defender took. */
export function runAttack(scene: Scene, attackId: AttackId): number {
  const before = scene.defender.health.current;

  scene.system.startAttack(scene.attacker.id, attackId, "right");
  stepUntilFinished(scene);

  return before - scene.defender.health.current;
}

export function eventsOf<T extends CombatEvent["type"]>(
  scene: Scene,
  type: T,
): Extract<CombatEvent, { type: T }>[] {
  return scene.events.filter(
    (event): event is Extract<CombatEvent, { type: T }> => event.type === type,
  );
}

/** Advances the combat system in small frames, like the game loop does. */
export function step(scene: Scene, seconds: number, dt = 0.01): void {
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    scene.system.update(dt);
  }
}
