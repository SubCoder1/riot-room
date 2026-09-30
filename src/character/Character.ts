import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";

import { CharacterModel } from "./CharacterModel";
import { CharacterAnimator } from "./CharacterAnimator";
import { CHARACTER_ASSET_PATH } from "./CharacterConfig";

interface BoneBinding {
  target: THREE.Bone;
  source: THREE.Bone;
  sourceBindQuaternion: THREE.Quaternion;
  targetBindQuaternion: THREE.Quaternion;
}

export class Character {
  public readonly group: THREE.Group;
  public readonly animator: CharacterAnimator;

  private readonly model: CharacterModel;

  private animationMixer: THREE.AnimationMixer | null = null;

  private idleAction: THREE.AnimationAction | null = null;

  private readonly idleAnimationPath = "/assets/animations/idle.fbx";

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

    await this.loadIdleAnimation();

    return true;
  }

  public get isLoaded(): boolean {
    return this.model.isLoaded;
  }

  public setTransform(position: THREE.Vector3, yaw: number): void {
    this.group.position.copy(position);
    this.group.rotation.set(0, yaw, 0);
  }

  public addToScene(scene: THREE.Scene): void {
    scene.add(this.group);
  }

  public removeFromScene(scene: THREE.Scene): void {
    scene.remove(this.group);
  }

  public update(dt: number): void {
    this.animator.update(dt);

    if (this.animationMixer) {
      this.animationMixer.update(dt);
    }
  }

  public dispose(): void {
    if (this.animationMixer) {
      this.animationMixer.stopAllAction();
      this.animationMixer = null;
    }

    this.idleAction = null;

    this.animator.dispose();
    this.model.dispose();
  }

  private async loadIdleAnimation(): Promise<void> {
    const loader = new FBXLoader();

    try {
      console.log("Character: loading Mixamo idle:", this.idleAnimationPath);

      const fbx = await loader.loadAsync(this.idleAnimationPath);

      if (fbx.animations.length === 0) {
        console.error("Character: no Mixamo animation found.");

        return;
      }

      const sourceClip = fbx.animations[0];

      console.log("Character: Mixamo clip:", sourceClip.name);

      console.log("Character: Mixamo duration:", sourceClip.duration);

      console.log("Character: Mixamo tracks:", sourceClip.tracks.length);

      /*
       * ------------------------------------------
       * FIND MIXAMO BONES
       * ------------------------------------------
       */

      const sourceBones = this.findBones(fbx);

      console.log("Character: Mixamo bones:", sourceBones.length);

      /*
       * ------------------------------------------
       * FIND POLYFORK MESH
       * ------------------------------------------
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

      /*
       * ------------------------------------------
       * BONE MAP
       * ------------------------------------------
       */

      const boneMap: Record<string, string> = {
        Hips: "mixamorigHips",

        Spine: "mixamorigSpine",

        Spine1: "mixamorigSpine1",

        Spine2: "mixamorigSpine2",

        Neck: "mixamorigNeck",

        Head: "mixamorigHead",

        LeftShoulder: "mixamorigLeftShoulder",

        LeftArm: "mixamorigLeftArm",

        LeftForeArm: "mixamorigLeftForeArm",

        LeftHand: "mixamorigLeftHand",

        RightShoulder: "mixamorigRightShoulder",

        RightArm: "mixamorigRightArm",

        RightForeArm: "mixamorigRightForeArm",

        RightHand: "mixamorigRightHand",

        LeftUpLeg: "mixamorigLeftUpLeg",

        LeftLeg: "mixamorigLeftLeg",

        LeftFoot: "mixamorigLeftFoot",

        LeftToeBase: "mixamorigLeftToeBase",

        RightUpLeg: "mixamorigRightUpLeg",

        RightLeg: "mixamorigRightLeg",

        RightFoot: "mixamorigRightFoot",

        RightToeBase: "mixamorigRightToeBase",
      };

      /*
       * ------------------------------------------
       * CREATE BINDINGS
       * ------------------------------------------
       */

      const bindings: BoneBinding[] = [];

      for (const targetName of Object.keys(boneMap)) {
        const sourceName = boneMap[targetName];

        const targetBone = polyforkMesh.skeleton.bones.find(
          (bone) => bone.name === targetName,
        );

        const sourceBone = sourceBones.find((bone) => bone.name === sourceName);

        if (!targetBone || !sourceBone) {
          continue;
        }

        bindings.push({
          target: targetBone,
          source: sourceBone,

          sourceBindQuaternion: sourceBone.quaternion.clone(),

          targetBindQuaternion: targetBone.quaternion.clone(),
        });
      }

      console.log("Character: rotation bindings:", bindings.length);

      /*
       * ------------------------------------------
       * CREATE ROTATION-ONLY RETARGET
       * ------------------------------------------
       *
       * IMPORTANT:
       *
       * We deliberately DO NOT copy position
       * animation from Mixamo.
       *
       * Polyfork keeps its own bone positions.
       *
       * This prevents Mixamo's large FBX scale
       * from moving the Polyfork character.
       *
       * Formula:
       *
       * target animation =
       * target bind rotation
       * ×
       * inverse(source bind rotation)
       * ×
       * source animation rotation
       *
       * ------------------------------------------
       */

      const tracks: THREE.KeyframeTrack[] = [];

      for (const binding of bindings) {
        const sourceName = binding.source.name;

        const sourceTrack = sourceClip.tracks.find(
          (track) => track.name === `${sourceName}.quaternion`,
        );

        if (!sourceTrack) {
          continue;
        }

        const values = sourceTrack.values;

        const outputValues = new Float32Array(values.length);

        const inverseSourceBind = binding.sourceBindQuaternion.clone().invert();

        const sourceAnimation = new THREE.Quaternion();

        const animationDelta = new THREE.Quaternion();

        const targetAnimation = new THREE.Quaternion();

        for (let i = 0; i < values.length; i += 4) {
          sourceAnimation.set(
            values[i],
            values[i + 1],
            values[i + 2],
            values[i + 3],
          );

          /*
           * Calculate Mixamo movement
           * relative to Mixamo's bind pose.
           */
          animationDelta.copy(inverseSourceBind).multiply(sourceAnimation);

          /*
           * Apply that movement to
           * Polyfork's bind pose.
           */
          targetAnimation
            .copy(binding.targetBindQuaternion)
            .multiply(animationDelta)
            .normalize();

          outputValues[i] = targetAnimation.x;

          outputValues[i + 1] = targetAnimation.y;

          outputValues[i + 2] = targetAnimation.z;

          outputValues[i + 3] = targetAnimation.w;
        }

        tracks.push(
          new THREE.QuaternionKeyframeTrack(
            `${binding.target.name}.quaternion`,
            sourceTrack.times,
            outputValues,
          ),
        );
      }

      console.log("Character: rotation tracks created:", tracks.length);

      /*
       * ------------------------------------------
       * CREATE CLIP
       * ------------------------------------------
       */

      const retargetedClip = new THREE.AnimationClip(
        "Idle",
        sourceClip.duration,
        tracks,
      );

      /*
       * ------------------------------------------
       * RESET POLYFORK
       * ------------------------------------------
       */

      polyforkMesh.skeleton.pose();

      this.model.group.visible = true;

      /*
       * ------------------------------------------
       * MIXER
       * ------------------------------------------
       */

      this.animationMixer = new THREE.AnimationMixer(polyforkMesh);

      this.idleAction = this.animationMixer.clipAction(retargetedClip);

      this.idleAction.setLoop(THREE.LoopOnce, 1);

      this.idleAction.clampWhenFinished = true;

      this.idleAction.reset();
      this.idleAction.play();

      console.log("Character: rotation-only idle started.");
    } catch (error) {
      console.error("Character: idle animation failed:", error);
    }
  }

  private findBones(root: THREE.Object3D): THREE.Bone[] {
    const bones: THREE.Bone[] = [];

    root.traverse((object) => {
      if (object instanceof THREE.Bone) {
        bones.push(object);
      }
    });

    return bones;
  }
}
