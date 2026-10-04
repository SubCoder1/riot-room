import * as THREE from "three";

import { InputManager } from "../input/InputManager";

export class Player {
  /**
   * ========================================================
   * PLAYER / CAMERA HEIGHT
   * ========================================================
   *
   * The player's position represents the camera/eye position.
   *
   * Character feet/root position is calculated as:
   *
   *     player.position.y - eyeHeight
   */
  public readonly eyeHeight = 1.7;

  /**
   * Player position represents the camera/eye position.
   */
  public position = new THREE.Vector3(0, 1.7, 10);

  /**
   * Vertical/horizontal velocity.
   */
  public velocity = new THREE.Vector3();

  /**
   * Camera rotation.
   */
  public yaw = 0;

  public pitch = -0.1;

  /**
   * Sprint state.
   */
  public isSprinting = false;

  /**
   * Crouch state. Set by Game.ts; slows movement and overrides sprint.
   */
  public isCrouching = false;

  /**
   * ========================================================
   * MOVEMENT SETTINGS
   * ========================================================
   */

  private readonly moveSpeed = 5.5;

  private readonly sprintSpeed = 8.5;

  private readonly crouchSpeed = 2.2;

  /**
   * Jump strength.
   */
  private readonly jumpForce = 7.2;

  /**
   * Gravity strength.
   */
  private readonly gravity = 18;

  /**
   * Arena boundary.
   */
  private readonly arenaHalfSize = 8.4;

  /**
   * ========================================================
   * GROUND STATE
   * ========================================================
   *
   * This is the IMPORTANT part for the animation system.
   *
   * Game.ts should NOT try to calculate whether the player
   * is airborne by checking Y positions.
   *
   * Player physics already knows the real state.
   */
  private grounded = true;

  /**
   * Public read-only access to the ground state.
   *
   * Game.ts uses:
   *
   *     this.player.isGrounded
   *
   * to decide whether the character should play the
   * jump animation.
   */
  public get isGrounded(): boolean {
    return this.grounded;
  }

  /**
   * ========================================================
   * UPDATE
   * ========================================================
   */
  public update(dt: number, input: InputManager): void {
    /**
     * ======================================================
     * CAMERA LOOK
     * ======================================================
     */

    this.yaw = input.yaw;

    this.pitch = input.pitch;

    /**
     * ======================================================
     * MOVEMENT INPUT
     * ======================================================
     */

    const moveX =
      (input.isPressed("KeyD") ? 1 : 0) - (input.isPressed("KeyA") ? 1 : 0);

    const moveZ =
      (input.isPressed("KeyW") ? 1 : 0) - (input.isPressed("KeyS") ? 1 : 0);

    /**
     * ======================================================
     * SPRINT
     * ======================================================
     */

    this.isSprinting =
      input.isPressed("ShiftLeft") || input.isPressed("ShiftRight");

    /**
     * ======================================================
     * HORIZONTAL MOVEMENT
     * ======================================================
     */

    if (moveX !== 0 || moveZ !== 0) {
      /**
       * Player forward direction.
       *
       * Camera convention:
       *
       * -Z = forward
       */
      const forward = new THREE.Vector3(
        -Math.sin(this.yaw),
        0,
        -Math.cos(this.yaw),
      );

      /**
       * Player right direction.
       */
      const right = new THREE.Vector3(
        Math.cos(this.yaw),
        0,
        -Math.sin(this.yaw),
      );

      /**
       * Final movement direction.
       */
      const direction = new THREE.Vector3();

      direction.addScaledVector(forward, moveZ);

      direction.addScaledVector(right, moveX);

      /**
       * Prevent diagonal movement from
       * being faster.
       */
      direction.normalize();

      let speed = this.isSprinting ? this.sprintSpeed : this.moveSpeed;

      if (this.isCrouching) {
        speed = this.crouchSpeed;
      }

      this.position.x += direction.x * speed * dt;

      this.position.z += direction.z * speed * dt;
    }

    /**
     * ======================================================
     * JUMP
     * ======================================================
     *
     * Jump is triggered ONLY when:
     *
     *     Space is newly pressed
     *     AND
     *     player is grounded
     *
     * consumeJump() guarantees that holding Space
     * does not repeatedly create jump requests.
     */
    if (input.consumeJump() && this.grounded) {
      this.velocity.y = this.jumpForce;

      this.grounded = false;
    }

    /**
     * ======================================================
     * GRAVITY
     * ======================================================
     */

    this.velocity.y -= this.gravity * dt;

    this.position.y += this.velocity.y * dt;

    /**
     * ======================================================
     * GROUND COLLISION
     * ======================================================
     *
     * Player position is the eye position.
     *
     * Therefore:
     *
     *     eye position = ground + eyeHeight
     *
     * When the player reaches the ground:
     *
     *     y = eyeHeight
     */
    if (this.position.y <= this.eyeHeight) {
      this.position.y = this.eyeHeight;

      this.velocity.y = 0;

      this.grounded = true;
    }

    /**
     * ======================================================
     * ARENA BOUNDS
     * ======================================================
     */

    this.position.x = clamp(
      this.position.x,
      -this.arenaHalfSize,
      this.arenaHalfSize,
    );

    this.position.z = clamp(
      this.position.z,
      -this.arenaHalfSize,
      this.arenaHalfSize,
    );
  }
}

/**
 * ========================================================
 * CLAMP
 * ========================================================
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
