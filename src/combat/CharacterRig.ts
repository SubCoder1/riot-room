import * as THREE from "three";

import type { AttackDefinition, HitboxHand } from "./AttackDefinitions";
import type { Hurtbox } from "./Combatant";
import type { CapsuleShape } from "./Shapes";

const BONE_NAMES = [
  "Hips",
  "Spine2",
  "Head",
  "LeftFoot",
  "RightFoot",
  "LeftForeArm",
  "RightForeArm",
  "LeftHand",
  "RightHand",
] as const;

type BoneName = (typeof BONE_NAMES)[number];

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Turns an animated character skeleton into combat shapes: body-part hurtboxes
 * and the striking-hand hitbox. Shapes are read from the bones' current world
 * positions, so they follow whatever animation is playing.
 */
export class CharacterRig {
  private bones: Record<BoneName, THREE.Object3D> | null = null;

  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly c = new THREE.Vector3();

  private readonly root: THREE.Object3D;

  constructor(root: THREE.Object3D) {
    this.root = root;
  }

  /** Call once per frame, after the animation has been applied. */
  public refresh(): void {
    this.root.updateMatrixWorld(true);
  }

  public createHurtboxes(): Hurtbox[] {
    return [
      {
        id: "head",
        damageMultiplier: 1,
        getShape: (out) => this.headShape(out),
      },
      // Order matters: the first overlapping box wins, so anything touching
      // the legs (including the crotch) counts as a leg hit, and only
      // chest-and-above contact counts as a torso hit.
      {
        id: "legs",
        damageMultiplier: 1,
        getShape: (out) => this.legsShape(out),
      },
      {
        id: "torso",
        damageMultiplier: 1,
        getShape: (out) => this.torsoShape(out),
      },
    ];
  }

  /**
   * Capsule from the elbow to just past the fist. With `aim` (a unit vector,
   * e.g. the crosshair direction) the capsule starts at the fist and extends
   * along `aim` instead of along the forearm, so a punch hits what you aim at.
   */
  public getAttackShape(
    hand: HitboxHand,
    definition: AttackDefinition,
    out: CapsuleShape,
    aim?: THREE.Vector3,
  ): boolean {
    const bones = this.resolve();

    if (!bones) {
      return false;
    }

    const elbow = bones[hand === "left" ? "LeftForeArm" : "RightForeArm"];
    const fist = bones[hand === "left" ? "LeftHand" : "RightHand"];

    fist.getWorldPosition(this.a);

    if (aim) {
      out.start.copy(this.a).addScaledVector(aim, -0.12);
      out.end.copy(this.a).addScaledVector(aim, definition.hitboxReach);
      out.radius = definition.hitboxRadius;

      return true;
    }

    elbow.getWorldPosition(out.start);

    this.b.subVectors(this.a, out.start).normalize();

    out.end.copy(this.a).addScaledVector(this.b, definition.hitboxReach);
    out.radius = definition.hitboxRadius;

    return true;
  }

  private headShape(out: CapsuleShape): boolean {
    const bones = this.resolve();

    if (!bones) {
      return false;
    }

    bones.Head.getWorldPosition(out.start);
    out.end.copy(out.start).addScaledVector(UP, 0.17);
    out.radius = 0.16;

    return true;
  }

  private torsoShape(out: CapsuleShape): boolean {
    const bones = this.resolve();

    if (!bones) {
      return false;
    }

    // Starts above the waist so the crotch/hip area belongs to the legs.
    bones.Hips.getWorldPosition(out.start);
    out.start.addScaledVector(UP, 0.22);
    bones.Spine2.getWorldPosition(out.end);
    out.end.addScaledVector(UP, 0.08);
    out.radius = 0.24;

    return true;
  }

  private legsShape(out: CapsuleShape): boolean {
    const bones = this.resolve();

    if (!bones) {
      return false;
    }

    // From the hips down, including the groin.
    bones.Hips.getWorldPosition(out.start);
    bones.LeftFoot.getWorldPosition(this.a);
    bones.RightFoot.getWorldPosition(this.b);
    this.c.addVectors(this.a, this.b).multiplyScalar(0.5);

    out.end.copy(this.c).addScaledVector(UP, 0.05);
    out.radius = 0.19;

    return true;
  }

  /** The model loads asynchronously, so keep looking until every bone exists. */
  private resolve(): Record<BoneName, THREE.Object3D> | null {
    if (this.bones) {
      return this.bones;
    }

    const found: Partial<Record<BoneName, THREE.Object3D>> = {};

    for (const name of BONE_NAMES) {
      const bone = this.root.getObjectByName(name);

      if (!bone) {
        return null;
      }

      found[name] = bone;
    }

    this.bones = found as Record<BoneName, THREE.Object3D>;

    return this.bones;
  }
}
