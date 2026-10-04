import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

import { CharacterModel } from './CharacterModel'
import { CharacterAnimator } from './CharacterAnimator'
import { CHARACTER_ASSET_PATH } from './CharacterConfig'

export class Character {
  public readonly group: THREE.Group
  public readonly animator: CharacterAnimator

  private readonly model: CharacterModel

  /**
   * ========================================================
   * ANIMATION FILES
   * ========================================================
   *
   * idle.glb:
   *   Clean normal idle pose + breathing.
   *
   * walk.glb:
   *   Clean Polyfork walking cycle.
   */
  private readonly idleAnimationPath =
    '/assets/animations/idle.glb'

  private readonly walkAnimationPath =
    '/assets/animations/walk.glb'

  /**
   * One mixer controls both animations.
   *
   * Both animations were authored for the same
   * Polyfork skeleton, so no retargeting is required.
   */
  private animationMixer:
    THREE.AnimationMixer | null = null

  private idleAction:
    THREE.AnimationAction | null = null

  private walkAction:
    THREE.AnimationAction | null = null

  /**
   * Currently active action.
   */
  private currentAction:
    THREE.AnimationAction | null = null

  /**
   * Short transition between idle and walking.
   */
  private readonly transitionDuration = 0.15

  /**
   * Model information.
   */
  private modelHeight = 0

  private modelGroundOffset = 0

  constructor() {
    this.model =
      new CharacterModel()

    this.animator =
      new CharacterAnimator()

    this.group =
      this.model.group

    this.group.name =
      'PlayerCharacter'
  }

  /**
   * ========================================================
   * LOAD CHARACTER
   * ========================================================
   */
  public async load(
    assetPath: string = CHARACTER_ASSET_PATH,
  ): Promise<boolean> {
    /**
     * Load the actual Polyfork character.
     */
    const loaded =
      await this.model.load(
        assetPath,
      )

    if (!loaded) {
      console.error(
        'Character: failed to load player model.',
      )

      return false
    }

    /**
     * Complete character remains visible.
     */
    this.model.group.visible =
      true

    /**
     * Existing embedded-animation system.
     *
     * player.glb currently has no embedded
     * animation, but keeping this is compatible
     * with the existing architecture.
     */
    this.animator.setModel(
      this.model.group,
      this.model.animations,
    )

    console.log(
      'Character: Polyfork model loaded.',
    )

    console.log(
      'Character: embedded animations:',
      this.model.animations.map(
        (clip) => clip.name,
      ),
    )

    /**
     * Keep feet exactly on the character root.
     */
    this.normalizeGroundPosition()

    /**
     * Load idle + walk.
     */
    await this.loadAnimations()

    /**
     * Print final model information.
     */
    this.debugModelBounds()

    return true
  }

  /**
   * ========================================================
   * LOADED
   * ========================================================
   */
  public get isLoaded(): boolean {
    return this.model.isLoaded
  }

  /**
   * ========================================================
   * MODEL HEIGHT
   * ========================================================
   */
  public get height(): number {
    return this.modelHeight
  }

  /**
   * ========================================================
   * GROUND OFFSET
   * ========================================================
   */
  public get groundOffset(): number {
    return this.modelGroundOffset
  }

  /**
   * ========================================================
   * TRANSFORM
   * ========================================================
   */
  public setTransform(
    position: THREE.Vector3,
    yaw: number,
  ): void {
    /**
     * Root represents the character's feet.
     */
    this.group.position.copy(
      position,
    )

    /**
     * Keep the character completely upright.
     *
     * Only Y rotation is allowed.
     */
    this.group.rotation.set(
      0,
      yaw,
      0,
    )
  }

  /**
   * ========================================================
   * SCENE
   * ========================================================
   */
  public addToScene(
    scene: THREE.Scene,
  ): void {
    scene.add(
      this.group,
    )
  }

  public removeFromScene(
    scene: THREE.Scene,
  ): void {
    scene.remove(
      this.group,
    )
  }

  /**
   * ========================================================
   * UPDATE
   * ========================================================
   */
  public update(
    dt: number,
    isMoving: boolean = false,
  ): void {
    /**
     * Existing embedded animation system.
     */
    this.animator.update(
      dt,
    )

    /**
     * Native Polyfork animations.
     */
    if (
      this.animationMixer
    ) {
      this.animationMixer.update(
        dt,
      )
    }

    /**
     * Choose animation based on movement.
     */
    if (isMoving) {
      this.playWalk()
    } else {
      this.playIdle()
    }
  }

  /**
   * ========================================================
   * IDLE
   * ========================================================
   */
  private playIdle(): void {
    if (
      !this.idleAction
    ) {
      return
    }

    /**
     * Already playing idle.
     */
    if (
      this.currentAction ===
      this.idleAction
    ) {
      return
    }

    this.switchAction(
      this.idleAction,
    )
  }

  /**
   * ========================================================
   * WALK
   * ========================================================
   */
  private playWalk(): void {
    if (
      !this.walkAction
    ) {
      return
    }

    /**
     * Already walking.
     */
    if (
      this.currentAction ===
      this.walkAction
    ) {
      return
    }

    this.switchAction(
      this.walkAction,
    )
  }

  /**
   * ========================================================
   * SWITCH ACTION
   * ========================================================
   *
   * Handles smooth Idle <-> Walk transitions.
   */
  private switchAction(
    nextAction: THREE.AnimationAction,
  ): void {
    if (
      !this.animationMixer
    ) {
      return
    }

    /**
     * Make sure the new action is configured
     * correctly.
     */
    nextAction.enabled =
      true

    nextAction.setLoop(
      THREE.LoopRepeat,
      Infinity,
    )

    nextAction.clampWhenFinished =
      false

    /**
     * First animation:
     *
     * Just start it.
     */
    if (
      !this.currentAction
    ) {
      nextAction.reset()

      nextAction.play()

      this.currentAction =
        nextAction

      return
    }

    /**
     * Smoothly transition from the old
     * animation to the new animation.
     */
    nextAction.reset()

    nextAction.play()

    nextAction.crossFadeFrom(
      this.currentAction,
      this.transitionDuration,
      true,
    )

    this.currentAction =
      nextAction
  }

  /**
   * ========================================================
   * LOAD ANIMATIONS
   * ========================================================
   */
  private async loadAnimations(): Promise<void> {
    /**
     * Find the actual Polyfork skeleton.
     */
    const targetMesh =
      this.findTargetMesh()

    if (!targetMesh) {
      console.error(
        'Character: Polyfork SkinnedMesh not found.',
      )

      return
    }

    console.log(
      'Character: Polyfork target mesh:',
      targetMesh.name,
    )

    console.log(
      'Character: Polyfork target bones:',
      targetMesh.skeleton.bones.length,
    )

    /**
     * ====================================================
     * ANIMATION MIXER
     * ====================================================
     *
     * We use the complete character group as the mixer
     * root.
     *
     * The GLB animations were authored directly for this
     * Polyfork skeleton.
     */
    this.animationMixer =
      new THREE.AnimationMixer(
        this.model.group,
      )

    console.log(
      'Character: AnimationMixer created on Polyfork group.',
    )

    /**
     * Load clean idle.
     */
    await this.loadDirectAnimation(
      this.idleAnimationPath,
      'Idle',
      (action) => {
        this.idleAction =
          action
      },
    )

    /**
     * Load clean walk.
     */
    await this.loadDirectAnimation(
      this.walkAnimationPath,
      'Walk',
      (action) => {
        this.walkAction =
          action
      },
    )

    /**
     * Start in idle.
     */
    if (
      this.idleAction
    ) {
      this.idleAction.reset()

      this.idleAction.setLoop(
        THREE.LoopRepeat,
        Infinity,
      )

      this.idleAction.play()

      this.currentAction =
        this.idleAction

      console.log(
        'Character: Idle started.',
      )
    }

    console.log(
      'Character: animation setup complete.',
    )

    console.log(
      'Character: idle loaded:',
      Boolean(
        this.idleAction,
      ),
    )

    console.log(
      'Character: walk loaded:',
      Boolean(
        this.walkAction,
      ),
    )
  }

  /**
   * ========================================================
   * DIRECT GLB ANIMATION LOADER
   * ========================================================
   */
  private async loadDirectAnimation(
    path: string,
    expectedName: string,
    assignAction: (
      action: THREE.AnimationAction,
    ) => void,
  ): Promise<void> {
    if (
      !this.animationMixer
    ) {
      console.error(
        `Character: cannot load ${expectedName}; animation mixer missing.`,
      )

      return
    }

    const loader =
      new GLTFLoader()

    console.log(
      `Character: loading ${expectedName} animation:`,
      path,
    )

    try {
      const gltf =
        await loader.loadAsync(
          path,
        )

      console.log(
        `Character: ${expectedName} GLB loaded.`,
      )

      console.log(
        `Character: ${expectedName} GLB animations:`,
        gltf.animations.map(
          (clip) => ({
            name:
              clip.name,

            duration:
              clip.duration,

            tracks:
              clip.tracks.length,
          }),
        ),
      )

      /**
       * Find the requested animation.
       */
      const clip =
        gltf.animations.find(
          (animation) =>
            animation.name ===
            expectedName,
        )

      if (!clip) {
        console.error(
          `Character: ${expectedName} animation not found in ${path}.`,
          gltf.animations.map(
            (animation) =>
              animation.name,
          ),
        )

        return
      }

      /**
       * Create action using the same mixer
       * and the actual Polyfork character.
       */
      const action =
        this.animationMixer.clipAction(
          clip,
        )

      action.setLoop(
        THREE.LoopRepeat,
        Infinity,
      )

      action.clampWhenFinished =
        false

      /**
       * Assign to idle/walk property.
       */
      assignAction(
        action,
      )

      console.log(
        `Character: ${expectedName} action created successfully.`,
      )
    } catch (error) {
      console.error(
        `Character: failed to load ${expectedName} animation:`,
        path,
        error,
      )
    }
  }

  /**
   * ========================================================
   * FIND TARGET MESH
   * ========================================================
   */
  private findTargetMesh():
    THREE.SkinnedMesh | null {
    let targetMesh:
      THREE.SkinnedMesh | null =
        null

    this.model.group.traverse(
      (object) => {
        if (
          targetMesh
        ) {
          return
        }

        if (
          object instanceof
          THREE.SkinnedMesh
        ) {
          targetMesh =
            object
        }
      },
    )

    return targetMesh
  }

  /**
   * ========================================================
   * GROUND NORMALIZATION
   * ========================================================
   */
  private normalizeGroundPosition(): void {
    this.model.group.updateMatrixWorld(
      true,
    )

    const bounds =
      new THREE.Box3().setFromObject(
        this.model.group,
      )

    if (
      !Number.isFinite(
        bounds.min.y,
      )
    ) {
      console.warn(
        'Character: unable to calculate model ground position.',
      )

      return
    }

    /**
     * Move model so lowest point is Y = 0.
     */
    this.modelGroundOffset =
      -bounds.min.y

    this.model.group.position.y +=
      this.modelGroundOffset

    /**
     * Recalculate bounds.
     */
    this.model.group.updateMatrixWorld(
      true,
    )

    const correctedBounds =
      new THREE.Box3().setFromObject(
        this.model.group,
      )

    this.modelHeight =
      correctedBounds.max.y -
      correctedBounds.min.y

    console.log(
      'Character: ground normalization:',
      {
        originalMinY:
          bounds.min.y,

        appliedOffset:
          this.modelGroundOffset,

        correctedMinY:
          correctedBounds.min.y,

        height:
          this.modelHeight,
      },
    )
  }

  /**
   * ========================================================
   * DEBUG MODEL BOUNDS
   * ========================================================
   */
  private debugModelBounds(): void {
    this.group.updateMatrixWorld(
      true,
    )

    const bounds =
      new THREE.Box3().setFromObject(
        this.group,
      )

    const size =
      new THREE.Vector3()

    bounds.getSize(
      size,
    )

    console.log(
      '========== CHARACTER BOUNDS ==========',
    )

    console.log(
      'SIZE:',
      size.toArray(),
    )

    console.log(
      'MIN:',
      bounds.min.toArray(),
    )

    console.log(
      'MAX:',
      bounds.max.toArray(),
    )

    console.log(
      'HEIGHT:',
      this.modelHeight,
    )

    console.log(
      'GROUND OFFSET:',
      this.modelGroundOffset,
    )

    console.log(
      '======================================',
    )
  }

  /**
   * ========================================================
   * DISPOSE
   * ========================================================
   */
  public dispose(): void {
    if (
      this.animationMixer
    ) {
      this.animationMixer.stopAllAction()

      this.animationMixer =
        null
    }

    this.idleAction =
      null

    this.walkAction =
      null

    this.currentAction =
      null

    this.animator.dispose()

    this.model.dispose()
  }
}