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
  | "punch"
  | "runPunch"
  | "flyLand"
  | "block";

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
  /** Punch playback speed multiplier (higher = snappier). */
  private readonly punchTimeScale = 1.6;
  /** Fraction of the clip's leg / hips rotation kept (lower = feet stay planted). */
  private readonly punchLegMotion = 0.1;
  private readonly punchHipsMotion = 0.6;
  private runPunchAction: THREE.AnimationAction | null = null;
  private runPunchRequested = false;
  /** Upper-body-only punch clips layered over locomotion (legs untouched). */
  private punchUpperRightAction: THREE.AnimationAction | null = null;
  private punchUpperLeftAction: THREE.AnimationAction | null = null;
  private overlayAction: THREE.AnimationAction | null = null;
  private overlayMix = 0;
  /** Upper-body flying punch layered over the jump animation. */
  private flyingPunchAction: THREE.AnimationAction | null = null;
  private flyLandAction: THREE.AnimationAction | null = null;
  private blockAction: THREE.AnimationAction | null = null;
  /** Upper-body block layered over walking/strafing (legs keep their cycle). */
  private blockUpperAction: THREE.AnimationAction | null = null;
  private blockUpperMix = 0;
  private hipsRestInGroup: THREE.Quaternion | null = null;
  private crouchRestBlend = 0;
  private flyingPunchRequested = false;
  private flyingPunchLight = false;
  private flyingPunchLightAction: THREE.AnimationAction | null = null;
  private flyingPunchMix = 0;
  /** Camera pitch the upper body aims at while punching. */
  private aimPitch = 0;
  private aimActive = false;
  private aimAirborne = false;
  /** Punching on the ground: bend the knees when aiming low (crouched targets). */
  private lowPunch = false;
  private lowPunchMix = 0;
  private lastMovementState: CharacterMovementState = "idle";
  private crouchPose: Map<string, THREE.Quaternion> | null = null;
  private crouchHipsPosition: THREE.Vector3 | null = null;
  private readonly aimSavedPositions = new Map<THREE.Object3D, THREE.Vector3>();
  private aimMix = 0;
  private aimAxisLocal: THREE.Vector3 | null = null;
  private headRestInGroup: THREE.Quaternion | null = null;
  private readonly aimSaved = new Map<THREE.Object3D, THREE.Quaternion>();
  private aimBones: Record<string, THREE.Object3D | null> | null = null;
  private punchLeftAction: THREE.AnimationAction | null = null;
  private pendingPunchAction: THREE.AnimationAction | null = null;
  private nextPunchIsLeft = false;

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
  private readonly flyingPunchAnimationPath =
    "/assets/animations/flying-punch.glb";
  private readonly blockAnimationPath = "/assets/animations/block-idle.glb";
  private readonly flyLandAnimationPath =
    "/assets/animations/flying-punch-land.glb";
  private readonly runPunchAnimationPath = "/assets/animations/run-punch.glb";

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
    upperBodyPunch = false,
    flyingPunch = false,
    blockOverlay = false,
  ): void {
    /**
     * Undo last frame's aim first. The mixer only rewrites a bone when its
     * animated value changes, so a static pose (idle, held clips) would
     * otherwise keep our rotation and stack a new one on top every frame.
     */
    this.restoreAimBones();

    /**
     * Existing CharacterAnimator.
     */
    this.animator.update(dt);

    this.lastMovementState = movementState;

    this.stabilizeBlockPose(dt);

    this.applyLowPunchCrouch(dt);

    this.applyPunchAim(dt);

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

      case "runPunch":
        this.playRunPunch();
        break;

      case "flyLand":
        this.playFlyLand();
        break;

      case "block":
        this.playBlock();
        break;

      case "idle":
      default:
        this.playIdle();
        break;
    }

    this.updatePunchOverlay(dt, upperBodyPunch);

    this.updateFlyingPunchOverlay(dt, flyingPunch);

    this.updateBlockOverlay(dt, blockOverlay);
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
    this.runPunchAction = null;
    this.flyingPunchAction = null;
    this.flyingPunchLightAction = null;
    this.flyLandAction = null;
    this.blockAction = null;
    this.blockUpperAction = null;
    this.blockUpperMix = 0;
    this.flyingPunchRequested = false;
    this.flyingPunchMix = 0;
    this.punchUpperRightAction = null;
    this.punchUpperLeftAction = null;
    this.overlayAction = null;
    this.overlayMix = 0;
    this.punchLeftAction = null;
    this.pendingPunchAction = null;
    this.nextPunchIsLeft = false;

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

        // Keep the feet planted: legs stay close to the first-frame stance
        // and the hips twist less, so spamming doesn't look like a treadmill.
        const q0 = new THREE.Quaternion();
        const q = new THREE.Quaternion();
        const out = new THREE.Quaternion();
        for (const track of action.getClip().tracks) {
          if (!track.name.endsWith(".quaternion")) {
            continue;
          }
          const bone = track.name.split(".")[0];
          const keep = /(UpLeg|Leg|Foot|Toe)/.test(bone)
            ? this.punchLegMotion
            : bone === "Hips"
              ? this.punchHipsMotion
              : 1;
          if (keep === 1) {
            continue;
          }
          const v = track.values;
          q0.fromArray(v, 0);
          for (let i = 4; i < v.length; i += 4) {
            q.fromArray(v, i);
            out.slerpQuaternions(q0, q, keep).toArray(v, i);
          }
        }

        // Pin hips X/Y translation (forward Z motion is kept).
        for (const track of action.getClip().tracks) {
          if (track.name.endsWith(".position")) {
            const v = track.values;
            for (let i = 3; i < v.length; i += 3) {
              // X: no lateral drift. Y: no hips dip, since the legs are
              // held near-straight and would sink into the floor.
              v[i] = v[0];
              v[i + 1] = v[1];
            }
          }
        }

        // No dedicated left-hand clip exists, so mirror the right hook.
        const leftAction = this.animator.createAction(
          this.mirrorClip(action.getClip(), "PunchLeft"),
        );
        if (leftAction) {
          leftAction.setLoop(THREE.LoopOnce, 1);
          leftAction.clampWhenFinished = true;
          this.punchLeftAction = leftAction;
        }

        action.timeScale = this.punchTimeScale;
        if (this.punchLeftAction) {
          this.punchLeftAction.timeScale = this.punchTimeScale;
        }

        this.punchUpperRightAction = this.createUpperBodyAction(
          action.getClip(),
          "PunchUpperRight",
        );
        if (this.punchLeftAction) {
          this.punchUpperLeftAction = this.createUpperBodyAction(
            this.punchLeftAction.getClip(),
            "PunchUpperLeft",
          );
        }
      },
    );

    await this.loadDirectAnimation(
      this.runPunchAnimationPath,
      "RunPunch",
      (action) => {
        this.runPunchAction = action;

        // One-shot heavy punch; legs follow one run cycle so it hands back to run.
        action.setLoop(THREE.LoopOnce, 1);

        action.clampWhenFinished = true;
      },
    );

    await this.loadDirectAnimation(
      this.flyingPunchAnimationPath,
      "FlyingPunch",
      (action) => {
        this.flyingPunchAction = action;

        // One-shot; the extended-arm pose is held until landing.
        action.setLoop(THREE.LoopOnce, 1);

        action.clampWhenFinished = true;
      },
    );

    // Light variant (walking jump): torso, neck and head follow less of the
    // lean/twist, and the arm is re-solved for that torso so the fist still
    // lands on the crosshair.
    await this.loadDirectAnimation(
      "/assets/animations/flying-punch-light.glb",
      "FlyingPunch",
      (action) => {
        this.flyingPunchLightAction = action;

        action.setLoop(THREE.LoopOnce, 1);

        action.clampWhenFinished = true;
      },
    );

    await this.loadDirectAnimation(
      this.flyLandAnimationPath,
      "FlyingPunchLand",
      (action) => {
        this.flyLandAction = action;

        // One-shot heavy landing recovery; holds the last (idle) pose.
        action.setLoop(THREE.LoopOnce, 1);

        action.clampWhenFinished = true;
      },
    );

    await this.loadDirectAnimation(
      this.blockAnimationPath,
      "BlockIdle",
      (action) => {
        this.blockAction = action;

        // Upper-body copy (no hips or legs) for blocking while moving.
        const upper =
          /^(Spine|Spine1|Spine2|Neck|Head|LeftShoulder|RightShoulder|LeftArm|RightArm|LeftForeArm|RightForeArm|LeftHand|RightHand)\./;
        const clip = action.getClip();
        this.blockUpperAction = this.animator.createAction(
          new THREE.AnimationClip(
            "BlockUpper",
            clip.duration,
            clip.tracks.filter((track) => upper.test(track.name)),
          ),
        );
        this.blockUpperAction?.setLoop(THREE.LoopRepeat, Infinity);

        // Held for as long as the block button is down.
        action.setLoop(THREE.LoopRepeat, Infinity);

        action.clampWhenFinished = false;
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
    }
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

    try {
      const gltf = await loader.loadAsync(path);

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
    return (this.punchAction?.getClip().duration ?? 0) / this.punchTimeScale;
  }

  /**
   * Queues a punch, alternating right/left hand. The next update in the
   * "punch" state plays it from the start.
   */
  public startPunch(): void {
    const useLeft = this.nextPunchIsLeft && this.punchLeftAction !== null;

    this.pendingPunchAction = useLeft ? this.punchLeftAction : this.punchAction;
    this.nextPunchIsLeft = !this.nextPunchIsLeft;
  }

  public get runPunchDuration(): number {
    return this.runPunchAction?.getClip().duration ?? 0;
  }

  /**
   * Queues the heavy running punch (right hand). The next punch in the combo
   * is a left hook.
   */
  public startRunPunch(): void {
    this.runPunchRequested = true;
    this.nextPunchIsLeft = true;
  }

  private playRunPunch(): void {
    const action = this.runPunchAction;

    if (!action) {
      return;
    }

    if (this.currentAction !== action) {
      this.runPunchRequested = false;

      this.switchAnimation(action);

      return;
    }

    if (this.runPunchRequested) {
      this.runPunchRequested = false;

      action.reset().play();
    }
  }

  /**
   * Call when the punch spam stops so the next punch starts with the right hand.
   */
  public resetPunchCombo(): void {
    this.nextPunchIsLeft = false;
  }

  private playPunch(): void {
    const requested = this.pendingPunchAction;
    this.pendingPunchAction = null;

    const target =
      requested ??
      (this.currentAction === this.punchLeftAction
        ? this.punchLeftAction
        : this.punchAction);

    if (!target) {
      return;
    }

    if (this.currentAction !== target) {
      this.switchAnimation(target);

      return;
    }

    if (requested) {
      target.reset().play();
    }
  }

  /**
   * Upper-body copy of a punch clip (no hips or legs), looped once and held.
   */
  private createUpperBodyAction(
    clip: THREE.AnimationClip,
    name: string,
  ): THREE.AnimationAction | null {
    const upper =
      /^(Spine|Spine1|Spine2|Neck|Head|LeftShoulder|RightShoulder|LeftArm|RightArm|LeftForeArm|RightForeArm|LeftHand|RightHand)\./;
    const tracks = clip.tracks.filter((track) => upper.test(track.name));
    const action = this.animator.createAction(
      new THREE.AnimationClip(name, clip.duration, tracks),
    );

    if (action) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.timeScale = this.punchTimeScale;
    }

    return action;
  }

  /**
   * Layers the upper-body punch over whatever locomotion is playing. The mixer
   * blends actions by weight, so the overlay is weighted so its share of the
   * blend is `overlayMix` (weight = m / (1 - m) against the base weight of 1).
   */
  private updatePunchOverlay(dt: number, active: boolean): void {
    const requested = this.pendingPunchAction;

    if (active && requested) {
      const next =
        requested === this.punchLeftAction
          ? this.punchUpperLeftAction
          : this.punchUpperRightAction;

      this.pendingPunchAction = null;

      if (next) {
        if (this.overlayAction && this.overlayAction !== next) {
          this.overlayAction.stop();
        }

        this.overlayAction = next;
        next.enabled = true;
        next.reset().play();
      }
    }

    if (!this.overlayAction) {
      return;
    }

    const rate = active ? 1 / 0.06 : 1 / 0.15;
    this.overlayMix = THREE.MathUtils.clamp(
      this.overlayMix + (active ? 1 : -1) * rate * dt,
      0,
      1,
    );

    if (!active && this.overlayMix === 0) {
      this.overlayAction.stop();
      this.overlayAction = null;

      return;
    }

    const mix = Math.min(this.overlayMix, 0.999);
    this.overlayAction.setEffectiveWeight(mix / (1 - mix));
  }

  /**
   * Tells the character where the crosshair points (camera pitch, radians,
   * positive = up) and whether a punch is in progress.
   */
  public setAim(
    pitch: number,
    active: boolean,
    airborne: boolean,
    lowPunch = false,
  ): void {
    this.lowPunch = lowPunch;
    this.aimPitch = pitch;
    this.aimActive = active;
    this.aimAirborne = airborne;
  }

  /** Hips orientation (group frame) of the crouch clip's first frame. */
  private getCrouchHipsRest(hips: THREE.Object3D): THREE.Quaternion | null {
    const track = this.crouchAction
      ?.getClip()
      .tracks.find((candidate) => candidate.name === "Hips.quaternion");

    if (!track || !hips.parent) {
      return null;
    }

    this.group.updateMatrixWorld(true);

    return this.group
      .getWorldQuaternion(new THREE.Quaternion())
      .invert()
      .multiply(hips.parent.getWorldQuaternion(new THREE.Quaternion()))
      .multiply(new THREE.Quaternion().fromArray(track.values, 0));
  }

  private saveForRestore(bone: THREE.Object3D): void {
    if (!this.aimSaved.has(bone)) {
      this.aimSaved.set(bone, bone.quaternion.clone());
    }
  }

  /**
   * While blocking on the move, the walk cycle's hip sway/lean/bob would swing
   * the guard (and the fists in view). Counter-rotate the spine by however far
   * the hips have turned from their idle orientation, so the upper body keeps
   * the steady idle-block posture.
   */
  private stabilizeBlockPose(dt: number): void {
    const hips = this.group.getObjectByName("Hips");
    const spine = this.group.getObjectByName("Spine");

    if (!hips || !spine) {
      return;
    }

    // "Idle" hips orientation is sampled from the real idle pose, not the bind
    // pose (the idle stance already turns the hips a few degrees, and a
    // bind-pose reference would shift the guard sideways while moving). It is
    // only refreshed while not guarding, so a transition can't pollute it.
    if (this.currentAction === this.idleAction && this.blockUpperMix <= 0) {
      this.group.updateMatrixWorld(true);

      this.hipsRestInGroup = this.group
        .getWorldQuaternion(new THREE.Quaternion())
        .invert()
        .multiply(hips.getWorldQuaternion(new THREE.Quaternion()));
    }

    // Crouch <-> stand: ease the reference between the two stances over the
    // same time as the animation crossfade, so the guard doesn't jump when the
    // hips drop or rise.
    const crouchTarget = this.lastMovementState.startsWith("crouch") ? 1 : 0;
    const step = dt / 0.25;
    this.crouchRestBlend +=
      Math.sign(crouchTarget - this.crouchRestBlend) *
      Math.min(step, Math.abs(crouchTarget - this.crouchRestBlend));

    const crouchRest = this.getCrouchHipsRest(hips);

    if (!this.hipsRestInGroup || this.blockUpperMix <= 0) {
      return;
    }

    const rest =
      crouchRest && this.crouchRestBlend > 0
        ? this.hipsRestInGroup
            .clone()
            .slerp(
              crouchRest,
              this.crouchRestBlend *
                this.crouchRestBlend *
                (3 - 2 * this.crouchRestBlend),
            )
        : this.hipsRestInGroup;

    this.group.updateMatrixWorld(true);

    const groupQuat = this.group.getWorldQuaternion(new THREE.Quaternion());
    const groupInverse = groupQuat.clone().invert();
    const hipsRel = groupInverse
      .clone()
      .multiply(hips.getWorldQuaternion(new THREE.Quaternion()));

    // How far the hips have turned from the reference, in the character's frame.
    const deviation = hipsRel.multiply(rest.clone().invert());

    const counter = new THREE.Quaternion().slerp(
      deviation.invert(),
      this.blockUpperMix,
    );

    this.saveForRestore(spine);

    const worldCounter = groupQuat
      .clone()
      .multiply(counter)
      .multiply(groupInverse);
    const parentQuat = new THREE.Quaternion();
    const spineWorld = new THREE.Quaternion();

    spine.parent?.getWorldQuaternion(parentQuat);
    spine.getWorldQuaternion(spineWorld);
    spine.quaternion.copy(
      parentQuat.invert().multiply(worldCounter.multiply(spineWorld)),
    );
    spine.updateMatrixWorld(true);
  }

  /**
   * Aiming a punch steeply downward (at a crouched opponent) bends the knees
   * and drops the hips, by blending toward the crouch pose, so the fist can
   * actually reach that low. Stronger when standing than when moving.
   */
  private applyLowPunchCrouch(dt: number): void {
    const clip = this.crouchAction?.getClip();

    if (!clip) {
      return;
    }

    if (!this.crouchPose) {
      this.crouchPose = new Map();

      for (const track of clip.tracks) {
        if (track.name.endsWith(".quaternion")) {
          this.crouchPose.set(
            track.name.split(".")[0],
            new THREE.Quaternion().fromArray(track.values, 0),
          );
        } else if (track.name === "Hips.position") {
          this.crouchHipsPosition = new THREE.Vector3().fromArray(
            track.values,
            0,
          );
        }
      }
    }

    const rate = this.lowPunch ? 1 / 0.12 : 1 / 0.2;
    this.lowPunchMix = THREE.MathUtils.clamp(
      this.lowPunchMix + (this.lowPunch ? 1 : -1) * rate * dt,
      0,
      1,
    );

    // 0 above about -20 degrees, the full crouch stance by about -45 degrees.
    const t = THREE.MathUtils.clamp((-this.aimPitch - 0.35) / 0.45, 0, 1);
    const k =
      this.lowPunchMix *
      t *
      t *
      (3 - 2 * t) *
      (this.lastMovementState === "punch" ||
      this.lastMovementState === "runPunch"
        ? 1
        : 0.85);

    if (k <= 0.001) {
      return;
    }

    for (const name of [
      "LeftUpLeg",
      "LeftLeg",
      "LeftFoot",
      "RightUpLeg",
      "RightLeg",
      "RightFoot",
    ]) {
      const bone = this.group.getObjectByName(name);
      const target = this.crouchPose.get(name);

      if (!bone || !target) {
        continue;
      }

      this.saveForRestore(bone);
      bone.quaternion.slerp(target, k);
    }

    const hips = this.group.getObjectByName("Hips");

    if (hips && this.crouchHipsPosition) {
      if (!this.aimSavedPositions.has(hips)) {
        this.aimSavedPositions.set(hips, hips.position.clone());
      }

      hips.position.lerp(this.crouchHipsPosition, k);
    }

    this.group.updateMatrixWorld(true);
  }

  private restoreAimBones(): void {
    for (const [bone, quaternion] of this.aimSaved) {
      bone.quaternion.copy(quaternion);
    }

    for (const [bone, position] of this.aimSavedPositions) {
      bone.position.copy(position);
    }

    this.aimSavedPositions.clear();

    this.aimSaved.clear();
  }

  /**
   * Pitches the neck and head toward the crosshair at all times, and the whole
   * spine too while punching (arms ride the spine), so punches point where the
   * player looks.
   * Limits keep the body from folding or bending backwards unnaturally.
   */
  private applyPunchAim(dt: number): void {
    const rate = this.aimActive ? 1 / 0.08 : 1 / 0.15;
    this.aimMix = THREE.MathUtils.clamp(
      this.aimMix + (this.aimActive ? 1 : -1) * rate * dt,
      0,
      1,
    );

    // The model loads asynchronously, so keep looking until every bone exists
    // (caching a failed lookup would disable aiming for good).
    if (!this.aimBones) {
      const found: Record<string, THREE.Object3D | null> = {};

      for (const name of [
        "Spine",
        "Spine1",
        "Spine2",
        "Neck",
        "Head",
        "LeftUpLeg",
        "RightUpLeg",
      ]) {
        found[name] = this.group.getObjectByName(name) ?? null;
      }

      if (Object.values(found).some((bone) => !bone)) {
        return;
      }

      this.aimBones = found;
    }

    const bones = this.aimBones;
    const left = bones.LeftUpLeg;
    const right = bones.RightUpLeg;

    if (!left || !right) {
      return;
    }

    const down = this.aimAirborne ? -25 : -70;
    const pitch = THREE.MathUtils.clamp(
      this.aimPitch,
      THREE.MathUtils.degToRad(down),
      THREE.MathUtils.degToRad(70),
    );

    this.group.updateMatrixWorld(true);

    // Character's right axis: rotating about it by +angle raises the forward
    // direction (forward = up x right). Measured once from the legs (while the
    // pose is calm) and kept in the group's frame, so it doesn't wobble with
    // the walk cycle.
    if (!this.aimAxisLocal) {
      const measured = right
        .getWorldPosition(new THREE.Vector3())
        .sub(left.getWorldPosition(new THREE.Vector3()));
      measured.y = 0;
      measured.normalize();

      const groupQuat = this.group.getWorldQuaternion(new THREE.Quaternion());

      // The hips sway/yaw in the idle stance, which would skew the measured
      // axis slightly; the character's right is exactly along its local X.
      const local = measured.applyQuaternion(groupQuat.clone().invert());
      this.aimAxisLocal = new THREE.Vector3(Math.sign(local.x) || 1, 0, 0);

      this.headRestInGroup = groupQuat
        .clone()
        .invert()
        .multiply(bones.Head!.getWorldQuaternion(new THREE.Quaternion()));
    }

    const axis = this.aimAxisLocal
      .clone()
      .applyQuaternion(this.group.getWorldQuaternion(new THREE.Quaternion()));

    const parentQuat = new THREE.Quaternion();
    const worldQuat = new THREE.Quaternion();

    // Neck and head always follow the look direction; the spine (and with it
    // the arms) joins in while punching.
    const m = this.aimMix;
    const weights: Array<[string, number]> = [
      ["Spine", 0.2 * m],
      ["Spine1", 0.25 * m],
      ["Spine2", 0.25 * m],
      ["Neck", 0.25 * (1 - m) + 0.1 * m],
      ["Head", 0.5 * (1 - m) + 0.2 * m],
    ];

    for (const [name, weight] of weights) {
      const bone = bones[name];

      if (!bone || !bone.parent) {
        continue;
      }

      if (weight <= 0) {
        continue;
      }

      this.saveForRestore(bone);

      bone.parent.getWorldQuaternion(parentQuat);
      bone.getWorldQuaternion(worldQuat);

      const delta = new THREE.Quaternion().setFromAxisAngle(
        axis,
        pitch * weight,
      );

      bone.quaternion.copy(
        parentQuat.invert().multiply(delta.multiply(worldQuat)),
      );
      bone.updateMatrixWorld(true);
    }

    // Outside punches the head faces exactly along the crosshair: the idle
    // stance turns the torso a few degrees, and that would otherwise make the
    // raised head look off to one side. Pure pitch on the character's forward.
    const head = bones.Head;

    if (head && head.parent && this.headRestInGroup && m < 1) {
      const groupQuat = this.group.getWorldQuaternion(new THREE.Quaternion());
      const headPitch = pitch * (0.25 + 0.5);

      const target = groupQuat
        .clone()
        .multiply(
          new THREE.Quaternion().setFromAxisAngle(this.aimAxisLocal, headPitch),
        )
        .multiply(this.headRestInGroup);

      const current = head.getWorldQuaternion(new THREE.Quaternion());
      const blended = current.slerp(target, 0.9 * (1 - m));

      head.parent.getWorldQuaternion(parentQuat);
      head.quaternion.copy(parentQuat.invert().multiply(blended));
      head.updateMatrixWorld(true);
    }
  }

  public get flyLandDuration(): number {
    return (
      (this.flyLandAction?.getClip().duration ?? 0) /
      (this.flyLandAction?.timeScale || 1)
    );
  }

  /** Lighter landing (after a walking jump punch) plays faster, so it's shorter. */
  public setFlyLandLight(light: boolean): void {
    if (this.flyLandAction) {
      this.flyLandAction.timeScale = light ? 1.7 : 1;
    }
  }

  /**
   * Layers the upper-body block over the current locomotion (same weighting
   * trick as updatePunchOverlay: weight = m / (1 - m) against a base of 1).
   */
  private updateBlockOverlay(dt: number, active: boolean): void {
    const action = this.blockUpperAction;

    if (!action) {
      return;
    }

    if (active && this.blockUpperMix === 0) {
      action.enabled = true;
      action.reset().play();
    }

    if (!active && this.blockUpperMix === 0) {
      return;
    }

    const rate = active ? 1 / 0.1 : 1 / 0.12;
    this.blockUpperMix = THREE.MathUtils.clamp(
      this.blockUpperMix + (active ? 1 : -1) * rate * dt,
      0,
      1,
    );

    if (!active && this.blockUpperMix === 0) {
      action.stop();

      return;
    }

    const mix = Math.min(this.blockUpperMix, 0.999);
    action.setEffectiveWeight(mix / (1 - mix));
  }

  private playBlock(): void {
    if (!this.blockAction || this.currentAction === this.blockAction) {
      return;
    }

    this.switchAnimation(this.blockAction);
  }

  private playFlyLand(): void {
    if (!this.flyLandAction) {
      return;
    }

    if (this.currentAction !== this.flyLandAction) {
      this.switchAnimation(this.flyLandAction);
    }
  }

  /**
   * Queues the flying punch (right hand). A left hook follows after landing.
   */
  public startFlyingPunch(light = false): void {
    this.flyingPunchLight = light;
    if (this.flyingPunchLightAction) {
      // Walking jump: same punch, a bit quicker with a gentler torso.
      this.flyingPunchLightAction.timeScale = 1.3;
    }
    this.flyingPunchRequested = true;
    this.nextPunchIsLeft = true;
  }

  /**
   * Layers the upper-body flying punch over the jump (same weighting trick as
   * updatePunchOverlay), then fades out once the player lands.
   */
  private updateFlyingPunchOverlay(dt: number, active: boolean): void {
    const action =
      this.flyingPunchLight && this.flyingPunchLightAction
        ? this.flyingPunchLightAction
        : this.flyingPunchAction;

    if (!action) {
      return;
    }

    if (active && this.flyingPunchRequested) {
      // Make sure the other variant isn't left playing.
      for (const other of [
        this.flyingPunchAction,
        this.flyingPunchLightAction,
      ]) {
        if (other && other !== action) {
          other.stop();
        }
      }

      this.flyingPunchRequested = false;
      action.enabled = true;
      action.reset().play();
    }

    if (!active && this.flyingPunchMix === 0) {
      return;
    }

    const rate = active ? 1 / 0.06 : 1 / 0.15;
    this.flyingPunchMix = THREE.MathUtils.clamp(
      this.flyingPunchMix + (active ? 1 : -1) * rate * dt,
      0,
      1,
    );

    if (!active && this.flyingPunchMix === 0) {
      action.stop();

      return;
    }

    const mix = Math.min(this.flyingPunchMix, 0.999);
    action.setEffectiveWeight(mix / (1 - mix));
  }

  /**
   * Mirrors a clip across the character's sagittal plane: swaps Left/Right
   * bone tracks and flips the rotation axes that mirror.
   */
  private mirrorClip(
    clip: THREE.AnimationClip,
    name: string,
  ): THREE.AnimationClip {
    const swapSide = (bone: string): string =>
      bone.replace(/Left|Right/, (side) =>
        side === "Left" ? "Right" : "Left",
      );

    const tracks = clip.tracks.map((track) => {
      const dot = track.name.lastIndexOf(".");
      const bone = track.name.slice(0, dot);
      const property = track.name.slice(dot);
      const values = Array.from(track.values);
      // Legs stay as authored: swapping/mirroring them would flip the planted
      // stance on every alternate punch, which reads as stepping.
      const isLeg = /(UpLeg|Leg|Foot|Toe)/.test(bone);

      if (!isLeg && property === ".quaternion") {
        for (let i = 0; i < values.length; i += 4) {
          values[i + 1] = -values[i + 1];
          values[i + 2] = -values[i + 2];
        }
      }
      // Positions are copied as-is: negating X would shift the hips off
      // their rest offset (X is already pinned constant in the source clip).

      return new (
        track.constructor as new (
          name: string,
          times: ArrayLike<number>,
          values: ArrayLike<number>,
        ) => THREE.KeyframeTrack
      )(
        (isLeg ? bone : swapSide(bone)) + property,
        Array.from(track.times),
        values,
      );
    });

    return new THREE.AnimationClip(name, clip.duration, tracks);
  }

  /**
   * ============================================================
   * ANIMATION SWITCH
   * ============================================================
   */

  private getTransitionDuration(nextAction: THREE.AnimationAction): number {
    // The landing impact should hit immediately.
    if (nextAction === this.flyLandAction) {
      return 0.08;
    }

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
