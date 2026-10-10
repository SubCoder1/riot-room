import * as THREE from "three";

import type { SmokeSystem } from "./Smoke";

/**
 * Whether an observer's eye can see a point: nothing solid in the way (the
 * world's line-of-sight check) and no smoke thick enough to hide it.
 *
 * This is the ONE sight rule for "can they see him": health bars use it today,
 * and anything that decides whether a thug notices or targets someone should
 * too. Melee does not use it (a punch only needs to reach), so fighting inside
 * smoke still works.
 */
export function canPerceive(
  eye: THREE.Vector3,
  target: THREE.Vector3,
  lineOfSight: ((from: THREE.Vector3, to: THREE.Vector3) => boolean) | null,
  smoke: SmokeSystem | null,
): boolean {
  if (lineOfSight && !lineOfSight(eye, target)) {
    return false;
  }

  return !smoke || !smoke.blocksSight(eye, target);
}

/**
 * What an observer remembers of one target: where it was last seen. While the
 * target is visible this follows it; once it is hidden (behind cover or in
 * smoke) it stays where the target was last seen, so an enemy searches the
 * place he disappeared rather than tracking him through the cloud.
 */
export class SightMemory {
  /** Where the target was last seen, or null if never seen. */
  public readonly lastKnown = new THREE.Vector3();
  public hasSeen = false;
  /** Seconds since the target was last seen (0 while it is in view). */
  public sinceSeen = 0;

  /**
   * One update. `visible` says whether the target can be perceived right now
   * (see canPerceive) and `position` where it really is.
   */
  public update(dt: number, visible: boolean, position: THREE.Vector3): void {
    if (visible) {
      this.lastKnown.copy(position);
      this.hasSeen = true;
      this.sinceSeen = 0;

      return;
    }

    this.sinceSeen += dt;
  }

  /** Where to look for the target now: its last seen place, or null. */
  public get searchPoint(): THREE.Vector3 | null {
    return this.hasSeen ? this.lastKnown : null;
  }

  public reset(): void {
    this.hasSeen = false;
    this.sinceSeen = 0;
  }
}
