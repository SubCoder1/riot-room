import * as THREE from "three";

import { Renderer } from "../rendering/Renderer";
import { InputManager } from "../input/InputManager";
import { Player } from "../player/Player";
import { Arena } from "../world/Arena";
import { Character } from "../character/Character";
import type { CharacterMovementState } from "../character/Character";
import { CHARACTER_ASSET_PATH } from "../character/CharacterConfig";

export class Game {
  // ============================================================
  // CORE SYSTEMS
  // ============================================================

  private readonly renderer: Renderer;
  private readonly arena: Arena;
  private readonly input: InputManager;
  private readonly player: Player;
  private crouchCancelled = false;
  private punchTimeLeft = 0;
  /** Flying punch: sprint-jump state, one punch per jump, held until landing. */
  private wasGrounded = true;
  private jumpPunchReady = false;
  private flyPunchUsed = false;
  private flyPunchActive = false;
  /** Heavy landing recovery after a flying punch; early clicks are ignored. */
  private flyLandTimeLeft = 0;
  private readonly flyLandIgnoreClicksTime = 0.35;
  private flyLandDuration = 0;
  /** Walking (not sprinting) jump punch: lighter punch and landing. */
  private flyPunchLight = false;
  /** Heavy running punch in progress (first click while sprinting forward). */
  private runPunchTimeLeft = 0;
  /** An early click is remembered this long so fast spamming isn't dropped. */
  private punchBufferLeft = 0;
  private readonly punchBufferTime = 0.2;
  /** Alternating combo survives this long after a punch ends. */
  private comboTimeLeft = 0;
  private readonly comboGraceTime = 0.25;
  private readonly character: Character;

  private lastFrameTime: number;

  // ============================================================
  // CAMERA MODE
  // ============================================================

  /**
   * false = first person
   * true  = third person
   */
  private isThirdPerson = false;

  /**
   * Used so F3 toggles only once per key press.
   */
  private previousF3 = false;

  // ============================================================
  // FIRST PERSON CAMERA
  // ============================================================

  /**
   * Move camera slightly down from the center
   * of the Polyfork Head bone.
   */
  private readonly firstPersonHeadDownOffset = 0.08;

  /**
   * Move camera slightly forward from the head.
   *
   * This prevents the camera from being inside
   * the character's head.
   */
  private readonly firstPersonForwardOffset = 0.18;

  // ============================================================
  // THIRD PERSON CAMERA
  // ============================================================

  private readonly thirdPersonDistance = 3.2;

  private readonly thirdPersonHeight = 1.25;

  private readonly thirdPersonLookHeight = 1.0;

  // ============================================================
  // REUSABLE VECTORS
  // ============================================================

  private readonly headWorldPosition = new THREE.Vector3();

  private readonly playerForward = new THREE.Vector3();

  private readonly firstPersonCameraPosition = new THREE.Vector3();
  private readonly cameraOffsetDirection = new THREE.Vector3();
  private readonly cameraUp = new THREE.Vector3(0, 1, 0);
  private readonly cameraHeadQuat = new THREE.Quaternion();
  private readonly cameraHipsQuat = new THREE.Quaternion();
  private headLocalEye: THREE.Vector3 | null = null;

  private readonly characterFeet = new THREE.Vector3();

  private readonly thirdPersonCameraPosition = new THREE.Vector3();

  private readonly thirdPersonLookTarget = new THREE.Vector3();

  private headBone: THREE.Bone | null = null;

  private headBoneSearched = false;

  // ============================================================
  // CONSTRUCTOR
  // ============================================================

  constructor(container: HTMLElement) {
    // ----------------------------------------------------------
    // Renderer
    // ----------------------------------------------------------

    this.renderer = new Renderer(container);

    // ----------------------------------------------------------
    // Arena
    // ----------------------------------------------------------

    this.arena = new Arena();

    // ----------------------------------------------------------
    // Input
    // ----------------------------------------------------------

    this.input = new InputManager(this.renderer.renderer.domElement);

    // ----------------------------------------------------------
    // Player controller
    // ----------------------------------------------------------

    this.player = new Player();

    // ----------------------------------------------------------
    // Complete Polyfork character
    // ----------------------------------------------------------

    this.character = new Character();

    // ----------------------------------------------------------
    // Frame timing
    // ----------------------------------------------------------

    this.lastFrameTime = performance.now();

    // ----------------------------------------------------------
    // Add arena to scene
    // ----------------------------------------------------------

    this.renderer.scene.add(this.arena.group);

    // ----------------------------------------------------------
    // Add complete character
    // ----------------------------------------------------------
    //
    // IMPORTANT:
    //
    // We are NOT using:
    //
    // FirstPersonArms
    // ViewModel
    // Separate fists
    // Hidden character body
    //
    // The complete Polyfork character stays active.
    //

    this.renderer.scene.add(this.character.group);

    // ----------------------------------------------------------
    // Load character
    // ----------------------------------------------------------

    void this.loadCharacter();

    // ----------------------------------------------------------
    // Start game loop
    // ----------------------------------------------------------

    this.animate = this.animate.bind(this);

    requestAnimationFrame(this.animate);
  }

  // ============================================================
  // LOAD CHARACTER
  // ============================================================

  private async loadCharacter(): Promise<void> {
    const loaded = await this.character.load(CHARACTER_ASSET_PATH);

    if (!loaded) {
      console.error("Game: failed to load player character.");

      return;
    }

    console.log("Game: player character loaded successfully.");

    this.findHeadBone();

    console.log(
      "Game: embedded animations:",
      this.character.animator.getClipNames(),
    );

    // ----------------------------------------------------------
    // Character visibility
    // ----------------------------------------------------------

    this.character.group.visible = true;

    // ----------------------------------------------------------
    // Initial character position
    // ----------------------------------------------------------

    this.updateCharacterTransform();

    // ----------------------------------------------------------
    // Initial camera position
    // ----------------------------------------------------------

    this.updateCamera();

    console.log("Game: full Polyfork character active.");
  }

  // ============================================================
  // MAIN GAME LOOP
  // ============================================================

  private animate(): void {
    const currentTime = performance.now();

    const elapsedSeconds = (currentTime - this.lastFrameTime) / 1000;

    this.lastFrameTime = currentTime;

    /**
     * Prevent a huge physics step if
     * the browser tab was inactive.
     */
    const dt = Math.min(elapsedSeconds, 0.05);

    // ----------------------------------------------------------
    // Camera toggle
    // ----------------------------------------------------------

    this.updateCameraToggle();

    // ----------------------------------------------------------
    // PLAYER PHYSICS
    // ----------------------------------------------------------
    //
    // Player handles:
    //
    // W/A/S/D
    // Sprint
    // Jump
    // Gravity
    // Ground collision
    // Arena bounds
    //

    this.updateCrouchState();

    // Holding right click guards. Sprinting wins only when it changes the
    // animation to a run: Shift + W / S while standing. Fast strafing keeps the
    // guard, and Shift does nothing special while crouched.
    const sprintRequested =
      (this.input.isPressed("ShiftLeft") || this.input.isPressed("ShiftRight")) &&
      (this.input.isPressed("KeyW") || this.input.isPressed("KeyS")) &&
      !this.player.isCrouching;

    this.player.isBlocking =
      this.input.isMouseDown(2) && this.player.isGrounded && !sprintRequested;

    this.updatePunchState(dt);

    this.player.update(dt, this.input);

    // ----------------------------------------------------------
    // CHARACTER ANIMATION
    // ----------------------------------------------------------
    //
    // IMPORTANT:
    //
    // We DO NOT calculate airborne state from
    // player.position.y.
    //
    // Player already knows whether it is grounded.
    //

    const movementState = this.getCharacterMovementState();

    this.character.setAim(
      this.player.pitch,
      this.punchTimeLeft > 0 ||
        this.runPunchTimeLeft > 0 ||
        this.flyPunchActive ||
        this.player.isBlocking,
      !this.player.isGrounded,
      (this.punchTimeLeft > 0 || this.runPunchTimeLeft > 0) &&
        this.player.isGrounded,
    );

    this.character.update(
      dt,
      movementState,
      this.punchTimeLeft > 0 &&
        movementState !== "punch" &&
        movementState !== "runPunch",
      this.flyPunchActive,
      this.player.isBlocking &&
        this.flyLandTimeLeft <= 0 &&
        this.punchTimeLeft <= 0 &&
        this.runPunchTimeLeft <= 0 &&
        (movementState === "block" ||
          movementState === "crouch" ||
          movementState === "crouchWalk" ||
          movementState === "crouchWalkBackwards" ||
          movementState === "crouchStrafeLeft" ||
          movementState === "crouchStrafeRight" ||
          movementState === "walk" ||
          movementState === "walkBackwards" ||
          movementState === "strafeLeft" ||
          movementState === "strafeRight"),
    );

    // ----------------------------------------------------------
    // Character world transform
    // ----------------------------------------------------------

    this.updateCharacterTransform();

    // ----------------------------------------------------------
    // Camera
    // ----------------------------------------------------------

    this.updateCamera();

    // ----------------------------------------------------------
    // Render
    // ----------------------------------------------------------

    this.renderer.render();

    // ----------------------------------------------------------
    // Next frame
    // ----------------------------------------------------------

    requestAnimationFrame(this.animate);
  }

  // ============================================================
  // CROUCH
  // ============================================================
  //
  // Holding C crouches. Pressing Space while crouched stands the
  // player up instead of jumping, and stays standing until C is
  // released.
  //
  // ============================================================

  private isCrouching(): boolean {
    return (
      this.player.isGrounded &&
      !this.crouchCancelled &&
      this.input.isPressed("KeyC")
    );
  }

  private updateCrouchState(): void {
    if (!this.input.isPressed("KeyC")) {
      this.crouchCancelled = false;
      this.player.isCrouching = false;
      return;
    }

    // Consuming the jump here keeps Player from jumping on the same press.
    if (this.isCrouching() && this.input.consumeJump()) {
      this.crouchCancelled = true;
    }

    this.player.isCrouching = this.isCrouching();
  }

  // ============================================================
  // PUNCH
  // ============================================================
  //
  // Left click throws a punch while standing on the ground. Clicking again
  // near the end of a punch chains the next one. Movement is slowed while
  // the punch plays; jumping or crouching cancels it.
  //
  // ============================================================

  private updatePunchState(dt: number): void {
    const attackClick = this.input.consumeAttack();
    const grounded = this.player.isGrounded;
    const sprintingForward =
      this.player.isSprinting && this.input.isPressed("KeyW");

    // Sprint-jump -> one flying punch on the first click in the air; every
    // other click while airborne is ignored.
    if (this.wasGrounded && !grounded) {
      // Sprint-jump = heavy; jumping while walking/strafing = light version.
      this.jumpPunchReady = sprintingForward || this.isMovementInputActive();
      this.flyPunchLight = !sprintingForward;
      this.flyPunchUsed = false;
    }
    this.wasGrounded = grounded;

    this.flyLandTimeLeft = Math.max(0, this.flyLandTimeLeft - dt);

    if (!grounded || this.player.isCrouching) {
      this.flyLandTimeLeft = 0;
    }

    let landingClick = attackClick;

    if (this.flyLandTimeLeft > 0 && attackClick) {
      const elapsed = this.flyLandDuration - this.flyLandTimeLeft;
      const ignoreFor = this.flyPunchLight
        ? this.flyLandIgnoreClicksTime * 0.5
        : this.flyLandIgnoreClicksTime;

      if (elapsed < ignoreFor) {
        landingClick = false;
      } else {
        // Spamming again once the impact has settled breaks out of the landing.
        this.flyLandTimeLeft = 0;
      }
    }

    if (!grounded) {
      if (attackClick && this.jumpPunchReady && !this.flyPunchUsed) {
        this.flyPunchUsed = true;
        this.flyPunchActive = true;
        this.character.startFlyingPunch(this.flyPunchLight);
      }
      this.punchBufferLeft = 0;
    } else {
      if (this.flyPunchActive) {
        // Landed: spamming now continues with the normal combo (left hook first).
        this.flyPunchActive = false;
        this.character.setFlyLandLight(this.flyPunchLight);
        this.flyLandDuration = this.character.flyLandDuration;
        this.flyLandTimeLeft = this.flyLandDuration;
        this.comboTimeLeft = this.flyLandDuration + this.comboGraceTime;
        landingClick = false;
      }
      this.jumpPunchReady = false;

      // Clicks are ignored while holding a block (standing still).
      const blocking = this.player.isBlocking;

      if (landingClick && !blocking) {
        this.punchBufferLeft = this.punchBufferTime;
      }
    }

    // The heavy running punch always plays out in full: clicks during it are dropped.
    if (this.runPunchTimeLeft > 0) {
      this.punchBufferLeft = 0;
    }

    const canPunch = grounded && !this.player.isCrouching;
    const duration = this.character.punchDuration;
    const runDuration = this.character.runPunchDuration;

    if (!canPunch || (this.runPunchTimeLeft > 0 && !sprintingForward)) {
      this.runPunchTimeLeft = 0;
    }

    if (!canPunch) {
      this.punchTimeLeft = 0;
      this.punchBufferLeft = 0;
      this.comboTimeLeft = 0;
      if (!this.flyPunchActive) {
        this.character.resetPunchCombo();
      }
    } else if (
      this.punchBufferLeft > 0 &&
      sprintingForward &&
      runDuration > 0 &&
      this.punchTimeLeft <= 0 &&
      this.runPunchTimeLeft <= 0 &&
      this.comboTimeLeft <= 0
    ) {
      // First click of a sprint: one heavy right-hand punch, then keep running.
      this.character.startRunPunch();
      this.runPunchTimeLeft = runDuration;
      this.punchBufferLeft = 0;
      this.comboTimeLeft = runDuration + this.comboGraceTime;
    } else if (
      this.punchBufferLeft > 0 &&
      this.punchTimeLeft <= duration * 0.35 &&
      this.runPunchTimeLeft <= 0
    ) {
      // Clicks after the heavy punch has finished: normal alternating combo.
      this.character.startPunch();
      this.punchTimeLeft = duration;
      this.runPunchTimeLeft = 0;
      this.punchBufferLeft = 0;
      this.comboTimeLeft = duration + this.comboGraceTime;
    } else {
      this.punchTimeLeft = Math.max(0, this.punchTimeLeft - dt);
      this.runPunchTimeLeft = Math.max(0, this.runPunchTimeLeft - dt);
      this.punchBufferLeft = Math.max(0, this.punchBufferLeft - dt);
      if (this.comboTimeLeft > 0) {
        this.comboTimeLeft -= dt;
        if (this.comboTimeLeft <= 0) {
          this.character.resetPunchCombo();
        }
      }
    }

    this.player.isPunching = this.punchTimeLeft > 0 || this.flyLandTimeLeft > 0;
    this.player.punchSpeedFactor =
      this.flyLandTimeLeft > 0
        ? this.flyPunchLight
          ? 0.55
          : 0.2
        : this.isThirdPerson
          ? 0.8
          : 0.3;
  }

  // ============================================================
  // CHARACTER MOVEMENT STATE
  // ============================================================
  //
  // Priority:
  //
  // 1. Jump
  // 2. Crouch (hold C), crouch walk forward / backwards
  // 3. Punch
  // 4. Strafe left
  // 5. Strafe right
  // 6. Walk / run / backwards
  // 7. Idle
  //
  // ============================================================

  private getCharacterMovementState(): CharacterMovementState {
    /**
     * --------------------------------------------------------
     * JUMP
     * --------------------------------------------------------
     *
     * Jump has highest priority.
     *
     * We use the REAL physics state from Player.
     *
     * No Y-position guessing.
     */
    if (!this.player.isGrounded) {
      return "jump";
    }

    /**
     * --------------------------------------------------------
     * CROUCH
     * --------------------------------------------------------
     *
     * Plays for as long as C is held, unless Space was pressed
     * to stand up (see updateCrouchState). Moves slower while crouched.
     */

    if (this.isCrouching()) {
      // W/S net input picks the crouch walk; otherwise A/D pick the crouch strafe.
      const crouchForward =
        (this.input.isPressed("KeyW") ? 1 : 0) -
        (this.input.isPressed("KeyS") ? 1 : 0);

      if (crouchForward > 0) {
        return "crouchWalk";
      }

      if (crouchForward < 0) {
        return "crouchWalkBackwards";
      }

      const crouchSide =
        (this.input.isPressed("KeyA") ? 1 : 0) -
        (this.input.isPressed("KeyD") ? 1 : 0);

      if (crouchSide > 0) {
        return "crouchStrafeLeft";
      }

      if (crouchSide < 0) {
        return "crouchStrafeRight";
      }

      return "crouch";
    }

    /**
     * --------------------------------------------------------
     * PUNCH
     * --------------------------------------------------------
     */

    // Idle block: hold right click while standing still.
    if (
      this.input.isMouseDown(2) &&
      this.flyLandTimeLeft <= 0 &&
      this.punchTimeLeft <= 0 &&
      this.runPunchTimeLeft <= 0 &&
      !this.isMovementInputActive()
    ) {
      return "block";
    }

    // Heavy landing after a flying punch.
    if (this.flyLandTimeLeft > 0) {
      return "flyLand";
    }

    // Standing punches use the full-body clip. In third person, a moving punch
    // only drives the upper body so the legs keep their locomotion cycle. In
    // first person the camera rides the head bone, so the steady full-body
    // clip is kept to avoid walk-bob jitter.
    if (
      this.punchTimeLeft > 0 &&
      (!this.isThirdPerson || !this.isMovementInputActive())
    ) {
      return "punch";
    }

    if (this.runPunchTimeLeft > 0) {
      return "runPunch";
    }

    /**
     * --------------------------------------------------------
     * STRAFE LEFT
     * --------------------------------------------------------
     */

    if (this.input.isPressed("KeyA")) {
      return "strafeLeft";
    }

    /**
     * --------------------------------------------------------
     * STRAFE RIGHT
     * --------------------------------------------------------
     */

    if (this.input.isPressed("KeyD")) {
      return "strafeRight";
    }

    /**
     * --------------------------------------------------------
     * WALK / RUN / BACKWARDS
     * --------------------------------------------------------
     *
     * W = forward walk (Shift + W = run)
     * S = backward walk (Shift + S = backward run)
     *
     * Matches Player movement: W and S together cancel out.
     */
    const forwardInput =
      (this.input.isPressed("KeyW") ? 1 : 0) -
      (this.input.isPressed("KeyS") ? 1 : 0);

    if (forwardInput > 0) {
      // Holding Shift (sprint) turns the forward walk into a run.
      return this.player.isSprinting ? "run" : "walk";
    }

    if (forwardInput < 0) {
      return this.player.isSprinting ? "runBackwards" : "walkBackwards";
    }

    /**
     * --------------------------------------------------------
     * IDLE
     * --------------------------------------------------------
     */

    return "idle";
  }

  private isMovementInputActive(): boolean {
    return (
      this.input.isPressed("KeyW") ||
      this.input.isPressed("KeyA") ||
      this.input.isPressed("KeyS") ||
      this.input.isPressed("KeyD")
    );
  }

  // ============================================================
  // CAMERA TOGGLE
  // ============================================================

  private updateCameraToggle(): void {
    const f3Pressed = this.input.isPressed("F3");

    /**
     * Toggle only when F3 changes
     * from released -> pressed.
     */
    if (f3Pressed && !this.previousF3) {
      this.isThirdPerson = !this.isThirdPerson;

      console.log(
        "Game: camera mode:",
        this.isThirdPerson ? "THIRD PERSON" : "FIRST PERSON",
      );
    }

    this.previousF3 = f3Pressed;
  }

  // ============================================================
  // CHARACTER PRESENTATION
  // ============================================================

  private updatePresentation(): void {
    /**
     * The complete character is always visible.
     */
    this.character.group.visible = true;
  }

  // ============================================================
  // CHARACTER TRANSFORM
  // ============================================================

  private updateCharacterTransform(): void {
    /**
     * Player position represents the eyes.
     *
     * Character position represents the feet.
     *
     * Therefore:
     *
     *     feetY = eyeY - eyeHeight
     */
    this.characterFeet.set(
      this.player.position.x,

      this.player.position.y - this.player.eyeHeight,

      this.player.position.z,
    );

    /**
     * Keep the character upright.
     *
     * Only rotate around Y.
     */
    this.character.setTransform(this.characterFeet, this.player.yaw + Math.PI);
  }

  // ============================================================
  // CAMERA
  // ============================================================

  private updateCamera(): void {
    this.updatePresentation();

    if (this.isThirdPerson) {
      this.updateThirdPersonCamera();

      return;
    }

    this.updateFirstPersonCamera();
  }

  // ============================================================
  // FIRST PERSON CAMERA
  // ============================================================

  private updateFirstPersonCamera(): void {
    const head = this.findHeadBone();

    // Player forward direction (horizontal).
    this.playerForward.set(
      -Math.sin(this.player.yaw),

      0,

      -Math.cos(this.player.yaw),
    );

    this.playerForward.normalize();

    if (head) {
      // Make sure all skeleton transforms are current before reading the head.
      this.character.group.updateMatrixWorld(true);

      head.getWorldPosition(this.headWorldPosition);
      head.getWorldQuaternion(this.cameraHeadQuat);

      // Eye point: slightly forward of and below the head bone. It is stored
      // in the head's own frame, so however the head leans, twists or pitches
      // during punches, the camera stays in front of the face.
      if (!this.headLocalEye) {
        const punching =
          this.punchTimeLeft > 0 ||
          this.runPunchTimeLeft > 0 ||
          this.flyPunchActive;

        // Calibrate once, from a neutral (non-punching) pose.
        if (!punching) {
          this.headLocalEye = this.cameraOffsetDirection
            .copy(this.playerForward)
            .multiplyScalar(this.firstPersonForwardOffset)
            .addScaledVector(this.cameraUp, -this.firstPersonHeadDownOffset)
            .applyQuaternion(
              this.cameraHipsQuat.copy(this.cameraHeadQuat).invert(),
            )
            .clone();
        }
      }

      this.firstPersonCameraPosition.copy(this.headWorldPosition);

      if (this.headLocalEye) {
        this.firstPersonCameraPosition.add(
          this.cameraOffsetDirection
            .copy(this.headLocalEye)
            .applyQuaternion(this.cameraHeadQuat),
        );
      } else {
        this.firstPersonCameraPosition.y -= this.firstPersonHeadDownOffset;
        this.firstPersonCameraPosition.addScaledVector(
          this.playerForward,
          this.firstPersonForwardOffset,
        );
      }

      // Small extra margin while looking up, where the forehead/brow sweeps
      // closest to the camera.
      this.firstPersonCameraPosition.addScaledVector(
        this.playerForward,
        0.05 * THREE.MathUtils.clamp(this.player.pitch / 1.0, 0, 1),
      );
    } else {
      // Fallback: Polyfork normally always has a Head bone.
      this.firstPersonCameraPosition.copy(this.player.position);
    }

    // ----------------------------------------------------------
    // Apply camera position
    // ----------------------------------------------------------

    this.renderer.camera.position.copy(this.firstPersonCameraPosition);

    // ----------------------------------------------------------
    // Apply FPS look
    // ----------------------------------------------------------

    this.renderer.camera.rotation.set(
      this.player.pitch,
      this.player.yaw,
      0,
      "YXZ",
    );
  }

  // ============================================================
  // FIND HEAD BONE
  // ============================================================

  private findHeadBone(): THREE.Bone | null {
    if (!this.character.isLoaded || this.headBoneSearched) {
      return this.headBone;
    }

    this.headBoneSearched = true;

    this.character.group.traverse((object) => {
      if (this.headBone) {
        return;
      }

      if (
        object.name.toLowerCase() === "head" &&
        (object instanceof THREE.Bone || object.type === "Bone")
      ) {
        this.headBone = object as THREE.Bone;
      }
    });

    if (!this.headBone) {
      console.warn(
        "Game: Head bone not found; using player position for FPP camera.",
      );
    }

    return this.headBone;
  }

  // ============================================================
  // THIRD PERSON CAMERA
  // ============================================================

  private updateThirdPersonCamera(): void {
    // ----------------------------------------------------------
    // Character feet
    // ----------------------------------------------------------

    this.characterFeet.set(
      this.player.position.x,

      this.player.position.y - this.player.eyeHeight,

      this.player.position.z,
    );

    // ----------------------------------------------------------
    // Player forward
    // ----------------------------------------------------------

    this.playerForward.set(
      -Math.sin(this.player.yaw),

      0,

      -Math.cos(this.player.yaw),
    );

    this.playerForward.normalize();

    // ----------------------------------------------------------
    // Start at character feet
    // ----------------------------------------------------------

    this.thirdPersonCameraPosition.copy(this.characterFeet);

    // ----------------------------------------------------------
    // Raise camera
    // ----------------------------------------------------------

    this.thirdPersonCameraPosition.y += this.thirdPersonHeight;

    // ----------------------------------------------------------
    // Put camera in front of character
    // ----------------------------------------------------------

    this.thirdPersonCameraPosition.addScaledVector(
      this.playerForward,
      this.thirdPersonDistance,
    );

    // ----------------------------------------------------------
    // Apply camera position
    // ----------------------------------------------------------

    this.renderer.camera.position.copy(this.thirdPersonCameraPosition);

    // ----------------------------------------------------------
    // Look at upper body
    // ----------------------------------------------------------

    this.thirdPersonLookTarget.copy(this.characterFeet);

    this.thirdPersonLookTarget.y += this.thirdPersonLookHeight;

    this.renderer.camera.lookAt(this.thirdPersonLookTarget);
  }

  // ============================================================
  // DISPOSE
  // ============================================================

  public dispose(): void {
    this.input.dispose();

    this.character.dispose();

    this.renderer.dispose();
  }
}
