import * as THREE from "three";

import {
  caughtUnderShutter,
  type ChainShutter,
} from "../world/ArmoryMechanisms";
import type { CombatSystem } from "./CombatSystem";
import type { Combatant } from "./Combatant";
import { createCapsule } from "./Shapes";

/** Standing height used when a body's head cannot be measured. */
const DEFAULT_HEAD = 1.8;

/**
 * The falling armory shutter as a hazard. While it descends, anyone on its line
 * whose head the bottom edge has reached is crushed: killed once, through the
 * same hit and death events as any other damage. It is checked every frame
 * from where the bodies really are, so a body that is clear of the doorway, or
 * that the edge has not yet reached, is never touched, and a shutter that is
 * up (or still held) never kills.
 */
export class ShutterCrush {
  private readonly feet = new THREE.Vector3();
  private readonly shape = createCapsule();
  /** Who has already been caught in the current fall. */
  private readonly caught = new Set<string>();
  private lastDescent = -1;

  private readonly combat: CombatSystem;
  private readonly shutter: ChainShutter;
  /** Who is credited with the kill: whoever last worked the chain. */
  private readonly operatorId: () => string;

  constructor(
    combat: CombatSystem,
    shutter: ChainShutter,
    operatorId: () => string,
  ) {
    this.combat = combat;
    this.shutter = shutter;
    this.operatorId = operatorId;
  }

  /** The top of a body's head (the hurtbox, or a standing height). */
  private headY(target: Combatant): number {
    let top = Number.NEGATIVE_INFINITY;

    for (const box of target.getHurtboxes()) {
      if (box.getShape(this.shape)) {
        top = Math.max(
          top,
          this.shape.start.y + this.shape.radius,
          this.shape.end.y + this.shape.radius,
        );
      }
    }

    return Number.isFinite(top) ? top : this.feet.y + DEFAULT_HEAD;
  }

  /** Call once a frame, after the shutter has moved and before bodies are moved out of it. */
  public update(): void {
    if (this.shutter.descent !== this.lastDescent) {
      this.lastDescent = this.shutter.descent;
      this.caught.clear();
    }

    if (!this.shutter.isFalling) {
      return;
    }

    for (const target of this.combat.getCombatants()) {
      if (target.isDead() || this.caught.has(target.id)) {
        continue;
      }

      target.getPosition(this.feet);

      if (
        !caughtUnderShutter(this.feet, this.headY(target), this.shutter.edgeY)
      ) {
        continue;
      }

      this.caught.add(target.id);
      this.combat.applyHazardDamage({
        sourceId: "shutter-crush",
        attackerId: this.operatorId(),
        targetId: target.id,
        hurtbox: "torso",
        // Enough to kill outright, whatever health is left.
        damage: target.health.max,
        direction: new THREE.Vector3(1, 0, 0),
      });
    }
  }

  public reset(): void {
    this.caught.clear();
    this.lastDescent = -1;
  }
}
