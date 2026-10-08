import * as THREE from "three";

import { InputManager } from "../input/InputManager";
import {
  SOURCE_MOVEMENT,
  accelerate,
  steerInAir,
  applyFriction,
} from "./SourceMovement";
import {
  PLAYER_RADIUS,
  SNAP_DOWN,
  type ArenaCollision,
} from "../world/ArenaCollision";

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
   * Set by Game.ts while guarding (block held and not sprinting).
   */
  public isBlocking = false;

  /**
   * Crouch state. Set by Game.ts; slows movement and overrides sprint.
   */
  public isCrouching = false;

  /**
   * Punch state. Set by Game.ts; slows movement while a punch plays.
   */
  public isPunching = false;

  /**
   * ========================================================
   * MOVEMENT SETTINGS
   * ========================================================
   */

  // Speeds and acceleration follow CS:GO (see SourceMovement): the normal
  // speed is a rifle's, Shift is a quick sprint, strafing is slower, and there
  // are no instant starts or stops, so a moving player can be led and hit.
  private readonly moveSpeed = SOURCE_MOVEMENT.RUN_SPEED;

  private readonly sprintSpeed = SOURCE_MOVEMENT.SPRINT_SPEED;

  private readonly crouchSpeed = 2.2;

  /** Set by Game.ts: third person keeps the walk cycle, so it slows less. */
  public punchSpeedFactor = 0.3;

  /**
   * Jump strength.
   */
  private readonly jumpForce = 5.8;

  /** How long (s) an early jump press is remembered, waiting for the ground. */
  private readonly jumpBufferTime = 0.12;

  /** How long (s) after leaving the ground a jump is still allowed. */
  private readonly coyoteTime = 0.12;

  private jumpBufferLeft = 0;

  private coyoteLeft = 0;

  /**
   * Gravity strength.
   */
  private readonly gravity = 18;

  /**
   * Arena boundary, used only when no arena collision is attached.
   */
  private readonly arenaHalfSize = 8.4;

  /**
   * Arena collision (floor, platforms, ramps, cover, walls). Set by Game.ts.
   * Without it the player walks on a flat floor inside a small square.
   */
  private world: ArenaCollision | null = null;

  public setWorld(world: ArenaCollision): void {
    this.world = world;
  }

  /** Puts the player (feet position) somewhere new and stops all movement. */
  public teleport(x: number, feetY: number, z: number): void {
    this.position.set(x, feetY + this.eyeHeight, z);
    this.velocity.set(0, 0, 0);
    this.jumpBufferLeft = 0;
    this.coyoteLeft = 0;
    this.grounded = true;
  }

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

    // Source-style: friction first (on the ground only), then acceleration
    // toward the wished direction. Nothing starts or stops instantly, and in
    // the air the momentum of a jump carries on.
    if (this.grounded) {
      applyFriction(this.velocity, dt);
    }

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

      let speed: number = this.isSprinting ? this.sprintSpeed : this.moveSpeed;

      // Side-stepping alone is slower than running forward or back.
      if (moveZ === 0) {
        speed *= SOURCE_MOVEMENT.STRAFE_FACTOR;
      }

      if (this.isCrouching) {
        speed = this.crouchSpeed;
      }

      if (this.isPunching) {
        speed *= this.punchSpeedFactor;
      }

      if (this.grounded) {
        accelerate(
          this.velocity,
          direction,
          speed,
          SOURCE_MOVEMENT.GROUND_ACCELERATE,
          dt,
        );
      } else {
        // In the air the player can steer, but not stop on the spot.
        steerInAir(
          this.velocity,
          direction.x * speed,
          direction.z * speed,
          SOURCE_MOVEMENT.AIR_CONTROL * dt,
        );
      }
    }

    // Whatever speed is left (running, braking, or a jump's momentum) moves the player.
    if (this.velocity.x !== 0 || this.velocity.z !== 0) {
      if (this.world) {
        const moved = this.world.moveHorizontal(
          this.position.x,
          this.position.z,
          this.velocity.x * dt,
          this.velocity.z * dt,
          this.position.y - this.eyeHeight,
          PLAYER_RADIUS,
        );

        this.position.x = moved.x;
        this.position.z = moved.z;
      } else {
        this.position.x += this.velocity.x * dt;
        this.position.z += this.velocity.z * dt;
      }
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
    // Forgiving timing: a press just before landing still jumps (buffer), and a
    // press just after running off a ledge still jumps (coyote time).
    if (input.consumeJump()) {
      this.jumpBufferLeft = this.jumpBufferTime;
    } else {
      this.jumpBufferLeft = Math.max(0, this.jumpBufferLeft - dt);
    }

    this.coyoteLeft = this.grounded
      ? this.coyoteTime
      : Math.max(0, this.coyoteLeft - dt);

    if (this.jumpBufferLeft > 0 && (this.grounded || this.coyoteLeft > 0)) {
      this.velocity.y = this.jumpForce;

      this.grounded = false;
      this.jumpBufferLeft = 0;
      this.coyoteLeft = 0;
    }

    /**
     * ======================================================
     * GRAVITY
     * ======================================================
     */

    // Grounded after the jump check: a jump this frame is never snapped back.
    const wasGrounded = this.grounded;

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
    // The surface under the feet: the floor, or a platform / ramp / step that
    // is no more than a step above them.
    const feetY = this.position.y - this.eyeHeight;
    const groundY = this.world
      ? this.world.groundHeight(this.position.x, this.position.z, feetY)
      : 0;

    // Walking down a ramp or stairs keeps the feet on the surface (no
    // flicker into the jump animation); a real drop falls normally.
    const snapDown =
      this.world !== null &&
      wasGrounded &&
      this.velocity.y <= 0 &&
      feetY - groundY <= SNAP_DOWN;

    this.grounded = false;

    if (feetY <= groundY || snapDown) {
      this.position.y = groundY + this.eyeHeight;

      this.velocity.y = 0;

      this.grounded = true;
    }

    /**
     * ======================================================
     * ARENA BOUNDS
     * ======================================================
     */

    // A jump can carry the feet over a ledge's edge while rising, then drop them
    // below the point where the ledge could be stood on. Never stay inside it:
    // slide back out to its side.
    if (this.world) {
      const free = this.world.pushOut(
        this.position.x,
        this.position.z,
        this.position.y - this.eyeHeight,
        PLAYER_RADIUS,
      );

      this.position.x = free.x;
      this.position.z = free.z;
    }

    if (!this.world) {
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
}

/**
 * ========================================================
 * CLAMP
 * ========================================================
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
