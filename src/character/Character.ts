import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { CharacterModel } from "./CharacterModel";
import { CharacterAnimator } from "./CharacterAnimator";
import { CHARACTER_ASSET_PATH } from "./CharacterConfig";

export type CharacterMovementState =
  | "idle"
  | "walk"
  | "walkBackwards"
  | "strafeLeft"
  | "strafeRight"
  | "jump"
  | "crouch"
  | "crouchWalk"
  | "crouchWalkBackwards"
  | "crouchStrafeLeft"
  | "crouchStrafeRight"
  | "run"
  | "runBackwards"
  | "punch";

export class Character {
  public readonly group: THREE.Group;
  public readonly animator: CharacterAnimator;

  private readonly model: CharacterModel;

  private idleAction: THREE.AnimationAction | null = null;
  private walkAction: THREE.AnimationAction | null = null;
  private walkBackwardsAction: THREE.AnimationAction | null = null;
  private strafeLeftAction: THREE.AnimationAction | null = null;
  private strafeRightAction: THREE.AnimationAction | null = null;
  private jumpAction: THREE.AnimationAction | null = null;
  private crouchAction: THREE.AnimationAction | null = null;
  private crouchWalkAction: THREE.AnimationAction | null = null;
  private crouchWalkBackwardsAction: THREE.AnimationAction | null = null;
  private crouchStrafeLeftAction: THREE.AnimationAction | null = null;
  private crouchStrafeRightAction: THREE.AnimationAction | null = null;
  private runAction: THREE.AnimationAction | null = null;
  private runBackwardsAction: THREE.AnimationAction | null = null;
  private punchAction: THREE.AnimationAction | null = null;
  private punchRequested = false;

  private currentAction: THREE.AnimationAction | null = null;
  private jumpAnimationStarted = false;

  /**
   * Direct Polyfork animation assets.
   */
  private readonly idleAnimationPath = "/assets/animations/idle.glb";

  private readonly walkAnimationPath = "/assets/animations/walk.glb";

  private readonly walkBackwardsAnimationPath =
    "/assets/animations/walk-backwards.glb";

  private readonly strafeLeftAnimationPath =
    "/assets/animations/strafe-left.glb";

  private readonly strafeRightAnimationPath =
    "/assets/animations/strafe-right.glb";

  private readonly jumpAnimationPath = "/assets/animations/jump.glb";

  private readonly crouchAnimationPath = "/assets/animations/crouch.glb";

  private readonly crouchWalkAnimationPath =
    "/assets/animations/crouch-walk.glb";

  private readonly crouchWalkBackwardsAnimationPath =
    "/assets/animations/crouch-walk-backwards.glb";
  private readonly crouchStrafeLeftAnimationPath =
    "/assets/animations/crouch-strafe-left.glb";
  private readonly crouchStrafeRightAnimationPath =
    "/assets/animations/crouch-strafe-right.glb";
  private readonly runAnimationPath = "/assets/animations/run.glb";
  private readonly runBackwardsAnimationPath =
    "/assets/animations/run-backwards.glb";
  private readonly punchAnimationPath = "/assets/animations/punch.glb";

  /**
   * Small cross-fade keeps transitions crisp
   * without making movement feel sluggish.
   */
  private readonly transitionDuration = 0.12;

  /**
   * Slower blend out of the jump so the landing crouch
   * eases back into idle/walk instead of snapping.
   */
  private readonly landingTransitionDuration = 0.25;

  /**
   * Crouch drops/stands up a little slower than a normal switch
   * so the knee bend reads as a motion, not a pop.
   */
  private readonly crouchTransitionDuration = 0.18;

  constructor() {
    this.model = new CharacterModel();

    this.animator = new CharacterAnimator();

    this.group = this.model.group;
  }

  public async load(
    assetPath: string = CHARACTER_ASSET_PATH,
  ): Promise<boolean> {
    const loaded = await this.model.load(assetPath);

    if (!loaded) {
      console.error("Character: failed to load character model.");

      return false;
    }

    this.animator.setModel(this.model.group, this.model.animations);

    this.model.group.visible = true;

    console.log("Character: Polyfork model loaded.");

    console.log(
      "Character: embedded animations:",
      this.model.animations.map((clip) => clip.name),
    );

    await this.loadAnimations();

    return true;
  }

  public get isLoaded(): boolean {
    return this.model.isLoaded;
  }

  /**
   * ============================================================
   * TRANSFORM
   * ============================================================
   */

  public setTransform(position: THREE.Vector3, yaw: number): void {
    this.group.position.copy(position);

    /**
     * Character remains perfectly upright.
     * Only Y rotation is controlled.
     */
    this.group.rotation.set(0, yaw, 0);
  }

  /**
   * ============================================================
   * SCENE
   * ============================================================
   */

  public addToScene(scene: THREE.Scene): void {
    scene.add(this.group);
  }

  public removeFromScene(scene: THREE.Scene): void {
    scene.remove(this.group);
  }

  /**
   * ============================================================
   * UPDATE
   * ============================================================
   */

  public update(
    dt: number,
    movementState: CharacterMovementState = "idle",
  ): void {
    /**
     * Existing CharacterAnimator.
     */
    this.animator.update(dt);

    /**
     * Select animation.
     */
    if (movementState !== "jump") {
      this.jumpAnimationStarted = false;
    }

    switch (movementState) {
      case "walk":
        this.playWalk();
        break;

      case "walkBackwards":
        this.playWalkBackwards();
        break;

      case "strafeLeft":
        this.playStrafeLeft();
        break;

      case "strafeRight":
        this.playStrafeRight();
        break;

      case "jump":
        this.playJump();
        break;

      case "crouch":
        this.playCrouch();
        break;

      case "crouchWalk":
        this.playCrouchWalk();
        break;

      case "crouchWalkBackwards":
        this.playCrouchWalkBackwards();
        break;

      case "crouchStrafeLeft":
        this.playCrouchStrafeLeft();
        break;

      case "crouchStrafeRight":
        this.playCrouchStrafeRight();
        break;

      case "run":
        this.playRun();
        break;

      case "runBackwards":
        this.playRunBackwards();
        break;

      case "punch":
        this.playPunch();
        break;

      case "idle":
      default:
        this.playIdle();
        break;
    }
  }

  /**
   * ============================================================
   * DISPOSE
   * ============================================================
   */

  public dispose(): void {
    this.idleAction = null;
    this.walkAction = null;
    this.walkBackwardsAction = null;
    this.strafeLeftAction = null;
    this.strafeRightAction = null;
    this.jumpAction = null;
    this.crouchAction = null;
    this.crouchWalkAction = null;
    this.crouchWalkBackwardsAction = null;
    this.crouchStrafeLeftAction = null;
    this.crouchStrafeRightAction = null;
    this.runAction = null;
    this.runBackwardsAction = null;
    this.punchAction = null;

    this.currentAction = null;

    this.animator.dispose();

    this.model.dispose();
  }

  /**
   * ============================================================
   * ANIMATION SETUP
   * ============================================================
   */

  private async loadAnimations(): Promise<void> {
    const targetMesh = this.findTargetMesh();

    if (!targetMesh) {
      console.error("Character: Polyf ork SkinnedMesh not found.");

      return;
    }

    console.log("Character: Polyfork target mesh:", targetMesh.name);

    console.log(
      "Character: Polyfork target bones:",
      targetMesh.skeleton.bones.length,
    );

    /**
     * All animation GLBs were authored from
     * the same Polyfork skeleton.
     *
     * Therefore:
     *
     * NO Mixamo retargeting.
     * NO Rokoko retargeting.
     * NO SkeletonUtils.retargetClip().
     */
    console.log(
      "Character: loading direct Polyfork clips through CharacterAnimator.",
    );

    /**
     * --------------------------------------------------------
     * IDLE
     * --------------------------------------------------------
     */

    await this.loadDirectAnimation(this.idleAnimationPath, "Idle", (action) => {
      this.idleAction = action;
    });

    /**
     * --------------------------------------------------------
     * WALK
     * --------------------------------------------------------
     */

    await this.loadDirectAnimation(this.walkAnimationPath, "Walk", (action) => {
      this.walkAction = action;
    });

    /**
     * --------------------------------------------------------
     * WALK BACKWARDS
     * --------------------------------------------------------
     */

    await this.loadDirectAnimation(
      this.walkBackwardsAnimationPath,
      "WalkBackwards",
      (action) => {
        this.walkBackwardsAction = action;
      },
    );

    /**
     * --------------------------------------------------------
     * STRAFE LEFT
     * --------------------------------------------------------
     */

    await this.loadDirectAnimation(
      this.strafeLeftAnimationPath,
      "StrafeLeft",
      (action) => {
        this.strafeLeftAction = action;
      },
    );

    /**
     * --------------------------------------------------------
     * STRAFE RIGHT
     * --------------------------------------------------------
     */

    await this.loadDirectAnimation(
      this.strafeRightAnimationPath,
      "StrafeRight",
      (action) => {
        this.strafeRightAction = action;
      },
    );

    /**
     * --------------------------------------------------------
     * JUMP
     * --------------------------------------------------------
     */

    await this.loadDirectAnimation(this.jumpAnimationPath, "Jump", (action) => {
      this.jumpAction = action;

      /**
       * Jump is a one-shot animation.
       */
      action.setLoop(THREE.LoopOnce, 1);

      action.clampWhenFinished = true;
    });

    /**
     * --------------------------------------------------------
     * CROUCH
     * --------------------------------------------------------
     */

    await this.loadDirectAnimation(
      this.crouchAnimationPath,
      "Crouch",
      (action) => {
        this.crouchAction = action;
      },
    );

    /**
     * --------------------------------------------------------
     * CROUCH WALK
     * --------------------------------------------------------
     */

    await this.loadDirectAnimation(
      this.crouchWalkAnimationPath,
      "CrouchWalk",
      (action) => {
        this.crouchWalkAction = action;
      },
    );

    /**
     * --------------------------------------------------------
     * CROUCH WALK BACKWARDS
     * --------------------------------------------------------
     */

    await this.loadDirectAnimation(
      this.crouchWalkBackwardsAnimationPath,
      "CrouchWalkBackwards",
      (action) => {
        this.crouchWalkBackwardsAction = action;
      },
    );

    await this.loadDirectAnimation(
      this.crouchStrafeLeftAnimationPath,
      "CrouchStrafeLeft",
      (action) => {
        this.crouchStrafeLeftAction = action;
      },
    );

    await this.loadDirectAnimation(
      this.crouchStrafeRightAnimationPath,
      "CrouchStrafeRight",
      (action) => {
        this.crouchStrafeRightAction = action;
      },
    );

    await this.loadDirectAnimation(this.runAnimationPath, "Run", (action) => {
      this.runAction = action;
    });

    await this.loadDirectAnimation(
      this.runBackwardsAnimationPath,
      "RunBackwards",
      (action) => {
        this.runBackwardsAction = action;
      },
    );

    await this.loadDirectAnimation(
      this.punchAnimationPath,
      "Punch",
      (action) => {
        this.punchAction = action;

        // One-shot; holds the final (idle-like) pose until the next state takes over.
        action.setLoop(THREE.LoopOnce, 1);

        action.clampWhenFinished = true;
      },
    );

    /**
     * Start Idle.
     */
    if (this.idleAction) {
      this.idleAction.reset();

      this.idleAction.setLoop(THREE.LoopRepeat, Infinity);

      this.idleAction.clampWhenFinished = false;

      this.idleAction.play();

      this.currentAction = this.idleAction;

      console.log("Character: Idle started.");
    }

    console.log("Character: animation setup complete.");

    console.log("Character: idle loaded:", Boolean(this.idleAction));

    console.log("Character: walk loaded:", Boolean(this.walkAction));

    console.log(
      "Character: walk-backwards loaded:",
      Boolean(this.walkBackwardsAction),
    );

    console.log(
      "Character: strafe-left loaded:",
      Boolean(this.strafeLeftAction),
    );

    console.log(
      "Character: strafe-right loaded:",
      Boolean(this.strafeRightAction),
    );

    console.log("Character: jump loaded:", Boolean(this.jumpAction));

    console.log("Character: crouch loaded:", Boolean(this.crouchAction));

    console.log(
      "Character: crouch-walk loaded:",
      Boolean(this.crouchWalkAction),
    );

    console.log(
      "Character: crouch-walk-backwards loaded:",
      Boolean(this.crouchWalkBackwardsAction),
    );
  }

  /**
   * ============================================================
   * DIRECT GLB ANIMATION LOADER
   * ============================================================
   */

  private async loadDirectAnimation(
    path: string,
    expectedName: string,
    assignAction: (action: THREE.AnimationAction) => void,
  ): Promise<void> {
    const loader = new GLTFLoader();

    console.log(`Character: loading ${expectedName} animation:`, path);

    try {
      const gltf = await loader.loadAsync(path);

      console.log(`Character: ${expectedName} GLB loaded.`);

      console.log(
        `Character: ${expectedName} GLB animations:`,
        gltf.animations.map((clip) => clip.name),
      );

      if (gltf.animations.length === 0) {
        console.error(`Character: ${expectedName} GLB contains no animation.`);

        return;
      }

      /**
       * Prefer the expected animation name.
       * Otherwise use the first animation.
       */
      const clip =
        gltf.animations.find((candidate) => candidate.name === expectedName) ??
        gltf.animations[0];

      console.log(`Character: ${expectedName} clip:`, clip.name);

      console.log(`Character: ${expectedName} duration:`, clip.duration);

      console.log(`Character: ${expectedName} tracks:`, clip.tracks.length);

      for (const track of clip.tracks) {
        console.log(`Character: ${expectedName} track:`, track.name);
      }

      const action = this.animator.createAction(clip);
      if (!action) {
        console.error(
          `Character: cannot create ${expectedName} action; animation mixer missing.`,
        );
        return;
      }

      /**
       * Default movement animations loop.
       */
      action.setLoop(THREE.LoopRepeat, Infinity);

      action.clampWhenFinished = false;

      action.enabled = true;

      action.setEffectiveWeight(1);

      action.reset();

      assignAction(action);

      console.log(`Character: ${expectedName} action created successfully.`);
    } catch (error) {
      console.error(
        `Character: failed to load ${expectedName} animation:`,
        error,
      );
    }
  }

  /**
   * ============================================================
   * FIND POLYFORK MESH
   * ============================================================
   */

  private findTargetMesh(): THREE.SkinnedMesh | null {
    let foundMesh: THREE.SkinnedMesh | null = null;

    this.model.group.traverse((object: THREE.Object3D) => {
      if (foundMesh) {
        return;
      }

      if (object instanceof THREE.SkinnedMesh) {
        foundMesh = object;
      }
    });

    return foundMesh;
  }

  /**
   * ============================================================
   * IDLE
   * ============================================================
   */

  private playIdle(): void {
    if (!this.idleAction) {
      return;
    }

    if (this.currentAction === this.idleAction) {
      return;
    }

    this.idleAction.setLoop(THREE.LoopRepeat, Infinity);

    this.idleAction.clampWhenFinished = false;

    console.log("Character: switching to Idle.");

    this.switchAnimation(this.idleAction);
  }

  /**
   * ============================================================
   * WALK
   * ============================================================
   */

  private playWalk(): void {
    if (!this.walkAction) {
      return;
    }

    if (this.currentAction === this.walkAction) {
      return;
    }

    this.walkAction.setLoop(THREE.LoopRepeat, Infinity);

    this.walkAction.clampWhenFinished = false;

    this.switchAnimation(this.walkAction);
  }

  /**
   * ============================================================
   * WALK BACKWARDS
   * ============================================================
   */

  private playWalkBackwards(): void {
    if (!this.walkBackwardsAction) {
      return;
    }

    if (this.currentAction === this.walkBackwardsAction) {
      return;
    }

    this.walkBackwardsAction.setLoop(THREE.LoopRepeat, Infinity);

    this.walkBackwardsAction.clampWhenFinished = false;

    this.switchAnimation(this.walkBackwardsAction);
  }

  /**
   * ============================================================
   * STRAFE LEFT
   * ============================================================
   */

  private playStrafeLeft(): void {
    if (!this.strafeLeftAction) {
      return;
    }

    if (this.currentAction === this.strafeLeftAction) {
      return;
    }

    this.strafeLeftAction.setLoop(THREE.LoopRepeat, Infinity);

    this.strafeLeftAction.clampWhenFinished = false;

    this.switchAnimation(this.strafeLeftAction);
  }

  /**
   * ============================================================
   * STRAFE RIGHT
   * ============================================================
   */

  private playStrafeRight(): void {
    if (!this.strafeRightAction) {
      return;
    }

    if (this.currentAction === this.strafeRightAction) {
      return;
    }

    this.strafeRightAction.setLoop(THREE.LoopRepeat, Infinity);

    this.strafeRightAction.clampWhenFinished = false;

    this.switchAnimation(this.strafeRightAction);
  }

  /**
   * ============================================================
   * JUMP
   * ============================================================
   */

  private playJump(): void {
    if (!this.jumpAction || this.jumpAnimationStarted) {
      return;
    }

    this.jumpAction.setLoop(THREE.LoopOnce, 1);

    this.jumpAction.clampWhenFinished = true;

    this.jumpAnimationStarted = true;
    this.switchAnimation(this.jumpAction);

    console.log("Character: Jump started.");
  }

  /**
   * ============================================================
   * CROUCH
   * ============================================================
   */

  private playCrouch(): void {
    if (!this.crouchAction) {
      return;
    }

    if (this.currentAction === this.crouchAction) {
      return;
    }

    this.crouchAction.setLoop(THREE.LoopRepeat, Infinity);

    this.crouchAction.clampWhenFinished = false;

    this.switchAnimation(this.crouchAction);
  }

  /**
   * ============================================================
   * CROUCH WALK
   * ============================================================
   */

  private playCrouchWalk(): void {
    if (!this.crouchWalkAction) {
      return;
    }

    if (this.currentAction === this.crouchWalkAction) {
      return;
    }

    this.crouchWalkAction.setLoop(THREE.LoopRepeat, Infinity);

    this.crouchWalkAction.clampWhenFinished = false;

    this.switchAnimation(this.crouchWalkAction);
  }

  /**
   * ============================================================
   * CROUCH WALK BACKWARDS
   * ============================================================
   */

  private playCrouchWalkBackwards(): void {
    if (!this.crouchWalkBackwardsAction) {
      return;
    }

    if (this.currentAction === this.crouchWalkBackwardsAction) {
      return;
    }

    this.crouchWalkBackwardsAction.setLoop(THREE.LoopRepeat, Infinity);

    this.crouchWalkBackwardsAction.clampWhenFinished = false;

    this.switchAnimation(this.crouchWalkBackwardsAction);
  }

  private playCrouchStrafeLeft(): void {
    if (!this.crouchStrafeLeftAction) {
      return;
    }

    if (this.currentAction === this.crouchStrafeLeftAction) {
      return;
    }

    this.crouchStrafeLeftAction.setLoop(THREE.LoopRepeat, Infinity);

    this.crouchStrafeLeftAction.clampWhenFinished = false;

    this.switchAnimation(this.crouchStrafeLeftAction);
  }

  private playCrouchStrafeRight(): void {
    if (!this.crouchStrafeRightAction) {
      return;
    }

    if (this.currentAction === this.crouchStrafeRightAction) {
      return;
    }

    this.crouchStrafeRightAction.setLoop(THREE.LoopRepeat, Infinity);

    this.crouchStrafeRightAction.clampWhenFinished = false;

    this.switchAnimation(this.crouchStrafeRightAction);
  }

  private playRun(): void {
    if (!this.runAction) {
      return;
    }

    if (this.currentAction === this.runAction) {
      return;
    }

    this.runAction.setLoop(THREE.LoopRepeat, Infinity);

    this.runAction.clampWhenFinished = false;

    this.switchAnimation(this.runAction);
  }

  private playRunBackwards(): void {
    if (!this.runBackwardsAction) {
      return;
    }

    if (this.currentAction === this.runBackwardsAction) {
      return;
    }

    this.runBackwardsAction.setLoop(THREE.LoopRepeat, Infinity);

    this.runBackwardsAction.clampWhenFinished = false;

    this.switchAnimation(this.runBackwardsAction);
  }

  public get punchDuration(): number {
    return this.punchAction?.getClip().duration ?? 0;
  }

  /**
   * Queues a punch. The next update in the "punch" state restarts the clip,
   * so back-to-back punches replay it from the start.
   */
  public startPunch(): void {
    this.punchRequested = true;
  }

  private playPunch(): void {
    if (!this.punchAction) {
      return;
    }

    if (this.currentAction !== this.punchAction) {
      this.punchRequested = false;

      this.switchAnimation(this.punchAction);

      return;
    }

    if (this.punchRequested) {
      this.punchRequested = false;

      this.punchAction.reset().play();
    }
  }

  /**
   * ============================================================
   * ANIMATION SWITCH
   * ============================================================
   */

  private getTransitionDuration(nextAction: THREE.AnimationAction): number {
    if (this.currentAction === this.jumpAction) {
      return this.landingTransitionDuration;
    }

    const isCrouchAction = (action: THREE.AnimationAction | null): boolean =>
      action === this.crouchAction ||
      action === this.crouchWalkAction ||
      action === this.crouchWalkBackwardsAction ||
      action === this.crouchStrafeLeftAction ||
      action === this.crouchStrafeRightAction;

    if (isCrouchAction(this.currentAction) || isCrouchAction(nextAction)) {
      return this.crouchTransitionDuration;
    }

    return this.transitionDuration;
  }

  private switchAnimation(nextAction: THREE.AnimationAction): void {
    if (this.currentAction === nextAction) {
      return;
    }

    nextAction.enabled = true;

    nextAction.setEffectiveWeight(1);

    nextAction.reset();

    nextAction.play();

    if (this.currentAction) {
      this.currentAction.crossFadeTo(
        nextAction,
        this.getTransitionDuration(nextAction),
        false,
      );
    }

    this.currentAction = nextAction;
  }
}
