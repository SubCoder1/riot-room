import * as THREE from "three";

import { InputManager } from "../input/InputManager";

export class Player {
  /**
   * The player's eye/camera height above the ground.
   *
   * Game.ts uses this same value when converting
   * the player's eye position into the character's
   * feet/root position.
   */
  public readonly eyeHeight = 1.7;

  /**
   * Player position represents the camera/eye position.
   */
  public position = new THREE.Vector3(0, 1.7, 10);

  public velocity = new THREE.Vector3();

  public yaw = 0;

  public pitch = -0.1;

  public isSprinting = false;

  private readonly moveSpeed = 5.5;

  private readonly sprintSpeed = 8.5;

  private readonly jumpForce = 7.2;

  private readonly gravity = 18;

  private readonly arenaHalfSize = 8.4;

  private grounded = true;

  public update(dt: number, input: InputManager): void {
    /**
     * ========================================================
     * CAMERA LOOK
     * ========================================================
     */
    this.yaw = input.yaw;

    this.pitch = input.pitch;

    /**
     * ========================================================
     * MOVEMENT INPUT
     * ========================================================
     */
    const moveX =
      (input.isPressed("KeyD") ? 1 : 0) - (input.isPressed("KeyA") ? 1 : 0);

    const moveZ =
      (input.isPressed("KeyW") ? 1 : 0) - (input.isPressed("KeyS") ? 1 : 0);

    /**
     * ========================================================
     * SPRINT
     * ========================================================
     */
    this.isSprinting =
      input.isPressed("ShiftLeft") || input.isPressed("ShiftRight");

    /**
     * ========================================================
     * HORIZONTAL MOVEMENT
     * ========================================================
     */
    if (moveX !== 0 || moveZ !== 0) {
      /**
       * Player forward direction.
       *
       * Camera convention:
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

      const direction = new THREE.Vector3();

      direction.addScaledVector(forward, moveZ);

      direction.addScaledVector(right, moveX);

      /**
       * Prevent diagonal movement from
       * being faster.
       */
      direction.normalize();

      const speed = this.isSprinting ? this.sprintSpeed : this.moveSpeed;

      this.position.x += direction.x * speed * dt;

      this.position.z += direction.z * speed * dt;
    }

    /**
     * ========================================================
     * JUMP
     * ========================================================
     */
    if (input.consumeJump() && this.grounded) {
      this.velocity.y = this.jumpForce;

      this.grounded = false;
    }

    /**
     * ========================================================
     * GRAVITY
     * ========================================================
     */
    this.velocity.y -= this.gravity * dt;

    this.position.y += this.velocity.y * dt;

    /**
     * ========================================================
     * GROUND COLLISION
     * ========================================================
     *
     * The player position represents the eyes.
     *
     * Therefore:
     *
     *     eye position = ground + eyeHeight
     *
     * We keep this exact relationship.
     */
    if (this.position.y <= this.eyeHeight) {
      this.position.y = this.eyeHeight;

      this.velocity.y = 0;

      this.grounded = true;
    }

    /**
     * ========================================================
     * ARENA BOUNDS
     * ========================================================
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
