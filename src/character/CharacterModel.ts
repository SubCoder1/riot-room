import * as THREE from "three";
import {
  GLTFLoader,
  type GLTF,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

// Loads and caches the humanoid character GLB (one network fetch per asset path, shared by
// every Character/FirstPersonCharacter instance) and hands back an independent skinned clone
// so multiple on-screen characters can animate separately.
export class CharacterModel {
  private static readonly loader = new GLTFLoader();
  private static readonly gltfCache = new Map<string, Promise<GLTF>>();

  public readonly group: THREE.Group;
  public animations: THREE.AnimationClip[] = [];
  public isLoaded = false;

  constructor() {
    this.group = new THREE.Group();
  }

  public async load(assetPath: string): Promise<boolean> {
    try {
      const gltf = await CharacterModel.fetchGltf(assetPath);
      const root = cloneSkeleton(gltf.scene) as THREE.Object3D;

      root.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      this.group.add(root);
      this.animations = gltf.animations;
      this.isLoaded = true;
      return true;
    } catch (error) {
      console.error(
        `CharacterModel: failed to load character asset "${assetPath}"`,
        error,
      );
      this.isLoaded = false;
      return false;
    }
  }

  public dispose(): void {
    this.group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }
      child.geometry.dispose();
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      materials.forEach((material) => material.dispose());
    });
    this.group.clear();
  }

  private static fetchGltf(assetPath: string): Promise<GLTF> {
    let pending = CharacterModel.gltfCache.get(assetPath);
    if (!pending) {
      pending = CharacterModel.loader.loadAsync(assetPath);
      // Don't poison the cache with a rejected load — a later retry (e.g. after the asset is added) should try again.
      pending.catch(() => CharacterModel.gltfCache.delete(assetPath));
      CharacterModel.gltfCache.set(assetPath, pending);
    }
    return pending;
  }
}
