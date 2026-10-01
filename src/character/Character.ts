import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { CharacterModel } from "./CharacterModel";
import { CharacterAnimator } from "./CharacterAnimator";
import { CHARACTER_ASSET_PATH } from "./CharacterConfig";

export class Character {
  public readonly group: THREE.Group;
  public readonly animator: CharacterAnimator;

  private readonly model: CharacterModel;

  /**
   * Separate native Polyfork idle animation.
   *
   * This GLB contains:
   *
   *     Idle
   *
   * It does NOT contain CombatIdle.
   */
  private readonly idleAnimationPath = "/assets/animations/idle.glb";

  private idleMixer: THREE.AnimationMixer | null = null;

  private idleAction: THREE.AnimationAction | null = null;

  private modelHeight = 0;

  private modelGroundOffset = 0;

  constructor() {
    this.model = new CharacterModel();

    this.animator = new CharacterAnimator();

    this.group = this.model.group;

    this.group.name = "PlayerCharacter";
  }

  /**
   * ========================================================
   * LOAD
   * ========================================================
   */
  public async load(
    assetPath: string = CHARACTER_ASSET_PATH,
  ): Promise<boolean> {
    /**
     * Load the actual Polyfork character.
     */
    const loaded = await this.model.load(assetPath);

    if (!loaded) {
      console.error("Character: failed to load player model.");

      return false;
    }

    /**
     * The complete character stays visible.
     */
    this.model.group.visible = true;

    /**
     * Keep CharacterAnimator connected to the
     * embedded animations, if any.
     *
     * player.glb currently has no embedded animation,
     * which is fine.
     */
    this.animator.setModel(this.model.group, this.model.animations);

    console.log("Character: Polyfork model loaded.");

    console.log(
      "Character: embedded animations:",
      this.model.animations.map((clip) => clip.name),
    );

    /**
     * Make sure the character feet sit exactly
     * on the character root.
     */
    this.normalizeGroundPosition();

    /**
     * Load the clean native idle animation.
     */
    await this.loadIdleAnimation();

    /**
     * Print final model information.
     */
    this.debugModelBounds();

    return true;
  }

  /**
   * ========================================================
   * LOADED STATE
   * ========================================================
   */
  public get isLoaded(): boolean {
    return this.model.isLoaded;
  }

  /**
   * ========================================================
   * MODEL HEIGHT
   * ========================================================
   */
  public get height(): number {
    return this.modelHeight;
  }

  /**
   * ========================================================
   * GROUND OFFSET
   * ========================================================
   */
  public get groundOffset(): number {
    return this.modelGroundOffset;
  }

  /**
   * ========================================================
   * TRANSFORM
   * ========================================================
   */
  public setTransform(position: THREE.Vector3, yaw: number): void {
    /**
     * Root is the character's feet.
     */
    this.group.position.copy(position);

    /**
     * VERY IMPORTANT:
     *
     * No X rotation.
     * No Z rotation.
     *
     * The character must remain upright.
     */
    this.group.rotation.set(0, yaw, 0);
  }

  /**
   * ========================================================
   * SCENE
   * ========================================================
   */
  public addToScene(scene: THREE.Scene): void {
    scene.add(this.group);
  }

  public removeFromScene(scene: THREE.Scene): void {
    scene.remove(this.group);
  }

  /**
   * ========================================================
   * UPDATE
   * ========================================================
   */
  public update(dt: number, _isMoving: boolean = false): void {
    /**
     * Embedded animation system.
     *
     * Currently player.glb has no embedded animation,
     * but keeping this here makes the class compatible
     * with the existing CharacterAnimator.
     */
    this.animator.update(dt);

    /**
     * Native Polyfork idle animation.
     */
    if (this.idleMixer) {
      this.idleMixer.update(dt);
    }
  }

  /**
   * ========================================================
   * DISPOSE
   * ========================================================
   */
  public dispose(): void {
    if (this.idleMixer) {
      this.idleMixer.stopAllAction();

      this.idleMixer = null;
    }

    this.idleAction = null;

    this.animator.dispose();

    this.model.dispose();
  }

  /**
   * ========================================================
   * GROUND NORMALIZATION
   * ========================================================
   *
   * Ensures:
   *
   *     character feet = root
   *
   * so the player does not float.
   */
  private normalizeGroundPosition(): void {
    this.model.group.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(this.model.group);

    if (!Number.isFinite(bounds.min.y)) {
      console.warn("Character: unable to calculate model ground position.");

      return;
    }

    /**
     * Move model so its lowest point is at Y = 0.
     */
    this.modelGroundOffset = -bounds.min.y;

    this.model.group.position.y += this.modelGroundOffset;

    /**
     * Recalculate bounds.
     */
    this.model.group.updateMatrixWorld(true);

    const correctedBounds = new THREE.Box3().setFromObject(this.model.group);

    this.modelHeight = correctedBounds.max.y - correctedBounds.min.y;

    console.log("Character: ground normalization:", {
      originalMinY: bounds.min.y,

      appliedOffset: this.modelGroundOffset,

      correctedMinY: correctedBounds.min.y,

      height: this.modelHeight,
    });
  }

  /**
   * ========================================================
   * LOAD IDLE ANIMATION
   * ========================================================
   */
  private async loadIdleAnimation(): Promise<void> {
    const loader = new GLTFLoader();

    try {
      console.log("Character: loading native idle:", this.idleAnimationPath);

      const gltf = await loader.loadAsync(this.idleAnimationPath);

      console.log(
        "Character: idle animations:",
        gltf.animations.map((clip) => ({
          name: clip.name,

          duration: clip.duration,

          tracks: clip.tracks.length,
        })),
      );

      if (gltf.animations.length === 0) {
        console.error("Character: idle.glb contains no animations.");

        return;
      }

      /**
       * Find the Idle clip.
       */
      const idleClip = gltf.animations.find((clip) => clip.name === "Idle");

      if (!idleClip) {
        console.error(
          "Character: Idle animation not found.",
          gltf.animations.map((clip) => clip.name),
        );

        return;
      }

      console.log("Character: Idle clip found.", {
        duration: idleClip.duration,

        tracks: idleClip.tracks.length,
      });

      /**
       * ====================================================
       * FIND POLYFORK SKELETAL MESH
       * ====================================================
       */
      let targetMesh: THREE.SkinnedMesh | undefined;

      this.model.group.traverse((object) => {
        if (object instanceof THREE.SkinnedMesh && !targetMesh) {
          targetMesh = object;
        }
      });

      if (!targetMesh) {
        console.error("Character: Polyfork SkinnedMesh not found.");

        return;
      }

      const polyforkMesh = targetMesh;

      console.log("Character: Polyfork target mesh:", polyforkMesh.name);

      console.log(
        "Character: Polyfork skeleton bones:",
        polyforkMesh.skeleton.bones.map((bone) => bone.name),
      );

      /**
       * ====================================================
       * CREATE MIXER
       * ====================================================
       *
       * IMPORTANT:
       *
       * The mixer is attached directly to the
       * SkinnedMesh because the animation tracks
       * target the skeleton's bones.
       */
      this.idleMixer = new THREE.AnimationMixer(polyforkMesh);

      /**
       * Create Idle action.
       */
      this.idleAction = this.idleMixer.clipAction(idleClip);

      /**
       * Loop forever.
       */
      this.idleAction.setLoop(THREE.LoopRepeat, Infinity);

      this.idleAction.clampWhenFinished = false;

      /**
       * Start from beginning.
       */
      this.idleAction.reset();

      /**
       * Play.
       */
      this.idleAction.play();

      console.log("Character: Idle animation PLAYING.");
    } catch (error) {
      console.error("Character: failed to load idle.glb:", error);
    }
  }

  /**
   * ========================================================
   * DEBUG MODEL BOUNDS
   * ========================================================
   */
  private debugModelBounds(): void {
    this.group.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(this.group);

    const size = new THREE.Vector3();

    bounds.getSize(size);

    console.log("========== CHARACTER BOUNDS ==========");

    console.log("SIZE:", size.toArray());

    console.log("MIN:", bounds.min.toArray());

    console.log("MAX:", bounds.max.toArray());

    console.log("HEIGHT:", this.modelHeight);

    console.log("GROUND OFFSET:", this.modelGroundOffset);

    console.log("======================================");
  }
}
