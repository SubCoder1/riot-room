import * as THREE from "three";

import { CLIMB } from "../player/Climb";

const UP = new THREE.Vector3(0, 1, 0);

/** Metres of climbing for one full cycle (each hand and foot moves up one rung gap twice per cycle). */
export const CLIMB_CYCLE = 0.6;

/** Where the ladder's rails are, in front of the body's centre. */
const RAIL_DISTANCE = CLIMB.STAND_OFF;
const RAIL_HALF_WIDTH = 0.3;

/**
 * A climbing pose layered over the animation: hands on the rails and feet on
 * the rungs, moving hand over hand as the player goes up or down. It is driven
 * by the height climbed, so it stops when the climber stops and plays backward
 * going down. Each limb is a two-bone solve (hand or foot to a goal, the elbow
 * or knee bending toward a pole).
 */
export class ClimbRig {
  protected readonly root: THREE.Object3D;
  protected readonly rotateBoneBetween: (
    bone: THREE.Object3D,
    from: THREE.Vector3,
    to: THREE.Vector3,
  ) => void;

  protected readonly origin = new THREE.Vector3();
  protected readonly right = new THREE.Vector3();
  protected readonly goal = new THREE.Vector3();
  protected readonly pole = new THREE.Vector3();
  private readonly start = new THREE.Vector3();
  private readonly mid = new THREE.Vector3();
  private readonly end = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly axis = new THREE.Vector3();
  private readonly current = new THREE.Vector3();
  private readonly bend = new THREE.Vector3();

  constructor(
    root: THREE.Object3D,
    rotateBoneBetween: (
      bone: THREE.Object3D,
      from: THREE.Vector3,
      to: THREE.Vector3,
    ) => void,
  ) {
    this.root = root;
    this.rotateBoneBetween = rotateBoneBetween;
  }

  /**
   * @param weight how much of the pose is in (0 none, 1 all)
   * @param forward unit vector (flat) the climber faces, toward the ladder
   * @param climbed height climbed so far (the phase source)
   */
  public apply(
    weight: number,
    forward: THREE.Vector3,
    climbed: number,
    reach: { topHand: number; bottomFoot: number } = {
      topHand: Infinity,
      bottomFoot: -Infinity,
    },
  ): void {
    if (weight < 0.002) {
      return;
    }

    this.root.updateMatrixWorld(true);
    this.root.getWorldPosition(this.origin);
    // The climber's right: for forward (0, 0, -1) it is +x, so right = forward x up.
    this.right.crossVectors(forward, UP).normalize();

    const phase = (climbed / CLIMB_CYCLE) * Math.PI * 2;

    for (const side of [1, -1] as const) {
      // Opposite limbs are half a cycle apart: right hand and left foot rise together.
      const hand = Math.sin(phase + (side > 0 ? 0 : Math.PI));
      const foot = Math.sin(phase + (side > 0 ? Math.PI : 0));
      const name = side > 0 ? "Right" : "Left";

      // Hand on the rail: up and down by a rung or so around shoulder height.
      this.goal
        .copy(this.origin)
        .addScaledVector(forward, RAIL_DISTANCE)
        .addScaledVector(this.right, side * RAIL_HALF_WIDTH)
        .addScaledVector(UP, 1.55 + 0.22 * hand);
      // Hands stay on the rails, which end just above the top of the ladder.
      this.goal.y = Math.min(this.goal.y, reach.topHand);
      this.pole
        .copy(this.right)
        .multiplyScalar(side * 0.6)
        .addScaledVector(UP, -0.7)
        .addScaledVector(forward, -0.1);
      this.solve(`${name}Arm`, `${name}ForeArm`, `${name}Hand`, weight);

      // Foot on a rung: lifted while it steps up, flat on the rung while loaded.
      this.goal
        .copy(this.origin)
        .addScaledVector(forward, RAIL_DISTANCE - 0.1)
        .addScaledVector(this.right, side * 0.14)
        .addScaledVector(UP, 0.12 + 0.18 * Math.max(0, foot));
      // And the feet on rungs, never below the foot of the ladder.
      this.goal.y = Math.max(this.goal.y, reach.bottomFoot);
      this.pole
        .copy(forward)
        .multiplyScalar(0.8)
        .addScaledVector(UP, 0.2)
        .addScaledVector(this.right, side * 0.15);
      this.solve(`${name}UpLeg`, `${name}Leg`, `${name}Foot`, weight, true);
    }
  }

  /**
   * Two-bone solve toward `this.goal` (blended in by `weight` from where the
   * animation has the end), with the middle joint bending toward `this.pole`.
   */
  protected solve(
    upperName: string,
    midName: string,
    endName: string,
    weight: number,
    leg = false,
  ): void {
    const upper = this.root.getObjectByName(upperName);
    const middle = this.root.getObjectByName(midName);
    const tip = this.root.getObjectByName(endName);

    if (!upper || !middle || !tip) {
      return;
    }

    upper.getWorldPosition(this.start);
    middle.getWorldPosition(this.mid);
    tip.getWorldPosition(this.end);

    this.target.lerpVectors(this.end, this.goal, weight);

    const upperLength = this.mid.distanceTo(this.start);
    const lowerLength = this.end.distanceTo(this.mid);

    this.axis.subVectors(this.target, this.start);

    const reach = THREE.MathUtils.clamp(
      this.axis.length(),
      Math.abs(upperLength - lowerLength) + 0.02,
      (upperLength + lowerLength) * (leg ? 0.97 : 0.98),
    );

    this.axis.normalize();
    this.target.copy(this.start).addScaledVector(this.axis, reach);

    // The joint bends from where it is now toward the pole as the pose takes over.
    this.current.subVectors(this.mid, this.start);
    this.current.addScaledVector(this.axis, -this.current.dot(this.axis));
    this.pole.addScaledVector(this.axis, -this.pole.dot(this.axis));

    if (this.current.lengthSq() > 1e-6 && this.pole.lengthSq() > 1e-6) {
      this.current.normalize();
      this.pole.normalize();
      this.pole.lerpVectors(this.current, this.pole, weight);
    }

    this.pole.addScaledVector(this.axis, -this.pole.dot(this.axis));
    this.pole.normalize();

    const along =
      (upperLength * upperLength - lowerLength * lowerLength + reach * reach) /
      (2 * reach);
    const out = Math.sqrt(
      Math.max(upperLength * upperLength - along * along, 0),
    );

    this.bend
      .copy(this.start)
      .addScaledVector(this.axis, along)
      .addScaledVector(this.pole, out);

    this.rotateBoneBetween(
      upper,
      this.mid.clone().sub(this.start),
      this.bend.clone().sub(this.start),
    );

    this.root.updateMatrixWorld(true);

    middle.getWorldPosition(this.mid);
    tip.getWorldPosition(this.end);

    this.rotateBoneBetween(
      middle,
      this.end.clone().sub(this.mid),
      this.target.clone().sub(this.mid),
    );

    this.root.updateMatrixWorld(true);
  }
}
