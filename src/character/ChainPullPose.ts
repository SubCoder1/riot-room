import * as THREE from "three";

import { ARMORY, ChainShutter } from "../world/ArmoryMechanisms";
import { ClimbRig } from "./ClimbPose";

const UP = new THREE.Vector3(0, 1, 0);

/** Where the hands take hold on the pulled strand, and where they let go (m up). */
export const GRIP_HIGH = ARMORY.FLOOR + 2.05;
export const GRIP_LOW = GRIP_HIGH - ChainShutter.STROKE;

export interface ChainPullShape {
  /** How far the chain has been drawn (the shutter's own chainTravel). */
  travel: number;
}

/**
 * How high a hand is, given how far the chain has been drawn and which hand it
 * is. Hand over hand: while one grips the chain and is carried down by it, the
 * other lets go, reaches back up and takes hold higher; each stroke they swap.
 * It is a function of the chain's travel alone, so the hands move exactly with
 * the chain: pause the pull and they stop on it, and no pull means no motion.
 *
 * Returns the height and how far the hand is out from the chain (0 gripping,
 * up to 1 while it is let go and reaching back).
 */
export function handOnChain(
  travel: number,
  side: 1 | -1,
): { y: number; release: number } {
  const stroke = ChainShutter.STROKE;
  const t = Math.max(travel, 0) / stroke + (side > 0 ? 0 : 1);
  const phase = t % 2;

  if (phase < 1) {
    // Gripping: carried down with the chain.
    return { y: GRIP_HIGH - phase * stroke, release: 0 };
  }

  // Let go: back up for the next hold, lifting away from the links a little.
  const u = phase - 1;

  return {
    y: GRIP_LOW + u * stroke,
    release: Math.sin(u * Math.PI),
  };
}

/**
 * The pose of someone hauling the armory's hand chain, layered over the
 * animation like the ladder and vent poses (the same two-bone arm solve): both
 * hands on the strand that runs down as the shutter rises, hand over hand.
 */
export class ChainPullRig extends ClimbRig {
  public applyPull(
    weight: number,
    forward: THREE.Vector3,
    shape: ChainPullShape,
  ): void {
    if (weight < 0.002) {
      return;
    }

    this.root.updateMatrixWorld(true);
    this.root.getWorldPosition(this.origin);
    this.right.crossVectors(forward, UP).normalize();

    // The strand that runs down as the shutter rises: the wheel's far side.
    const strandZ = ARMORY.CHAIN_Z + ARMORY.CHAIN_WHEEL_RADIUS;

    for (const side of [1, -1] as const) {
      const name = side > 0 ? "Right" : "Left";
      const hand = handOnChain(shape.travel, side);

      // In front of the links (outside, on the walkway side), the two hands a
      // palm apart along the strand's width; let go, a hand lifts off it.
      this.goal.set(
        ARMORY.CHAIN_X + 0.1 + 0.07 * hand.release,
        hand.y,
        strandZ,
      );
      this.goal.addScaledVector(this.right, side * 0.045);
      // The elbows hang down and out, behind the hands.
      this.pole
        .copy(this.right)
        .multiplyScalar(side * 0.7)
        .addScaledVector(UP, -0.9)
        .addScaledVector(forward, -0.3);
      this.solve(`${name}Arm`, `${name}ForeArm`, `${name}Hand`, weight);
    }
  }
}
