import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { CharacterModel } from "./CharacterModel";
import { CharacterAnimator } from "./CharacterAnimator";
import { limitArmReach, type ClearFraction } from "./ArmReach";
import { CHARACTER_ASSET_PATH } from "./CharacterConfig";
import { ClimbRig } from "./ClimbPose";
import { VaultRig, type VaultShape } from "./VaultPose";
import { RockArm } from "./RockArm";
import type { HeldKind, RockPose } from "../inventory/RockStance";

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

/** How far (degrees) up or down the body tilts toward the crosshair while punching. */
const PUNCH_AIM_LIMIT_DEGREES = 40;

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
  /**
   * The body is turned this many radians (positive = left) away from the look
   * direction, e.g. 45 degrees while running diagonally. The head (and, while
   * aiming, the spine) turns back so the character still looks at the crosshair.
   */
  private bodyYawOffset = 0;
  private upperBodyFollowsLook = false;
  /** 0..1: how much of the extra crouch depth is applied (eases with the stance). */
  private deepCrouchMix = 0;
  /** How much lower than the authored crouch the hips sit, in metres. */
  private readonly extraCrouchDepth = 0.16;
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
  private readonly pitchQuat = new THREE.Quaternion();
  private lastPunchLeft = false;
  private reachHand: "left" | "right" = "right";
  private reachAmount = 0;
  /** Short recoil layered on the upper body when this character is hit. */
  private readonly hitRecoil = { strength: 0, time: 0, duration: 0.4 };
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

    this.neverCullBody();

    this.animator.setModel(this.model.group, this.model.animations);

    this.model.group.visible = true;

    await this.loadAnimations();

    return true;
  }

  /**
   * A skinned mesh is culled by a bounding sphere measured in its rest pose. In
   * first person the camera sits ahead of the torso, so the shirt's sphere ends
   * up behind it and the whole shirt is skipped, sleeves included, while the
   * punching arm (part of the larger body mesh) still draws, bare. The
   * character is always close to the camera, so never cull it.
   */
  private neverCullBody(): void {
    this.model.group.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) {
        object.frustumCulled = false;
      }
    });
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

    this.applyDeeperCrouch(dt);

    this.stabilizeBlockPose(dt);

    this.applyLowPunchCrouch(dt);

    this.applyPunchAim(dt);

    this.applyHitRecoil(dt);

    this.applyPunchReach();

    this.applyRockPose();

    this.applyClimbPose(dt);

    this.applyVaultPose(dt);

    this.limitArmsToWorld();

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
    this.rockArmInstance?.dispose();
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
  /** True if the most recent combo punch was thrown with the left hand. */
  public get lastPunchWasLeft(): boolean {
    return this.lastPunchLeft;
  }

  public startPunch(): void {
    const useLeft = this.nextPunchIsLeft && this.punchLeftAction !== null;

    this.lastPunchLeft = useLeft;

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

  public setBodyYawOffset(offset: number, upperBodyFollowsLook: boolean): void {
    this.bodyYawOffset = offset;
    this.upperBodyFollowsLook = upperBodyFollowsLook;
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

  /**
   * Sinks the hips a further `extraCrouchDepth` below the authored crouch and
   * re-solves both legs (two-bone IK) so the feet stay exactly where the
   * animation put them: a deeper squat without any foot sliding.
   */
  private applyDeeperCrouch(dt: number): void {
    const target = this.lastMovementState.startsWith("crouch") ? 1 : 0;
    const step = dt / 0.2;

    this.deepCrouchMix +=
      Math.sign(target - this.deepCrouchMix) *
      Math.min(step, Math.abs(target - this.deepCrouchMix));

    if (this.deepCrouchMix <= 0.001) {
      return;
    }

    const hips = this.group.getObjectByName("Hips");

    if (!hips) {
      return;
    }

    const legs = (["Left", "Right"] as const).map((side) => ({
      upper: this.group.getObjectByName(`${side}UpLeg`),
      knee: this.group.getObjectByName(`${side}Leg`),
      foot: this.group.getObjectByName(`${side}Foot`),
    }));

    if (legs.some((leg) => !leg.upper || !leg.knee || !leg.foot)) {
      return;
    }

    this.group.updateMatrixWorld(true);

    // Where the animation wants the feet (position and orientation).
    const footTargets = legs.map((leg) => ({
      position: leg.foot!.getWorldPosition(new THREE.Vector3()),
      quaternion: leg.foot!.getWorldQuaternion(new THREE.Quaternion()),
      kneePosition: leg.knee!.getWorldPosition(new THREE.Vector3()),
    }));

    if (!this.aimSavedPositions.has(hips)) {
      this.aimSavedPositions.set(hips, hips.position.clone());
    }

    hips.position.y -= this.extraCrouchDepth * this.deepCrouchMix;
    hips.updateMatrixWorld(true);

    const parentQuat = new THREE.Quaternion();
    const worldQuat = new THREE.Quaternion();

    const rotateTo = (bone: THREE.Object3D, delta: THREE.Quaternion): void => {
      this.saveForRestore(bone);

      bone.parent?.getWorldQuaternion(parentQuat);
      bone.getWorldQuaternion(worldQuat);
      bone.quaternion.copy(
        parentQuat.invert().multiply(delta.clone().multiply(worldQuat)),
      );
      bone.updateMatrixWorld(true);
    };

    legs.forEach((leg, index) => {
      const upper = leg.upper!;
      const knee = leg.knee!;
      const foot = leg.foot!;
      const goal = footTargets[index];

      const hip = upper.getWorldPosition(new THREE.Vector3());
      const kneePos = knee.getWorldPosition(new THREE.Vector3());
      const anklePos = foot.getWorldPosition(new THREE.Vector3());

      const thigh = kneePos.distanceTo(hip);
      const shin = anklePos.distanceTo(kneePos);

      const toFoot = goal.position.clone().sub(hip);
      const distance = THREE.MathUtils.clamp(
        toFoot.length(),
        Math.abs(thigh - shin) + 0.01,
        thigh + shin - 0.005,
      );

      toFoot.normalize();

      // The knee keeps bending the way the animation bent it.
      const bend = goal.kneePosition.clone().sub(hip);

      bend.addScaledVector(toFoot, -bend.dot(toFoot));

      if (bend.lengthSq() < 1e-6) {
        bend
          .set(0, 0, 1)
          .applyQuaternion(
            this.group.getWorldQuaternion(new THREE.Quaternion()),
          );
        bend.addScaledVector(toFoot, -bend.dot(toFoot));
      }

      bend.normalize();

      const along =
        (thigh * thigh - shin * shin + distance * distance) / (2 * distance);
      const height = Math.sqrt(Math.max(0, thigh * thigh - along * along));

      const newKnee = hip
        .clone()
        .addScaledVector(toFoot, along)
        .addScaledVector(bend, height);
      const newAnkle = hip.clone().addScaledVector(toFoot, distance);

      rotateTo(
        upper,
        new THREE.Quaternion().setFromUnitVectors(
          kneePos.clone().sub(hip).normalize(),
          newKnee.clone().sub(hip).normalize(),
        ),
      );

      const kneeNow = knee.getWorldPosition(new THREE.Vector3());
      const ankleNow = foot.getWorldPosition(new THREE.Vector3());

      rotateTo(
        knee,
        new THREE.Quaternion().setFromUnitVectors(
          ankleNow.clone().sub(kneeNow).normalize(),
          newAnkle.clone().sub(newKnee).normalize(),
        ),
      );

      // Keep the foot flat the way the animation had it.
      const footNow = foot.getWorldQuaternion(new THREE.Quaternion());

      rotateTo(foot, goal.quaternion.clone().multiply(footNow.invert()));
    });
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

    // The body only tilts a level up or down toward the crosshair (40 degrees):
    // beyond that the camera, which sits at the head, would end up inside the
    // chest and arms, and a punch never needs the hand raised or dropped that far.
    const down = this.aimAirborne ? -25 : -PUNCH_AIM_LIMIT_DEGREES;
    const pitch = THREE.MathUtils.clamp(
      this.aimPitch,
      THREE.MathUtils.degToRad(down),
      THREE.MathUtils.degToRad(PUNCH_AIM_LIMIT_DEGREES),
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

    const up = new THREE.Vector3(0, 1, 0);
    const axis = this.aimAxisLocal
      .clone()
      .applyQuaternion(this.group.getWorldQuaternion(new THREE.Quaternion()))
      .applyAxisAngle(up, -this.bodyYawOffset);

    const parentQuat = new THREE.Quaternion();
    const worldQuat = new THREE.Quaternion();

    // Neck and head always follow the look direction; the spine (and with it
    // the arms) joins in while punching.
    const m = this.aimMix;

    // Running diagonally turns the body toward the direction of travel. Turn
    // the upper body (and neck) back toward the crosshair: a little in third
    // person, completely while aiming/punching, and completely in first person
    // so the arms stay in front of the camera.
    if (Math.abs(this.bodyYawOffset) > 1e-3) {
      // On a ladder the torso stays facing it: only the neck and head turn.
      const spineShare = this.climbing
        ? 0
        : this.upperBodyFollowsLook
          ? 1
          : 0.45 + 0.55 * m;

      const counter: Array<[string, number]> = [
        ["Spine", 0.3 * spineShare],
        ["Spine1", 0.35 * spineShare],
        ["Spine2", 0.35 * spineShare],
        ["Neck", 0.4 * (1 - spineShare)],
        ["Head", this.climbing ? 0.6 : 0],
      ];

      for (const [name, share] of counter) {
        const bone = bones[name];

        if (!bone || !bone.parent || share <= 0) {
          continue;
        }

        this.saveForRestore(bone);

        bone.parent.getWorldQuaternion(parentQuat);
        bone.getWorldQuaternion(worldQuat);

        bone.quaternion.copy(
          parentQuat
            .invert()
            .multiply(
              new THREE.Quaternion()
                .setFromAxisAngle(up, -this.bodyYawOffset * share)
                .multiply(worldQuat),
            ),
        );
        bone.updateMatrixWorld(true);
      }
    }
    const weights: Array<[string, number]> = [
      ["Spine", 0.35 * m],
      ["Spine1", 0.4 * m],
      ["Spine2", 0.4 * m],
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
        // Face the crosshair, not the direction the body is running.
        .multiply(
          new THREE.Quaternion().setFromAxisAngle(up, -this.bodyYawOffset),
        )
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
   * How far the striking arm is straightened (0 = animation as authored,
   * 1 = fully extended). Driven by the attack's timing so the arm reaches out
   * as the hitbox becomes active.
   */
  /**
   * Optional world check used to keep the arms out of walls: given a line, how
   * much of it is free of scenery (1 = all). Set by Game.ts from the arena.
   */
  public armProbe: ClearFraction | null = null;

  /**
   * After every other arm adjustment: if an arm (or a punch) would end up
   * inside cover or a wall, shorten it so the fist stops at the surface.
   */
  private limitArmsToWorld(): void {
    if (!this.armProbe) {
      return;
    }

    const probe = this.armProbe;

    for (const side of ["Left", "Right"]) {
      const upper = this.group.getObjectByName(side + "Arm");
      const fore = this.group.getObjectByName(side + "ForeArm");
      const hand = this.group.getObjectByName(side + "Hand");

      if (!upper || !fore || !hand) {
        continue;
      }

      this.group.updateMatrixWorld(true);

      const shoulder = upper.getWorldPosition(new THREE.Vector3());
      const elbow = fore.getWorldPosition(new THREE.Vector3());
      const wrist = hand.getWorldPosition(new THREE.Vector3());
      const pose = limitArmReach(shoulder, elbow, wrist, probe);

      if (!pose) {
        continue;
      }

      // Swing the upper arm to the new elbow, then the forearm to the new wrist.
      this.rotateBoneBetween(
        upper,
        elbow.sub(shoulder),
        pose.elbow.clone().sub(shoulder),
      );

      this.group.updateMatrixWorld(true);

      const elbowNow = fore.getWorldPosition(new THREE.Vector3());
      const wristNow = hand.getWorldPosition(new THREE.Vector3());

      this.rotateBoneBetween(
        fore,
        wristNow.sub(elbowNow),
        pose.wrist.clone().sub(pose.elbow),
      );
      this.group.updateMatrixWorld(true);
    }
  }

  /** Rotates a bone (in world space) so direction `from` becomes direction `to`. */
  private rotateBoneBetween(
    bone: THREE.Object3D,
    from: THREE.Vector3,
    to: THREE.Vector3,
  ): void {
    if (from.lengthSq() < 1e-8 || to.lengthSq() < 1e-8) {
      return;
    }

    const delta = new THREE.Quaternion().setFromUnitVectors(
      from.normalize(),
      to.normalize(),
    );
    const parentQuat = new THREE.Quaternion();
    const worldQuat = new THREE.Quaternion();

    this.saveForRestore(bone);

    bone.parent?.getWorldQuaternion(parentQuat);
    bone.getWorldQuaternion(worldQuat);
    bone.quaternion.copy(
      parentQuat.invert().multiply(delta.multiply(worldQuat)),
    );
    bone.updateMatrixWorld(true);
  }

  /** Camera position in first person, so punches are aimed from the real eye. */
  public aimEye: THREE.Vector3 | null = null;

  // ------------------------------------------------------------
  // Rock in hand (the right hand's pocket / ready / aim / throw pose)
  // ------------------------------------------------------------

  private rockArmInstance: RockArm | null = null;

  private get rockArm(): RockArm {
    this.rockArmInstance ??= new RockArm(this.group, (bone, from, to) =>
      this.rotateBoneBetween(bone, from, to),
    );

    return this.rockArmInstance;
  }
  private rockPose: RockPose | null = null;
  private readonly rockForward = new THREE.Vector3();
  private readonly rockAim = new THREE.Vector3();

  /**
   * Sets the rock pose for this frame (null = none) and whether a rock is
   * shown in the hand. Works for any character, so other players can show the
   * same pose from what they report.
   */
  public setRock(
    pose: RockPose | null,
    held: HeldKind | null,
    lit = false,
    lighting = false,
  ): void {
    this.rockPose = pose;
    this.rockArm.setHeld(held, lit, lighting);
  }

  /** Where a thrown rock leaves the hand. False if the model is not ready. */
  public getRockReleasePoint(out: THREE.Vector3): boolean {
    return this.rockArm.getReleasePoint(out);
  }

  // ------------------------------------------------------------
  // Climbing a ladder (hands on the rails, feet on the rungs)
  // ------------------------------------------------------------

  private climbRigInstance: ClimbRig | null = null;
  private climbing = false;
  private climbMix = 0;
  private climbed = 0;
  private climbReach = { topHand: Infinity, bottomFoot: -Infinity };
  private readonly climbForward = new THREE.Vector3();

  /**
   * Whether the character is on a ladder, and how high it has climbed (the
   * pose follows the height, so it stops with the climber and runs backward
   * going down). Other players can show it from what they report.
   */
  public setClimb(
    active: boolean,
    climbedHeight: number,
    reach: { topHand: number; bottomFoot: number } = {
      topHand: Infinity,
      bottomFoot: -Infinity,
    },
  ): void {
    this.climbReach = reach;
    this.climbing = active;
    this.climbed = climbedHeight;
  }

  // ------------------------------------------------------------
  // Vaulting over a railing or a box
  // ------------------------------------------------------------

  private vaultRigInstance: VaultRig | null = null;
  private vaultShape: VaultShape | null = null;
  private vaultMix = 0;
  private readonly vaultForward = new THREE.Vector3();

  /** Whether the character is vaulting, and how far through it is (null when not). */
  public setVault(shape: VaultShape | null): void {
    this.vaultShape = shape;
  }

  private applyVaultPose(dt: number): void {
    const target = this.vaultShape ? 1 : 0;

    this.vaultMix +=
      Math.sign(target - this.vaultMix) *
      Math.min(dt / 0.08, Math.abs(target - this.vaultMix));

    if (this.vaultMix < 0.002 || !this.vaultShape) {
      return;
    }

    this.vaultRigInstance ??= new VaultRig(this.group, (bone, from, to) =>
      this.rotateBoneBetween(bone, from, to),
    );

    this.group.getWorldQuaternion(this.pitchQuat);
    this.vaultForward.set(0, 0, 1).applyQuaternion(this.pitchQuat);
    this.vaultForward.y = 0;
    this.vaultForward.normalize();

    this.vaultRigInstance.applyVault(
      this.vaultMix,
      this.vaultForward,
      this.vaultShape,
    );
  }

  private armsFade = 1;

  private scaleArms(scale: number): void {
    for (const name of ["LeftArm", "RightArm"]) {
      this.group.getObjectByName(name)?.scale.setScalar(scale);
    }
  }

  private applyClimbPose(dt: number): void {
    const target = this.climbing ? 1 : 0;
    const step = dt / 0.15;

    this.climbMix +=
      Math.sign(target - this.climbMix) *
      Math.min(step, Math.abs(target - this.climbMix));

    // Full-size arms for the solve below; they shrink again at the end.
    if (this.armsFade < 1) {
      this.scaleArms(1);
      this.armsFade = 1;
    }

    if (this.climbMix < 0.002) {
      return;
    }

    this.climbRigInstance ??= new ClimbRig(this.group, (bone, from, to) =>
      this.rotateBoneBetween(bone, from, to),
    );

    // The way the body faces (flat), toward the ladder.
    this.group.getWorldQuaternion(this.pitchQuat);
    // The body faces the ladder whatever way the head is turned.
    this.climbForward.set(0, 0, 1).applyQuaternion(this.pitchQuat);
    this.climbForward.y = 0;
    this.climbForward.normalize();

    this.climbRigInstance.apply(
      this.climbMix,
      this.climbForward,
      this.climbed,
      this.climbReach,
    );

    // In first person the camera sits among the shoulders, so with the head
    // turned on a ladder it would look through the arms from inside. They
    // shrink away as the head turns (the hands are out of view by then).
    if (this.upperBodyFollowsLook) {
      const wanted = THREE.MathUtils.clamp(
        1 - (Math.abs(this.bodyYawOffset) - 0.3) / 0.35,
        0,
        1,
      );

      if (wanted < 1) {
        this.armsFade = wanted;
        this.scaleArms(Math.max(wanted, 0.001));
      }
    }
  }

  private applyRockPose(): void {
    if (!this.rockPose || this.rockPose.weight < 0.002) {
      return;
    }

    // The way the player looks (flat), and the crosshair direction.
    this.group.getWorldQuaternion(this.pitchQuat);
    this.rockForward
      .set(0, 0, 1)
      .applyQuaternion(this.pitchQuat)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.bodyYawOffset);
    this.rockForward.y = 0;
    this.rockForward.normalize();

    const pitch = THREE.MathUtils.clamp(this.aimPitch, -1.2, 1.2);

    this.rockAim
      .copy(this.rockForward)
      .multiplyScalar(Math.cos(pitch))
      .add(new THREE.Vector3(0, Math.sin(pitch), 0));

    this.rockArm.firstPerson = this.upperBodyFollowsLook;
    this.swingBodyForThrow(this.rockPose, this.rockForward);

    this.rockArm.apply(this.rockPose, this.rockForward, this.rockAim);
  }

  /**
   * Puts the body into the throw: the torso turns back toward the throwing
   * side while loading, then whips through and leans into the release. The
   * head turns back the same amount, so the view (and the crosshair) stays put.
   */
  private swingBodyForThrow(pose: RockPose, forward: THREE.Vector3): void {
    const weight = pose.weight;
    // + = turn left (the side of the free arm), - = turn right (toward the throwing arm).
    const twist =
      weight * (pose.aim * -0.4 + pose.windup * -1.0 + pose.release * 0.9);
    // + = lean back, - = lean forward.
    const lean =
      weight * (pose.aim * 0.05 + pose.windup * 0.22 - pose.release * 0.42);

    if (Math.abs(twist) < 1e-3 && Math.abs(lean) < 1e-3) {
      return;
    }

    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(forward, up).normalize();
    const spine = ["Spine", "Spine1", "Spine2"].map((name) =>
      this.group.getObjectByName(name),
    );
    const head = this.group.getObjectByName("Head");

    if (spine.some((bone) => !bone) || !head) {
      return;
    }

    for (const bone of spine) {
      this.rotateAboutWorldAxis(bone as THREE.Object3D, up, twist / 3);
      this.rotateAboutWorldAxis(bone as THREE.Object3D, right, lean / 3);
    }

    // Keep looking where the player looks.
    this.rotateAboutWorldAxis(head, right, -lean);
    this.rotateAboutWorldAxis(head, up, -twist);
  }

  /** Rotates a bone by `angle` about a world-space axis (undone next frame). */
  private rotateAboutWorldAxis(
    bone: THREE.Object3D,
    axis: THREE.Vector3,
    angle: number,
  ): void {
    const delta = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    const parentQuat = new THREE.Quaternion();
    const worldQuat = new THREE.Quaternion();

    this.saveForRestore(bone);
    bone.updateWorldMatrix(true, false);
    bone.parent?.getWorldQuaternion(parentQuat);
    bone.getWorldQuaternion(worldQuat);
    bone.quaternion.copy(
      parentQuat.invert().multiply(delta.multiply(worldQuat)),
    );
    bone.updateMatrixWorld(true);
  }

  public setPunchReach(hand: "left" | "right", amount: number): void {
    this.reachHand = hand;
    this.reachAmount = amount;
  }

  private applyPunchReach(): void {
    if (this.reachAmount <= 0.001) {
      return;
    }

    const side = this.reachHand === "left" ? "Left" : "Right";
    const upper = this.group.getObjectByName(side + "Arm");
    const fore = this.group.getObjectByName(side + "ForeArm");
    const hand = this.group.getObjectByName(side + "Hand");

    if (!upper || !fore || !hand) {
      return;
    }

    // Turn first, so the arm is straightened from its final position.
    this.turnTowardCrosshair(side === "Right" ? 1 : -1);

    this.group.updateMatrixWorld(true);

    const upperPos = upper.getWorldPosition(new THREE.Vector3());
    const forePos = fore.getWorldPosition(new THREE.Vector3());
    const handPos = hand.getWorldPosition(new THREE.Vector3());

    const upperDir = forePos.clone().sub(upperPos).normalize();
    const foreDir = handPos.clone().sub(forePos).normalize();

    // Swing the forearm toward the upper arm's line: a straight, longer arm.
    const wanted = foreDir.clone().lerp(upperDir, this.reachAmount).normalize();

    const delta = new THREE.Quaternion().setFromUnitVectors(foreDir, wanted);
    const parentQuat = new THREE.Quaternion();
    const worldQuat = new THREE.Quaternion();

    this.saveForRestore(fore);

    fore.parent?.getWorldQuaternion(parentQuat);
    fore.getWorldQuaternion(worldQuat);
    fore.quaternion.copy(
      parentQuat.invert().multiply(delta.multiply(worldQuat)),
    );
    fore.updateMatrixWorld(true);

    this.alignFistToAim(upper, hand);
  }

  /**
   * Raises or lowers the striking arm from the shoulder so the fist ends up on
   * the crosshair line (a touch above it), not at chest height below it.
   */
  private alignFistToAim(upper: THREE.Object3D, hand: THREE.Object3D): void {
    const head = this.group.getObjectByName("Head");

    if (!head) {
      return;
    }

    const groupQuat = this.group.getWorldQuaternion(new THREE.Quaternion());
    const forward = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(groupQuat)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.bodyYawOffset);

    forward.y = 0;
    forward.normalize();

    const pitch = THREE.MathUtils.clamp(this.aimPitch, -1.2, 1.2);
    const aim = forward
      .multiplyScalar(Math.cos(pitch))
      .add(new THREE.Vector3(0, Math.sin(pitch), 0));

    // The real camera position when there is one (first person): the head
    // swings as it looks up and down, so a fixed offset from it drifts.
    const eye =
      this.aimEye?.clone() ??
      head
        .getWorldPosition(new THREE.Vector3())
        .add(new THREE.Vector3(0, -0.08, 0));

    this.group.updateMatrixWorld(true);

    const shoulder = upper.getWorldPosition(new THREE.Vector3());
    const wrist = hand.getWorldPosition(new THREE.Vector3());
    const forearmDirection = wrist
      .clone()
      .sub((hand.parent ?? hand).getWorldPosition(new THREE.Vector3()))
      .normalize();

    // What you see is the knuckles, a little beyond the wrist bone.
    const fist = wrist.clone().addScaledVector(forearmDirection, 0.09);

    // The point on the crosshair line at the fist's depth.
    const depth = Math.max(0.3, fist.clone().sub(eye).dot(aim));
    const target = eye.clone().addScaledVector(aim, depth);

    const current = fist.clone().sub(shoulder).normalize();
    const wanted = target.sub(shoulder).normalize();

    const angle = current.angleTo(wanted);

    if (angle < 1e-3) {
      return;
    }

    // Never swing the arm more than ~40 degrees, whatever the geometry says.
    const k = Math.min(1, 0.7 / angle) * Math.min(1, this.reachAmount);
    const rotation = new THREE.Quaternion()
      .setFromUnitVectors(current, wanted)
      .slerp(new THREE.Quaternion(), 1 - k);

    const parentQuat = new THREE.Quaternion();
    const worldQuat = new THREE.Quaternion();

    this.saveForRestore(upper);

    upper.parent?.getWorldQuaternion(parentQuat);
    upper.getWorldQuaternion(worldQuat);
    upper.quaternion.copy(
      parentQuat.invert().multiply(rotation.multiply(worldQuat)),
    );
    upper.updateMatrixWorld(true);
  }

  /**
   * The striking shoulder sits ~20 cm off the crosshair line, so a straight
   * punch lands beside it. Turning the spine a few degrees toward the strike
   * side (right hand = turn left, left hand = turn right) brings the fist onto
   * the crosshair, and the head counter-turns to keep looking ahead.
   */
  private turnTowardCrosshair(side: 1 | -1): void {
    const total = side * 0.17 * this.reachAmount;
    const lean = 0.1 * this.reachAmount;
    const up = new THREE.Vector3(0, 1, 0);
    const parentQuat = new THREE.Quaternion();
    const worldQuat = new THREE.Quaternion();

    // A little forward lean at the strike pushes the shoulder out: more reach.
    const rightAxis = this.aimAxisLocal
      ? this.aimAxisLocal
          .clone()
          .applyQuaternion(
            this.group.getWorldQuaternion(new THREE.Quaternion()),
          )
      : null;
    const leanWeights: Record<string, number> = {
      Spine: 0.3,
      Spine1: 0.35,
      Spine2: 0.35,
    };

    const weights: Array<[string, number]> = [
      ["Spine", 0.3 * total],
      ["Spine1", 0.35 * total],
      ["Spine2", 0.35 * total],
      ["Neck", -0.3 * total],
      ["Head", -0.35 * total],
    ];

    for (const [name, angle] of weights) {
      const bone = this.group.getObjectByName(name);

      if (!bone || !bone.parent) {
        continue;
      }

      this.saveForRestore(bone);

      bone.parent.getWorldQuaternion(parentQuat);
      bone.getWorldQuaternion(worldQuat);

      const delta = new THREE.Quaternion().setFromAxisAngle(up, angle);

      if (rightAxis && leanWeights[name] !== undefined) {
        delta.multiply(
          new THREE.Quaternion().setFromAxisAngle(
            rightAxis,
            -lean * leanWeights[name],
          ),
        );
      }

      bone.quaternion.copy(
        parentQuat.invert().multiply(delta.multiply(worldQuat)),
      );
      bone.updateMatrixWorld(true);
    }
  }

  /**
   * Flinch from a hit: the upper body snaps back and eases out. `strength` is
   * roughly 0.4 (light) to 1.3 (heavy). A proper hit animation can replace this
   * later without changing the callers.
   */
  public playHitReaction(strength: number): void {
    this.hitRecoil.strength = strength;
    this.hitRecoil.time = 0;
  }

  private applyHitRecoil(dt: number): void {
    const recoil = this.hitRecoil;

    if (recoil.strength <= 0 || !this.aimAxisLocal) {
      return;
    }

    recoil.time += dt;

    const t = recoil.time / recoil.duration;

    if (t >= 1) {
      recoil.strength = 0;

      return;
    }

    // Quick snap back, then a slower return.
    const envelope = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
    const angle = -recoil.strength * 0.45 * envelope;

    const groupQuat = this.group.getWorldQuaternion(new THREE.Quaternion());
    const axis = this.aimAxisLocal.clone().applyQuaternion(groupQuat);
    const parentQuat = new THREE.Quaternion();
    const worldQuat = new THREE.Quaternion();

    this.group.updateMatrixWorld(true);

    const weights: Array<[string, number]> = [
      ["Spine", 0.25],
      ["Spine1", 0.3],
      ["Spine2", 0.25],
      ["Neck", 0.1],
      ["Head", 0.1],
    ];

    for (const [name, weight] of weights) {
      const bone = this.group.getObjectByName(name);

      if (!bone || !bone.parent) {
        continue;
      }

      this.saveForRestore(bone);

      bone.parent.getWorldQuaternion(parentQuat);
      bone.getWorldQuaternion(worldQuat);

      const delta = new THREE.Quaternion().setFromAxisAngle(
        axis,
        angle * weight,
      );

      bone.quaternion.copy(
        parentQuat.invert().multiply(delta.multiply(worldQuat)),
      );
      bone.updateMatrixWorld(true);
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
