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

    this.character.update(dt, movementState);

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
  // CHARACTER MOVEMENT STATE
  // ============================================================
  //
  // Priority:
  //
  // 1. Jump
  // 2. Crouch (hold C), crouch walk forward / backwards
  // 3. Strafe left
  // 4. Strafe right
  // 5. Walk / walk backwards
  // 6. Idle
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
     * WALK / RUN / WALK BACKWARDS
     * --------------------------------------------------------
     *
     * W = forward walk (Shift + W = run)
     * S = backward walk
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
      return "walkBackwards";
    }

    /**
     * --------------------------------------------------------
     * IDLE
     * --------------------------------------------------------
     */

    return "idle";
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
    /**
     * Find actual Polyfork Head bone.
     */
    const head = this.findHeadBone();

    if (head) {
      /**
       * Make sure all skeleton transforms
       * are current before reading the head.
       */
      this.character.group.updateMatrixWorld(true);

      /**
       * Get actual world position
       * of the Head bone.
       */
      head.getWorldPosition(this.headWorldPosition);

      /**
       * Start camera from head.
       */
      this.firstPersonCameraPosition.copy(this.headWorldPosition);

      /**
       * Move slightly down toward eye line.
       */
      this.firstPersonCameraPosition.y -= this.firstPersonHeadDownOffset;
    } else {
      /**
       * Fallback.
       *
       * Normally this should not happen because
       * Polyfork contains a Head bone.
       */
      this.firstPersonCameraPosition.copy(this.player.position);
    }

    // ----------------------------------------------------------
    // Player forward direction
    // ----------------------------------------------------------

    this.playerForward.set(
      -Math.sin(this.player.yaw),

      0,

      -Math.cos(this.player.yaw),
    );

    this.playerForward.normalize();

    // ----------------------------------------------------------
    // Move camera slightly forward
    // ----------------------------------------------------------

    this.firstPersonCameraPosition.addScaledVector(
      this.playerForward,
      this.firstPersonForwardOffset,
    );

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
