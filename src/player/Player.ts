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
  STEP_UP,
  type ArenaCollision,
  type VaultPlan,
} from "../world/ArenaCollision";
import type { LadderDefinition } from "../world/ArenaLayout";
import { CLIMB, climbSpot, findLadder, ladderNormal } from "./Climb";

/** The head top is this far above the eye (the body is 1.8 m, the eye at 1.7). */
const HEAD_ABOVE_EYE = 0.1;

/** A step is climbed once the feet are this close to it (the legs, not the centre). */
const STEP_REACH = 0.3;

/** How fast the drawn body catches up after a step (per second). */
const STEP_SMOOTHING = 14;

/** Walking (no Shift) on stairs runs at this share of the walk speed. */
const STAIRS_WALK_FACTOR = 0.6;

/** Seconds a vault takes. */
const VAULT_TIME = 0.62;

interface Vault {
  plan: VaultPlan;
  dirX: number;
  dirZ: number;
  startX: number;
  startZ: number;
  startFeet: number;
  time: number;
  exitSpeed: number;
}

export class Player {
  private vault: Vault | null = null;

  /** Vaulting over a railing or box (a timed move, Space with W, A or D held at the obstacle). */
  public get isVaulting(): boolean {
    return this.vault !== null;
  }

  /** How far through the vault (0 to 1) and where the obstacle is, for the pose. */
  public get vaultPose(): {
    progress: number;
    topY: number;
    near: number;
    far: number;
    distance: number;
    dirX: number;
    dirZ: number;
  } | null {
    const v = this.vault;

    return v
      ? {
          progress: Math.min(v.time / VAULT_TIME, 1),
          topY: v.plan.topY,
          near: v.plan.near,
          far: v.plan.far,
          distance: v.plan.distance,
          dirX: v.dirX,
          dirZ: v.dirZ,
        }
      : null;
  }

  /**
   * Starts a vault over what is straight ahead (side 0), or straight out to the
   * right (1) or left (-1), if there is one to vault.
   */
  private beginVault(side: -1 | 0 | 1 = 0): boolean {
    if (!this.world || !this.grounded || this.isCrouching) {
      return false;
    }

    const dirX = side === 0 ? -Math.sin(this.yaw) : Math.cos(this.yaw) * side;
    const dirZ = side === 0 ? -Math.cos(this.yaw) : -Math.sin(this.yaw) * side;
    const startFeet = this.position.y - this.eyeHeight;
    const plan = this.world.findVault(
      this.position.x,
      this.position.z,
      dirX,
      dirZ,
      startFeet,
    );

    if (!plan) {
      return false;
    }

    this.vault = {
      plan,
      dirX,
      dirZ,
      startX: this.position.x,
      startZ: this.position.z,
      startFeet,
      time: 0,
      exitSpeed: Math.max(Math.hypot(this.velocity.x, this.velocity.z), 3.5),
    };
    this.velocity.set(0, 0, 0);
    this.grounded = false;
    this.jumpBufferLeft = 0;
    this.coyoteLeft = 0;

    return true;
  }

  /** Carries the body over the obstacle along a smooth arc; the world is ignored on the way. */
  private updateVault(dt: number): void {
    const v = this.vault;

    if (!v) {
      return;
    }

    v.time += dt;

    const u = Math.min(v.time / VAULT_TIME, 1);
    const { plan } = v;
    const along = plan.distance * u;
    const peak = 0.45;
    let feet: number;

    if (u < peak) {
      feet =
        v.startFeet +
        (plan.clearFeet - v.startFeet) * Math.sin((u / peak) * Math.PI * 0.5);
    } else {
      const e = (u - peak) / (1 - peak);

      feet =
        plan.clearFeet +
        (plan.endFeet - plan.clearFeet) * ((1 - Math.cos(e * Math.PI)) / 2);
    }

    this.position.set(
      v.startX + v.dirX * along,
      feet + this.eyeHeight,
      v.startZ + v.dirZ * along,
    );

    if (u >= 1) {
      this.velocity.set(v.dirX * v.exitSpeed, 0, v.dirZ * v.exitSpeed);
      this.vault = null;
      this.stepLag = 0;
    }
  }

  /**
   * How far the drawn feet trail below (positive) or above the physical ones
   * after a step; it decays to 0. Rendering subtracts it from the feet height.
   */
  public stepLag = 0;

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

  private ladders: readonly LadderDefinition[] = [];

  /**
   * Whether a roof hatch is still shut. Game.ts supplies the real state; with
   * none, hatches are open and a ladder goes straight through.
   */
  public isHatchShut: (id: string) => boolean = () => false;

  /** The ladder being climbed, if any. */
  private ladder: LadderDefinition | null = null;

  public setLadders(ladders: readonly LadderDefinition[]): void {
    this.ladders = ladders;
  }

  /** The ladder being climbed, or null. */
  public get climbLadder(): LadderDefinition | null {
    return this.ladder;
  }

  public get isClimbing(): boolean {
    return this.ladder !== null;
  }

  /** The ladder in reach (close, in height and looked at), or null. */
  public ladderInReach(): LadderDefinition | null {
    // Running or jumping at a ladder counts: it can be grabbed in mid-air.
    if (this.ladder) {
      return null;
    }

    return findLadder(
      this.ladders,
      this.position.x,
      this.position.z,
      this.position.y - this.eyeHeight,
      this.yaw,
    );
  }

  /** On a ladder that has a hatch above it, still shut: E opens it from anywhere on the ladder. */
  public get hasShutHatch(): boolean {
    const hatch = this.ladder?.hatch;

    return hatch !== undefined && this.isHatchShut(hatch.id);
  }

  /** On a ladder, held up by a shut hatch that E would open. */
  public get atShutHatch(): boolean {
    const ladder = this.ladder;

    if (!ladder?.hatch || !this.isHatchShut(ladder.hatch.id)) {
      return false;
    }

    const feet = this.position.y - this.eyeHeight;

    return feet >= ladder.hatch.stopY - 0.3 || feet >= ladder.topY - 0.05;
  }

  /** The hatch id this climber is held up by (see atShutHatch), or null. */
  public get shutHatchId(): string | null {
    return this.atShutHatch ? (this.ladder?.hatch?.id ?? null) : null;
  }

  /** Grabs the ladder in reach. Returns false if there is none. */
  public grabLadder(): boolean {
    const ladder = this.ladderInReach();

    if (!ladder) {
      return false;
    }

    const spot = climbSpot(ladder);
    const feet = Math.min(
      Math.max(this.position.y - this.eyeHeight, ladder.bottomY),
      ladder.topY,
    );

    this.ladder = ladder;
    this.position.set(spot.x, feet + this.eyeHeight, spot.z);
    this.velocity.set(0, 0, 0);
    this.grounded = false;
    this.isSprinting = false;
    this.jumpBufferLeft = 0;
    this.coyoteLeft = 0;

    return true;
  }

  /** Lets go. With `away` the player jumps off, backward from the ladder. */
  public releaseLadder(away = false): void {
    const ladder = this.ladder;

    if (!ladder) {
      return;
    }

    this.ladder = null;

    if (away) {
      const n = ladderNormal(ladder.normal);

      this.velocity.set(
        n.x * CLIMB.JUMP_AWAY,
        CLIMB.JUMP_UP,
        n.z * CLIMB.JUMP_AWAY,
      );
    } else {
      this.velocity.set(0, 0, 0);
    }
  }

  /** One frame on a ladder: W / S climb, Space jumps off, the top steps onto the floor. */
  private updateClimb(dt: number, input: InputManager): void {
    const ladder = this.ladder!;
    const up =
      (input.isPressed("KeyW") ? 1 : 0) - (input.isPressed("KeyS") ? 1 : 0);
    const before = this.position.y - this.eyeHeight;
    let feet = before + up * CLIMB.SPEED * dt;

    // A shut hatch stops the climb: from below with the head under it, from
    // above standing on the top rung.
    if (ladder.hatch && this.isHatchShut(ladder.hatch.id)) {
      feet =
        before < ladder.topY - 0.05
          ? Math.min(feet, ladder.hatch.stopY)
          : Math.max(feet, ladder.topY);
    }

    if (input.consumeJump()) {
      this.releaseLadder(true);

      return;
    }

    if (up > 0 && feet >= ladder.topY) {
      // Over the top: stand on the floor at the exit spot.
      this.ladder = null;
      this.teleport(ladder.exit.x, ladder.topY, ladder.exit.z);

      return;
    }

    if (up < 0 && feet <= ladder.bottomY) {
      // Down the bottom: back on the ground at the foot.
      this.ladder = null;
      this.teleport(ladder.approach.x, ladder.bottomY, ladder.approach.z);

      return;
    }

    feet = Math.min(Math.max(feet, ladder.bottomY), ladder.topY);
    this.position.y = feet + this.eyeHeight;
    this.velocity.set(0, up * CLIMB.SPEED, 0);
  }

  /** Puts the player (feet position) somewhere new and stops all movement. */
  public teleport(x: number, feetY: number, z: number): void {
    this.ladder = null;
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

    if (this.ladder) {
      this.updateClimb(dt, input);

      if (this.ladder) {
        return;
      }
    }

    if (this.vault) {
      input.consumeJump();
      this.updateVault(dt);

      return;
    }

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

      // Stairs are taken slowly; holding Shift keeps the full sprint.
      if (
        this.grounded &&
        !this.isSprinting &&
        this.world?.onStairs(
          this.position.x,
          this.position.z,
          this.position.y - this.eyeHeight,
        )
      ) {
        speed *= STAIRS_WALK_FACTOR;
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

        // Crashing into a wall in mid-air stops the jump's forward run: what is
        // left is only the slide along the wall.
        if (!this.grounded) {
          const ax = (moved.x - this.position.x) / dt;
          const az = (moved.z - this.position.z) / dt;
          const wanted = Math.hypot(this.velocity.x, this.velocity.z);

          // Only a real crash: a wall that a higher jump would not clear. Jumping
          // up onto a ledge is blocked for a moment too, and must keep its run.
          const feet = this.position.y - this.eyeHeight;

          if (
            Math.hypot(ax, az) < wanted * 0.6 &&
            this.world.isBlocked(
              this.position.x + this.velocity.x * dt,
              this.position.z + this.velocity.z * dt,
              feet + 1.0,
              PLAYER_RADIUS,
            )
          ) {
            this.velocity.x = ax;
            this.velocity.z = az;
          }
        }

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

    // W and Space at a railing or a box vaults over it instead of jumping up; A or
    // D and Space (strafing, no W or S) vaults sideways over one beside you.
    if (
      this.jumpBufferLeft > 0 &&
      ((moveZ > 0 && this.beginVault()) ||
        (moveZ === 0 && moveX !== 0 && this.beginVault(moveX > 0 ? 1 : -1)))
    ) {
      this.updateVault(dt);

      return;
    }

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

    const headBefore = this.position.y + HEAD_ABOVE_EYE;

    this.position.y += this.velocity.y * dt;

    // Rising into a ceiling (a roof over a prop you are standing on) bumps the
    // head and stops the jump; it must never shove the body sideways out of the room.
    if (this.world && this.velocity.y > 0) {
      const ceiling = this.world.ceilingHeight(
        this.position.x,
        this.position.z,
        headBefore,
        PLAYER_RADIUS - 0.1,
      );

      if (this.position.y + HEAD_ABOVE_EYE > ceiling - 0.01) {
        this.position.y = ceiling - 0.01 - HEAD_ABOVE_EYE;
        this.velocity.y = 0;
      }
    }

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
      ? this.world.groundHeight(
          this.position.x,
          this.position.z,
          feetY,
          wasGrounded ? STEP_REACH : 0,
        )
      : 0;

    // Walking down a ramp or stairs keeps the feet on the surface (no
    // flicker into the jump animation); a real drop falls normally.
    const snapDown =
      this.world !== null &&
      wasGrounded &&
      this.velocity.y <= 0 &&
      feetY - groundY <= SNAP_DOWN;

    // A step up or down is taken in one frame by the physics; the drawn body
    // trails behind and catches up, so climbing small steps looks smooth.
    this.stepLag *= Math.exp(-STEP_SMOOTHING * dt);

    this.grounded = false;

    if (feetY <= groundY || snapDown) {
      const rise = groundY - feetY;

      if (wasGrounded && Math.abs(rise) > 0.01 && Math.abs(rise) <= STEP_UP) {
        this.stepLag = clamp(this.stepLag + rise, -STEP_UP, STEP_UP);
      }

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
