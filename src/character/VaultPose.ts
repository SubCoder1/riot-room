import * as THREE from "three";

import { ClimbRig } from "./ClimbPose";

const UP = new THREE.Vector3(0, 1, 0);

/** How far the body rolls over the planted hand (radians). */
const MAX_ROLL = 1.05;

export interface VaultShape {
  /** 0 to 1 through the vault. */
  progress: number;
  /** World height of the obstacle's top. */
  topY: number;
  /** Distances from where the vault started to the obstacle's near and far edges. */
  near: number;
  far: number;
  /** Distance from the start to the landing. */
  distance: number;
  /** The way the vault travels (a unit vector in x, z); the way the body faces if absent. */
  dirX?: number;
  dirZ?: number;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);

  return t * t * (3 - 2 * t);
}

/**
 * A one-handed vault layered over the animation: the right hand plants on the
 * top of the obstacle, the body rolls over that hand (head toward it, legs
 * swinging out to the other side, together and just clear of the top) and glides
 * through, then the hand lets go as the hips pass. Driven by the progress of the
 * vault, so it needs no clip.
 */
export class VaultRig extends ClimbRig {
  private readonly travel = new THREE.Vector3();
  private readonly turned = new THREE.Vector3();
  private readonly hipsPosition = new THREE.Vector3();
  private readonly bodyUp = new THREE.Vector3();
  private readonly shoulder = new THREE.Vector3();

  public applyVault(
    weight: number,
    facing: THREE.Vector3,
    shape: VaultShape,
  ): void {
    if (weight < 0.002) {
      return;
    }

    const { progress: u, topY, near, far, distance } = shape;

    this.root.updateMatrixWorld(true);
    this.root.getWorldPosition(this.origin);

    const hips = this.root.getObjectByName("Hips");

    if (!hips) {
      return;
    }

    // A sideways vault travels out to the side the body faces away from: the
    // body turns to face the way it goes (in and out quickly), then the pose is
    // the same as the forward vault along that line.
    const forward = this.travel.copy(facing);

    if (shape.dirX !== undefined && shape.dirZ !== undefined) {
      forward.set(shape.dirX, 0, shape.dirZ);

      const turn =
        weight * smoothstep(0.0, 0.12, u) * (1 - smoothstep(0.86, 1, u));

      this.turned.copy(facing).lerp(forward, turn).normalize();
      this.rotateBoneBetween(hips, facing.clone(), this.turned.clone());
      this.root.updateMatrixWorld(true);
    }

    this.right.crossVectors(forward, UP).normalize();

    // Roll over the hand: in quickly, held while passing over, out on landing.
    const roll =
      MAX_ROLL *
      weight *
      smoothstep(0.04, 0.3, u) *
      (1 - smoothstep(0.7, 0.97, u));

    this.bodyUp
      .copy(UP)
      .multiplyScalar(Math.cos(roll))
      .addScaledVector(this.right, Math.sin(roll));
    this.rotateBoneBetween(hips, UP.clone(), this.bodyUp.clone());
    this.root.updateMatrixWorld(true);
    hips.getWorldPosition(this.hipsPosition);

    const travelled = distance * u;
    // Where the hand is planted: on the near part of the top, held there (in
    // the world) while the body slides past.
    const plantAt = Math.min(near + 0.3, (near + far) / 2);
    const handAhead = plantAt - travelled;
    const handWeight =
      weight * smoothstep(0.03, 0.18, u) * (1 - smoothstep(0.62, 0.85, u));

    // Supporting hand: right, flat on the top, arm straight under the weight.
    this.goal
      .copy(this.origin)
      .addScaledVector(forward, THREE.MathUtils.clamp(handAhead, -0.1, 0.9))
      .addScaledVector(this.right, 0.22);
    this.goal.y = topY + 0.04;
    this.pole
      .copy(this.right)
      .multiplyScalar(0.7)
      .addScaledVector(UP, 0.2)
      .addScaledVector(forward, -0.4);
    this.solve("RightArm", "RightForeArm", "RightHand", handWeight);

    // Free hand: thrown out and up for balance, on the side the legs go.
    const freeWeight =
      weight * smoothstep(0.05, 0.3, u) * (1 - smoothstep(0.75, 0.97, u));
    const leftArm = this.root.getObjectByName("LeftArm");

    if (leftArm) {
      leftArm.getWorldPosition(this.shoulder);
    } else {
      this.shoulder.copy(this.hipsPosition);
    }

    this.goal
      .copy(this.shoulder)
      .addScaledVector(forward, 0.35)
      .addScaledVector(this.right, -0.45)
      .addScaledVector(UP, 0.3);
    this.pole
      .copy(this.right)
      .multiplyScalar(-0.5)
      .addScaledVector(UP, -0.6)
      .addScaledVector(forward, -0.3);
    this.solve("LeftArm", "LeftForeArm", "LeftHand", freeWeight);

    // Legs: swung out together on the free side, just clear of the top, the
    // leading one a little forward and the trailing one a little back.
    const legWeight =
      weight * smoothstep(0.08, 0.3, u) * (1 - smoothstep(0.78, 0.97, u));
    const along = this.bodyUp.clone().negate();

    for (const side of [1, -1] as const) {
      const name = side > 0 ? "Right" : "Left";

      this.goal
        .copy(this.hipsPosition)
        .addScaledVector(along, 0.72)
        .addScaledVector(forward, side > 0 ? -0.2 : 0.15)
        .addScaledVector(this.right, -0.08 * side);
      this.goal.y = Math.max(this.goal.y, topY + 0.1 + (side > 0 ? 0 : 0.06));
      this.pole
        .copy(forward)
        .multiplyScalar(0.8)
        .addScaledVector(UP, 0.3)
        .addScaledVector(this.right, -0.2);
      this.solve(`${name}UpLeg`, `${name}Leg`, `${name}Foot`, legWeight, true);
    }
  }
}
