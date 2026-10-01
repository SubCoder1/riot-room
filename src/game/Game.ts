import * as THREE from "three";

import { Renderer } from "../rendering/Renderer";
import { InputManager } from "../input/InputManager";
import { Player } from "../player/Player";
import { Arena } from "../world/Arena";
import { Character } from "../character/Character";
import { CHARACTER_ASSET_PATH } from "../character/CharacterConfig";

export class Game {
  private readonly renderer: Renderer;
  private readonly arena: Arena;
  private readonly input: InputManager;
  private readonly player: Player;
  private readonly character: Character;

  private lastFrameTime: number;

  /**
   * false = first person
   * true  = third person
   */
  private isThirdPerson = false;

  /**
   * Used to detect one F3 press rather than
   * toggling every frame while F3 is held.
   */
  private previousF3 = false;

  /**
   * ========================================================
   * FIRST PERSON CAMERA
   * ========================================================
   *
   * The camera is positioned from the actual Polyfork
   * Head bone rather than the character root.
   *
   * This is important because the Polyfork skeleton has
   * a small horizontal offset relative to its root.
   */
  private readonly firstPersonHeadDownOffset = 0.08;

  /**
   * Move the camera slightly forward from the head.
   *
   * This prevents the camera from being inside the skull.
   */
  private readonly firstPersonForwardOffset = 0.18;

  /**
   * ========================================================
   * THIRD PERSON CAMERA
   * ========================================================
   */
  private readonly thirdPersonDistance = 3.2;

  private readonly thirdPersonHeight = 1.25;

  private readonly thirdPersonLookHeight = 1.0;

  /**
   * Reusable vectors.
   *
   * These avoid creating new Vector3 objects every frame.
   */
  private readonly headWorldPosition = new THREE.Vector3();

  private readonly playerForward = new THREE.Vector3();

  private readonly firstPersonCameraPosition = new THREE.Vector3();

  private readonly characterFeet = new THREE.Vector3();

  private readonly thirdPersonCameraPosition = new THREE.Vector3();

  private readonly thirdPersonLookTarget = new THREE.Vector3();

  constructor(container: HTMLElement) {
    /**
     * Renderer.
     */
    this.renderer = new Renderer(container);

    /**
     * Arena.
     */
    this.arena = new Arena();

    /**
     * Input.
     */
    this.input = new InputManager(this.renderer.renderer.domElement);

    /**
     * Player controller.
     */
    this.player = new Player();

    /**
     * Complete Polyfork character.
     */
    this.character = new Character();

    this.lastFrameTime = performance.now();

    /**
     * Add arena.
     */
    this.renderer.scene.add(this.arena.group);

    /**
     * Add COMPLETE character.
     *
     * No FirstPersonArms.
     * No extracted viewmodel.
     * No hidden body.
     */
    this.renderer.scene.add(this.character.group);

    /**
     * Load character.
     */
    void this.loadCharacter();

    /**
     * Start game loop.
     */
    this.animate = this.animate.bind(this);

    requestAnimationFrame(this.animate);
  }

  /**
   * ========================================================
   * LOAD CHARACTER
   * ========================================================
   */
  private async loadCharacter(): Promise<void> {
    const loaded = await this.character.load(CHARACTER_ASSET_PATH);

    if (!loaded) {
      console.error("Game: failed to load player character.");

      return;
    }

    console.log("Game: player character loaded successfully.");

    console.log(
      "Game: embedded animations:",
      this.character.animator.getClipNames(),
    );

    /**
     * Complete character is always visible.
     */
    this.character.group.visible = true;

    /**
     * Initial transforms.
     */
    this.updateCharacterTransform();

    this.updateCamera();

    console.log("Game: full Polyfork character active.");
  }

  /**
   * ========================================================
   * MAIN LOOP
   * ========================================================
   */
  private animate(): void {
    const currentTime = performance.now();

    const elapsedSeconds = (currentTime - this.lastFrameTime) / 1000;

    this.lastFrameTime = currentTime;

    /**
     * Prevent a huge delta after tab inactivity.
     */
    const dt = Math.min(elapsedSeconds, 0.05);

    /**
     * F3 camera toggle.
     */
    this.updateCameraToggle();

    /**
     * Player movement and look.
     */
    this.player.update(dt, this.input);

    /**
     * Movement state.
     */
    const isMoving =
      this.input.isPressed("KeyW") ||
      this.input.isPressed("KeyA") ||
      this.input.isPressed("KeyS") ||
      this.input.isPressed("KeyD");

    /**
     * Character animation.
     */
    this.character.update(dt, isMoving);

    /**
     * Character world transform.
     */
    this.updateCharacterTransform();

    /**
     * Camera.
     */
    this.updateCamera();

    /**
     * Render.
     */
    this.renderer.render();

    requestAnimationFrame(this.animate);
  }

  /**
   * ========================================================
   * F3 TOGGLE
   * ========================================================
   */
  private updateCameraToggle(): void {
    const f3Pressed = this.input.isPressed("F3");

    if (f3Pressed && !this.previousF3) {
      this.isThirdPerson = !this.isThirdPerson;

      console.log(
        "Game: camera mode:",
        this.isThirdPerson ? "THIRD PERSON" : "FIRST PERSON",
      );
    }

    this.previousF3 = f3Pressed;
  }

  /**
   * ========================================================
   * CHARACTER PRESENTATION
   * ========================================================
   *
   * The complete character is ALWAYS visible.
   */
  private updatePresentation(): void {
    this.character.group.visible = true;
  }

  /**
   * ========================================================
   * CHARACTER TRANSFORM
   * ========================================================
   *
   * Player position = eye/reference position.
   *
   * Character root = feet.
   */
  private updateCharacterTransform(): void {
    this.characterFeet.set(
      this.player.position.x,
      this.player.position.y - this.player.eyeHeight,
      this.player.position.z,
    );

    /**
     * Keep the character perfectly upright.
     *
     * Only Y rotates.
     */
    this.character.setTransform(this.characterFeet, this.player.yaw + Math.PI);
  }

  /**
   * ========================================================
   * CAMERA
   * ========================================================
   */
  private updateCamera(): void {
    this.updatePresentation();

    if (this.isThirdPerson) {
      this.updateThirdPersonCamera();

      return;
    }

    this.updateFirstPersonCamera();
  }

  /**
   * ========================================================
   * FIRST PERSON CAMERA
   * ========================================================
   *
   * IMPORTANT:
   *
   * We no longer calculate the camera position from
   * player.position.y.
   *
   * Instead:
   *
   *     actual Polyfork Head bone
   *                ↓
   *        move slightly downward
   *                ↓
   *        move slightly forward
   *                ↓
   *             CAMERA
   *
   * This keeps the camera centered on the actual head.
   */
  private updateFirstPersonCamera(): void {
    /**
     * Find the actual Head bone.
     */
    const head = this.findHeadBone();

    if (head) {
      /**
       * Make sure the skeleton's world transforms
       * are completely current.
       */
      this.character.group.updateMatrixWorld(true);

      /**
       * Get the actual head position in world space.
       */
      head.getWorldPosition(this.headWorldPosition);

      /**
       * Start directly from the center of the head.
       */
      this.firstPersonCameraPosition.copy(this.headWorldPosition);

      /**
       * Move slightly downward from the center
       * of the head toward the eye line.
       */
      this.firstPersonCameraPosition.y -= this.firstPersonHeadDownOffset;
    } else {
      /**
       * Fallback if the Head bone cannot be found.
       *
       * This should normally never happen with the
       * Polyfork model.
       */
      this.firstPersonCameraPosition.copy(this.player.position);

      console.warn(
        "Game: Head bone not found; using player position for FPP camera.",
      );
    }

    /**
     * Player/camera forward direction.
     *
     * This is based on the player's actual yaw,
     * not the character root's local axes.
     */
    this.playerForward.set(
      -Math.sin(this.player.yaw),
      0,
      -Math.cos(this.player.yaw),
    );

    /**
     * Normalize for safety.
     */
    this.playerForward.normalize();

    /**
     * Move slightly forward from the face/head.
     *
     * This prevents the camera from sitting inside
     * the head geometry.
     */
    this.firstPersonCameraPosition.addScaledVector(
      this.playerForward,
      this.firstPersonForwardOffset,
    );

    /**
     * Apply final camera position.
     */
    this.renderer.camera.position.copy(this.firstPersonCameraPosition);

    /**
     * Apply FPS look.
     *
     * Camera stays centered on the player's
     * yaw/pitch axis.
     */
    this.renderer.camera.rotation.set(
      this.player.pitch,
      this.player.yaw,
      0,
      "YXZ",
    );
  }

  /**
   * ========================================================
   * FIND HEAD BONE
   * ========================================================
   */
  private findHeadBone(): THREE.Bone | null {
    let headBone: THREE.Bone | null = null;

    this.character.group.traverse((object) => {
      if (headBone) {
        return;
      }

      if (object instanceof THREE.Bone && object.name === "Head") {
        headBone = object;
      }
    });

    return headBone;
  }

  /**
   * ========================================================
   * THIRD PERSON CAMERA
   * ========================================================
   */
  private updateThirdPersonCamera(): void {
    /**
     * Character feet.
     */
    this.characterFeet.set(
      this.player.position.x,
      this.player.position.y - this.player.eyeHeight,
      this.player.position.z,
    );

    /**
     * Player forward.
     */
    this.playerForward.set(
      -Math.sin(this.player.yaw),
      0,
      -Math.cos(this.player.yaw),
    );

    this.playerForward.normalize();

    /**
     * Start at character feet.
     */
    this.thirdPersonCameraPosition.copy(this.characterFeet);

    /**
     * Raise camera.
     */
    this.thirdPersonCameraPosition.y += this.thirdPersonHeight;

    /**
     * Put camera in front of character.
     */
    this.thirdPersonCameraPosition.addScaledVector(
      this.playerForward,
      this.thirdPersonDistance,
    );

    /**
     * Apply camera position.
     */
    this.renderer.camera.position.copy(this.thirdPersonCameraPosition);

    /**
     * Look at upper body.
     */
    this.thirdPersonLookTarget.copy(this.characterFeet);

    this.thirdPersonLookTarget.y += this.thirdPersonLookHeight;

    this.renderer.camera.lookAt(this.thirdPersonLookTarget);
  }

  /**
   * ========================================================
   * DISPOSE
   * ========================================================
   */
  public dispose(): void {
    this.input.dispose();

    this.character.dispose();

    this.renderer.dispose();
  }
}
