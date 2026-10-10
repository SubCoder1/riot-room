import * as THREE from "three";

import { ClimbRig } from "./ClimbPose";

const UP = new THREE.Vector3(0, 1, 0);

function smoothstep(a: number, b: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);

  return t * t * (3 - 2 * t);
}

export interface VentMoveShape {
  /** 0 to 1 through the climb. */
  progress: number;
  /** True going down into the vent, false climbing up out of it. */
  entering: boolean;
}

/**
 * Climbing through a grating, layered over the animation (the body is already
 * ducked). Going in, ONE hand (the right) reaches out to the panel's edge,
 * pushes it open and holds the floor while the body hops down through the
 * opening, the other arm free. Coming out, BOTH hands plant flat on the floor
 * ahead of the body and push it up through, letting go once it is clear.
 */
export class VentRig extends ClimbRig {
  public applyVent(
    weight: number,
    forward: THREE.Vector3,
    shape: VentMoveShape,
  ): void {
    if (weight < 0.002) {
      return;
    }

    const u = shape.progress;

    this.root.updateMatrixWorld(true);
    this.root.getWorldPosition(this.origin);
    this.right.crossVectors(forward, UP).normalize();

    // Reaching out to the floor first, then holding it; letting go at the end.
    const hold = shape.entering
      ? smoothstep(0, 0.2, u) * (1 - smoothstep(0.7, 0.95, u))
      : smoothstep(0, 0.1, u) * (1 - smoothstep(0.8, 1, u));
    const w = weight * hold;

    // One hand to open and hop in; both to climb out.
    const sides = shape.entering ? ([1] as const) : ([1, -1] as const);

    for (const side of sides) {
      const name = side > 0 ? "Right" : "Left";

      this.goal
        .copy(this.origin)
        .addScaledVector(forward, 0.5)
        .addScaledVector(this.right, side * 0.4);
      // The floor: the hands rest on it (feet start at the surface going in,
      // and end at it coming out).
      this.goal.y = 0.04;
      this.pole
        .copy(this.right)
        .multiplyScalar(side * 0.8)
        .addScaledVector(UP, 0.3)
        .addScaledVector(forward, -0.3);
      this.solve(`${name}Arm`, `${name}ForeArm`, `${name}Hand`, w);
    }
  }
}
