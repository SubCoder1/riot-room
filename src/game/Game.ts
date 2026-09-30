import * as THREE from "three";

import { Renderer } from "../rendering/Renderer";
import { InputManager } from "../input/InputManager";
import { Player } from "../player/Player";
import { Arena } from "../world/Arena";
import { Character } from "../character/Character";
import { FirstPersonArms } from "../character/FirstPersonArms";
import { CHARACTER_ASSET_PATH } from "../character/CharacterConfig";

export class Game {
  private readonly renderer: Renderer;
  private readonly arena: Arena;
  private readonly input: InputManager;
  private readonly player: Player;
  private readonly character: Character;

  private firstPersonArms: FirstPersonArms | null = null;

  private lastFrameTime: number;

  private readonly playerEyeHeight = 1.7;

  /*
   * Temporary first-person camera offset.
   *
   * The character model itself is about 1.86 units
   * tall, so this places the camera around the head.
   */
  private readonly cameraHeadOffset = new THREE.Vector3(0, 1.5, 0.45);

  constructor(container: HTMLElement) {
    this.renderer = new Renderer(container);

    this.arena = new Arena();

    this.input = new InputManager(this.renderer.renderer.domElement);

    this.player = new Player();

    this.character = new Character();

    this.lastFrameTime = performance.now();

    /*
     * ===============================================
     * SCENE
     * ===============================================
     */
    this.renderer.scene.add(this.arena.group);

    /*
     * IMPORTANT:
     *
     * The actual Polyfork character stays visible.
     *
     * We are NOT hiding it.
     */
    this.renderer.scene.add(this.character.group);

    void this.loadCharacter();

    this.animate = this.animate.bind(this);

    requestAnimationFrame(this.animate);
  }

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

    /*
     * ===============================================
     * FIRST-PERSON CONTROLLER
     * ===============================================
     */
    this.firstPersonArms = new FirstPersonArms(this.character.group);

    /*
     * IMPORTANT:
     *
     * We DO NOT add FirstPersonArms to the camera.
     *
     * It is no longer a visual arm mesh.
     */
    console.log("Game: using original Polyfork model for first-person view.");

    /*
     * ===============================================
     * INITIAL TRANSFORM
     * ===============================================
     */
    this.updateCharacterTransform();

    this.updateFirstPersonCamera();
  }

  private animate(): void {
    const currentTime = performance.now();

    const elapsedSeconds = (currentTime - this.lastFrameTime) / 1000;

    this.lastFrameTime = currentTime;

    const dt = Math.min(elapsedSeconds, 0.05);

    /*
     * ===============================================
     * PLAYER
     * ===============================================
     */
    this.player.update(dt, this.input);

    /*
     * ===============================================
     * CHARACTER TRANSFORM
     * ===============================================
     */
    this.updateCharacterTransform();

    /*
     * ===============================================
     * CAMERA
     * ===============================================
     */
    this.updateFirstPersonCamera();

    /*
     * ===============================================
     * REAL POLYFORK ANIMATION
     * ===============================================
     *
     * This updates the ORIGINAL character skeleton.
     */
    this.character.update(dt);

    /*
     * No manual arm animation.
     */
    this.firstPersonArms?.update(dt);

    /*
     * ===============================================
     * RENDER
     * ===============================================
     */
    this.renderer.render();

    requestAnimationFrame(this.animate);
  }

  private updateCharacterTransform(): void {
    /*
     * Character root is positioned at the player's
     * feet.
     *
     * Player position represents eye position,
     * therefore subtract eye height.
     */
    const characterPosition = new THREE.Vector3(
      this.player.position.x,
      this.player.position.y - this.playerEyeHeight,
      this.player.position.z,
    );

    /*
     * Polyfork's forward direction is opposite
     * to the player's forward convention.
     */
    this.character.setTransform(characterPosition, this.player.yaw + Math.PI);
  }

  private updateFirstPersonCamera(): void {
    /*
     * ===============================================
     * CAMERA POSITION
     * ===============================================
     *
     * Instead of putting the camera at the player's
     * generic eye position, put it at the actual
     * character's head area.
     */
    const cameraPosition = this.cameraHeadOffset.clone();

    this.character.group.localToWorld(cameraPosition);

    this.renderer.camera.position.copy(cameraPosition);

    /*
     * ===============================================
     * CAMERA ROTATION
     * ===============================================
     *
     * Keep the existing FPS mouse-look system.
     */
    this.renderer.camera.rotation.set(
      this.player.pitch,
      this.player.yaw,
      0,
      "YXZ",
    );
  }
}
