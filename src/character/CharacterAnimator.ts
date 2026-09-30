import * as THREE from "three";

// Thin wrapper around THREE.AnimationMixer: clip discovery + crossfaded play/stop.
// No gameplay knowledge lives here — callers decide *when* a clip should play.
export class CharacterAnimator {
  private mixer: THREE.AnimationMixer | null = null;
  private readonly clips = new Map<string, THREE.AnimationClip>();
  private currentAction: THREE.AnimationAction | null = null;

  public setModel(root: THREE.Object3D, clips: THREE.AnimationClip[]): void {
    this.mixer = new THREE.AnimationMixer(root);
    this.clips.clear();
    this.currentAction = null;
    for (const clip of clips) {
      this.clips.set(clip.name, clip);
    }
  }

  public hasClip(name: string): boolean {
    return this.clips.has(name);
  }

  public getClipNames(): string[] {
    return Array.from(this.clips.keys());
  }

  public play(
    name: string,
    fadeDuration = 0.2,
    loop: THREE.AnimationActionLoopStyles = THREE.LoopRepeat,
  ): THREE.AnimationAction | null {
    if (!this.mixer) {
      return null;
    }
    const clip = this.clips.get(name);
    if (!clip) {
      console.warn(`CharacterAnimator: no clip named "${name}"`);
      return null;
    }

    const nextAction = this.mixer.clipAction(clip);
    nextAction.setLoop(loop, Infinity);
    nextAction.reset();

    if (this.currentAction && this.currentAction !== nextAction) {
      nextAction.play();
      this.currentAction.crossFadeTo(nextAction, fadeDuration, false);
    } else {
      nextAction.play();
    }

    this.currentAction = nextAction;
    return nextAction;
  }

  public stop(): void {
    this.mixer?.stopAllAction();
    this.currentAction = null;
  }

  public update(dt: number): void {
    this.mixer?.update(dt);
  }

  public dispose(): void {
    this.mixer?.stopAllAction();
    this.mixer?.uncacheRoot(this.mixer.getRoot());
    this.mixer = null;
    this.clips.clear();
    this.currentAction = null;
  }
}
