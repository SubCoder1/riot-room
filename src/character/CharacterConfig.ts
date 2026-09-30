import * as THREE from "three";

// Character GLB
export const CHARACTER_ASSET_PATH = "/assets/characters/player.glb";

export interface FirstPersonTransform {
  /*
   * Position relative to the camera.
   *
   * x = left/right
   * y = up/down
   * z = forward/back
   */
  offset: THREE.Vector3;

  /*
   * Rotation of the first-person arms.
   */
  rotation: THREE.Euler;

  /*
   * Overall arm size.
   */
  scale: number;
}

/*
 * Idle first-person combat stance.
 *
 * We are intentionally keeping this conservative for now.
 * Once the arms are visible, we'll tune these values from
 * the screenshot.
 */
export const FIRST_PERSON_TRANSFORM: FirstPersonTransform = {
  offset: new THREE.Vector3(0, -1.45, -0.85),

  rotation: new THREE.Euler(-0.1, 0, 0),

  scale: 0.95,
};
